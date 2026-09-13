import type { SeatingPlan } from '../seating'

/**
 * The rule contract every `*.rule.ts` file implements. Named `contract.ts`, not `rule.ts`, so
 * `registry.ts`'s own `./*.rule.ts` glob cannot pick this file up as a rule.
 */

export type Severity = 'hard' | 'soft'
export type Remedy = 'seating' | 'flag'

/**
 * What a hard, remedy:'seating' rule is judged against — the only kind `seatGuardFrom` ever
 * calls, before `allocate.ts`'s solver has finished and while there is no real guest list to
 * give it (see `PlanSoFar` there). Such a rule's `evaluate` may ask for nothing more than this.
 */
export type GuardPlan = Pick<SeatingPlan, 'tables'>

/**
 * What every other rule is judged against — the settled plan, guest list included and mandatory.
 * A rule whose denominator comes from the guest list must fail to compile against a plan that
 * omits one; an earlier version of this file made `unseated` optional and that is what let TT-16's
 * original defect back in through every entry point.
 */
export type RulePlan = Pick<SeatingPlan, 'tables' | 'unseated'>

/**
 * What a rule reports. `severity`, `remedy` and `ruleId` are not here — the engine stamps them
 * on from the rule's own declaration, so one rule can never emit a hard finding from underneath
 * a soft one.
 *
 * `guestIds` is load-bearing: it is how `seatGuardFrom` decides a candidate seat is part of what
 * a finding is wrong about. A hard seating rule that leaves it empty detects but never vetoes.
 */
export type Finding = {
  tableIds: readonly string[]
  guestIds: readonly string[]
  message: string
  detail?: string
}

export type Violation = Finding & { ruleId: string; severity: Severity; remedy: Remedy }

/** What `evaluate` returns, from one pass over one plan so the three fields cannot disagree.
 *  `findings.length <= missed <= opportunities` must hold for every rule, by construction of the
 *  counting — `registry.test.ts` checks it against several fixtures, which narrows but does not
 *  prove it for a rule not on that list. */
export type RuleAssessment = {
  /** What is wrong with the seating as it stands — the violations panel's input. */
  findings: readonly Finding[]
  /** How many chances this GUEST LIST gave the rule — never a function of how much of the plan
   *  is filled in, or an incomplete plan could outscore a complete one (TT-16). A soft rule
   *  reporting 0 here alongside real findings drops silently out of the score. */
  opportunities: number
  /** How many of those chances this plan did not take — the score's numerator, never
   *  `findings.length`: an unseated partner pair is a chance missed, not a seating fault. */
  missed: number
}

/** The weight a rule carries in the plan score when it does not declare one (TT-16). */
export const DEFAULT_RULE_WEIGHT = 1

type RuleFields = {
  id: string
  /** The rule's own account of what it requires. User-facing (TT-16): rendered verbatim as a
   *  dimension's label in the score breakdown, so it is written for a person reading the Plan
   *  screen, not only for a developer reading the folder. */
  description: string
  /**
   * Read only for soft rules, as the weight this rule carries in the plan's weighted-mean score
   * (TT-16). Declared here, in the rule's own file, so weighting never needs a shared table
   * (AGENTS.md). Defaults to `DEFAULT_RULE_WEIGHT`. A non-finite, zero or negative value is
   * treated as the default rather than throwing — this seam is a workshop surface several people
   * add rules to at once, and a typo taking the whole Plan screen down mid-session is worse than
   * a mis-weighted score.
   */
  weight?: number
}

/**
 * A hard, remedy:'seating' rule — `seatGuardFrom` filters to exactly this shape, and only this
 * shape, so its `evaluate` is typed to accept `GuardPlan` and nothing wider: it can never be
 * handed a guest list, and so can never require one.
 */
export type GuardableRule = RuleFields & {
  severity: 'hard'
  remedy: 'seating'
  evaluate: (plan: GuardPlan) => RuleAssessment
}

/**
 * Every rule that is not both hard and remedy:'seating'. Reported and scored on the settled plan
 * only — the guard never asks one of these a speculative question — so its `evaluate` may require
 * the guest list.
 */
type ReportedRule = RuleFields &
  ({ severity: 'hard'; remedy: 'flag' } | { severity: 'soft'; remedy: 'seating' } | { severity: 'soft'; remedy: 'flag' }) & {
    evaluate: (plan: RulePlan) => RuleAssessment
  }

/**
 * A self-contained rule. `remedy: 'seating'` means a solver can satisfy it by moving people;
 * `'flag'` means only flagging the plan does — the guard reads this to tell the two apart.
 */
export type SeatingRule = GuardableRule | ReportedRule
