import { REGISTERED_RULES } from './registry'

/**
 * TT-53: how many rules the Fit figure's weighted mean was actually measured over, against how
 * many the specification declares. Named `ruleCoverage.ts`, not `*.rule.ts` — `registry.ts`'s own
 * glob would otherwise pick this file up and expect it to export `rule: SeatingRule` (see that
 * file's header comment and `contract.ts`'s, for the same reason). And `RuleCoverage`, never
 * `PlanCoverage` — `score.ts` already owns that name for TT-48's seated-guest fraction, a
 * different question answered in the same folder.
 */

/**
 * What the specification declares: the rules listed on KB-2, hard and soft together. Counted off
 * that page rather than enumerated here — a hand-copied list would go stale, which is the failure
 * this constant exists to make visible rather than repeat.
 *
 * Deliberately not exported, so `ruleCoverage()` stays the only seam onto this figure and no
 * caller can do its own arithmetic on the raw constant.
 */
const RULES_SPECIFIED = 10

export type RuleCoverage = {
  /** Rules the Fit figure was actually measured over. `REGISTERED_RULES.length`, read fresh on
   *  every call, so a new `*.rule.ts` file raises this with no edit anywhere in this file — the
   *  discovery property `registry.ts` exists to hold (TT-14; AGENTS.md). */
  registered: number
  /** Rules the specification declares. See `RULES_SPECIFIED` above for what the number is made
   *  of and why it is not yet nine. */
  declared: number
}

/**
 * Pairs the two counts the Plan screen's coverage line needs. Not `src/screens/`'s to compute:
 * the declared count is a fact about the specification and the numerator already lives in this
 * folder, so pairing them here leaves the UI side of the domain boundary with no arithmetic of
 * its own about rules (docs/engineering-standards.md).
 */
export function ruleCoverage(): RuleCoverage {
  return {
    registered: REGISTERED_RULES.length,
    declared: RULES_SPECIFIED,
  }
}
