import type { Guest } from '../types'
import type { SeatCandidate, SeatGuard } from '../allocate'
import type { RulePlan, SeatingRule, Violation } from './contract'

/**
 * Evaluation, the hard/soft split, and the guard `allocate.ts`'s fill can consult. Every
 * function here takes an explicit rule array — `registry.ts` is the only file that knows about
 * the glob — so the whole engine is testable against fixture rules with no build-time discovery
 * involved.
 */

export type RuleReport = { violations: readonly Violation[]; ruleCount: number }

/** Walks `rules` in the given order and stamps each finding with its rule's own declaration. */
export function evaluatePlan(plan: RulePlan, rules: readonly SeatingRule[]): RuleReport {
  const violations: Violation[] = []

  for (const rule of rules) {
    for (const finding of rule.evaluate(plan)) {
      violations.push({ ...finding, ruleId: rule.id, severity: rule.severity, remedy: rule.remedy })
    }
  }

  return { violations, ruleCount: rules.length }
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
 */
export function withSeat(plan: RulePlan, tableId: string, seatIndex: number, guest: Guest): RulePlan {
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

/**
 * Filters to the rules a solver can act on (`severity === 'hard' && remedy === 'seating'`) — a
 * hard `remedy: 'flag'` rule must never send auto-allocate hunting for a seat that does not
 * exist. Allows every seat when that set is empty, mirroring `allocate.ts`'s own "no rules
 * registered yet" default.
 *
 * Asks the rule's own `evaluate` a speculative question over `withSeat(...)` rather than a
 * second `allowsSeat` function per rule: two functions per rule are two things to keep in step,
 * and one `evaluate` over a hypothetical plan cannot disagree with itself.
 */
export function seatGuardFrom(rules: readonly SeatingRule[]): SeatGuard {
  const guardRules = rules.filter((rule) => rule.severity === 'hard' && rule.remedy === 'seating')
  if (guardRules.length === 0) {
    return () => true
  }

  return (candidate: SeatCandidate) => {
    const hypothetical = withSeat(candidate.plan, candidate.tableId, candidate.seatIndex, candidate.guest)

    return !guardRules.some((rule) =>
      rule
        .evaluate(hypothetical)
        .some(
          (finding) =>
            finding.tableIds.includes(candidate.tableId) && finding.guestIds.includes(candidate.guest.id),
        ),
    )
  }
}
