import type { SeatingPlan } from '../seating'

/**
 * The rule contract every `*.rule.ts` file implements. Named `contract.ts`, not `rule.ts`, so
 * `registry.ts`'s own `./*.rule.ts` glob cannot pick this file up as a rule.
 */

export type Severity = 'hard' | 'soft'
export type Remedy = 'seating' | 'flag'

/** What a rule judges. `unseated` is deliberately absent: a rule also runs mid-fill. */
export type RulePlan = Pick<SeatingPlan, 'tables'>

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

/**
 * A self-contained rule. `remedy: 'seating'` means a solver can satisfy it by moving people;
 * `'flag'` means only flagging the plan does — the guard reads this to tell the two apart.
 */
export type SeatingRule = {
  id: string
  severity: Severity
  remedy: Remedy
  description: string
  evaluate: (plan: RulePlan) => readonly Finding[]
}
