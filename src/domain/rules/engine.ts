import type { Guest } from '../types'
import type { SeatCandidate, SeatGuard } from '../allocate'
import type { GuardPlan, GuardableRule, RulePlan, SeatingRule, Severity, Violation } from './contract'
import { DEFAULT_RULE_WEIGHT } from './contract'

/**
 * Evaluation, the hard/soft split, and the guard `allocate.ts`'s fill can consult. Every
 * function here takes an explicit rule array — `registry.ts` is the only file that knows about
 * the glob — so the whole engine is testable against fixture rules with no build-time discovery
 * involved.
 */

export type RuleOutcome = {
  ruleId: string
  severity: Severity
  /** The rule's own `description`, carried so the breakdown can label a dimension without any
   *  reader naming a rule (TT-16). */
  description: string
  /** Already defaulted — `rule.weight ?? DEFAULT_RULE_WEIGHT`. Not yet coerced; score.ts owns
   *  normalising a non-finite, zero or negative value. */
  weight: number
  /** Carried straight from `RuleAssessment.opportunities` (`contract.ts`) — a property of the
   *  guest list, not of how much of the plan is filled in. */
  opportunities: number
  /** Carried straight from `RuleAssessment.missed` (`contract.ts`) — the score's numerator.
   *  Never `findings.length`; see that type for why the two differ. */
  missed: number
}

export type RuleReport = {
  violations: readonly Violation[]
  ruleCount: number
  /** One entry per rule given, in the order given. `outcomes.length === ruleCount` by
   *  construction. */
  outcomes: readonly RuleOutcome[]
}

/**
 * Walks `rules` in the given order, stamps each finding with its rule's own declaration, and
 * records one outcome per rule whether or not it fired. `violations`, `ruleCount` and `outcomes`
 * all come from this one walk, so none of them can drift from the others.
 */
export function evaluatePlan(plan: RulePlan, rules: readonly SeatingRule[]): RuleReport {
  const violations: Violation[] = []
  const outcomes: RuleOutcome[] = []

  for (const rule of rules) {
    const assessment = rule.evaluate(plan)

    for (const finding of assessment.findings) {
      violations.push({ ...finding, ruleId: rule.id, severity: rule.severity, remedy: rule.remedy })
    }

    outcomes.push({
      ruleId: rule.id,
      severity: rule.severity,
      description: rule.description,
      weight: rule.weight ?? DEFAULT_RULE_WEIGHT,
      opportunities: assessment.opportunities,
      missed: assessment.missed,
    })
  }

  return { violations, ruleCount: rules.length, outcomes }
}

/**
 * The one definition of "which violations are hard". Every reader — the panel, the guard, the
 * count below — goes through this rather than re-filtering `report.violations` itself.
 */
export function hardViolations(report: RuleReport): readonly Violation[] {
  return report.violations.filter((violation) => violation.severity === 'hard')
}

export function softViolations(report: RuleReport): readonly Violation[] {
  return report.violations.filter((violation) => violation.severity === 'soft')
}

export function hardViolationCount(report: RuleReport): number {
  return hardViolations(report).length
}

export function tablesWithHardViolation(report: RuleReport): ReadonlySet<string> {
  const ids = new Set<string>()
  for (const violation of hardViolations(report)) {
    for (const tableId of violation.tableIds) {
      ids.add(tableId)
    }
  }
  return ids
}

/**
 * A new plan with one seat filled — every other table shared by reference, not copied. Throws
 * when `tableId` names no table, mirroring `seating.ts`'s `tableFor`: the solver only ever offers
 * a real id, and silently allowing an unknown one would hide a bug rather than surface it.
 *
 * Takes and returns `GuardPlan`, not `RulePlan`: its only caller is `seatGuardFrom`, below, whose
 * hypothetical plan has no guest list to carry in the first place.
 */
export function withSeat(plan: GuardPlan, tableId: string, seatIndex: number, guest: Guest): GuardPlan {
  const table = plan.tables.find((candidate) => candidate.id === tableId)
  if (!table) {
    throw new Error(`withSeat: no table built for ${tableId}`)
  }

  const seats = table.seats.slice()
  seats[seatIndex] = { guest, pinned: false }

  return {
    tables: plan.tables.map((candidate) => (candidate.id === tableId ? { ...table, seats } : candidate)),
  }
}

/** `rule.severity === 'hard' && rule.remedy === 'seating'`, narrowed to `GuardableRule` so its
 *  `evaluate` is callable on a bare `GuardPlan` — see `contract.ts`. */
function isGuardable(rule: SeatingRule): rule is GuardableRule {
  return rule.severity === 'hard' && rule.remedy === 'seating'
}

/**
 * Filters to the rules a solver can act on — a hard `remedy: 'flag'` rule must never send
 * auto-allocate hunting for a seat that does not exist. Allows every seat when that set is empty,
 * mirroring `allocate.ts`'s own "no rules registered yet" default.
 *
 * Asks the rule's own `evaluate` a speculative question over `withSeat(...)` rather than a
 * second `allowsSeat` function per rule: two functions per rule are two things to keep in step,
 * and one `evaluate` over a hypothetical plan cannot disagree with itself.
 */
export function seatGuardFrom(rules: readonly SeatingRule[]): SeatGuard {
  const guardRules = rules.filter(isGuardable)
  if (guardRules.length === 0) {
    return () => true
  }

  return (candidate: SeatCandidate) => {
    const hypothetical = withSeat(candidate.plan, candidate.tableId, candidate.seatIndex, candidate.guest)

    return !guardRules.some((rule) =>
      rule
        .evaluate(hypothetical)
        .findings.some(
          (finding) =>
            finding.tableIds.includes(candidate.tableId) && finding.guestIds.includes(candidate.guest.id),
        ),
    )
  }
}
