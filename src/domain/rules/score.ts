import type { Severity } from './contract'
import { defaultWeightFor } from './contract'
import type { RuleOutcome, RuleReport } from './engine'

/**
 * The plan fit score (TT-16, reworked by TT-46): one number, 0-100, over every registered rule,
 * hard and soft alike (KB-8 "The arithmetic"). Named `score.ts`, which `registry.ts`'s
 * `./*.rule.ts` glob cannot match — the same reason `contract.ts` carries that name.
 */

export type ScoreDimension = {
  ruleId: string
  /** The rule's own description. The only label the breakdown has, and the only one it needs. */
  description: string
  /** Carried onto the dimension so the breakdown can order hard before soft, and label each row,
   *  with no lookup back to the rule (TT-46). */
  severity: Severity
  weight: number
  opportunities: number
  /** Chances this rule's opportunities included that this plan did not take — the exact,
   *  unrounded fact `fit` is rounded from. Never `findings.length`: see `RuleAssessment.missed`
   *  in `contract.ts` for why an unseated partner pair counts here without ever becoming a
   *  finding. Normalised the same way as `opportunities`: a non-finite or negative value becomes
   *  0 rather than reaching `fit` or the rendered count as `NaN` or a fraction. */
  missed: number
  /** 1 − missed ÷ opportunities, clamped to 0..1. */
  fit: number
}

export type PlanScore = {
  /** 0-100, or null when no rule had an opportunity to be satisfied (TT-16). Never 0 for
   *  "nothing to say". Plainly rounded: 100 means the weighted mean rounds to 100, never that
   *  the plan carries no violation — the breakdown's exact missed counts are where a finding
   *  behind a rounded 100 is visible. There is no cap and no floor. This is never permission to
   *  publish: that is `isPublishable(report)` in `engine.ts`, a function of the report alone, and
   *  `PlanScore` deliberately carries no `publishable` field for it to read (TT-46, KB-8 "The
   *  score is not permission"). */
  score: number | null
  /** Hard dimensions before soft, worst first within each: weight × (1 − fit) descending, ruleId
   *  ascending as tie-break (TT-46 A9; TT-16's original order kept as the secondary sort). A rule
   *  with no opportunities, at either severity, is not here. */
  dimensions: readonly ScoreDimension[]
}

function clamp01(value: number): number {
  return Math.min(1, Math.max(0, value))
}

/** Mirrors `seating.ts`'s private `normaliseCount` (verified not exported at
 *  `src/domain/seating.ts:33`) rather than widening that file's surface for a different
 *  question. */
function normaliseCount(value: number): number {
  return Number.isFinite(value) ? Math.max(0, Math.trunc(value)) : 0
}

/** A finite value greater than 0 is used as given; anything else — non-finite, zero or
 *  negative — becomes that severity's default. Mirrors the coercion `RuleOutcome.weight`'s doc
 *  comment promises but does not itself perform. */
function normaliseWeight(value: number, severity: Severity): number {
  return Number.isFinite(value) && value > 0 ? value : defaultWeightFor(severity)
}

function toDimension(outcome: RuleOutcome): ScoreDimension {
  const opportunities = normaliseCount(outcome.opportunities)
  const missed = normaliseCount(outcome.missed)
  const weight = normaliseWeight(outcome.weight, outcome.severity)
  const fit = clamp01(1 - missed / opportunities)

  return {
    ruleId: outcome.ruleId,
    description: outcome.description,
    severity: outcome.severity,
    weight,
    opportunities,
    missed,
    fit,
  }
}

/** hard before soft. */
function severityRank(severity: Severity): number {
  return severity === 'hard' ? 0 : 1
}

/** Hard before soft (TT-46 A9), worst first within a severity — what a person wants when the
 *  question is "what cost me" — ruleId ascending as the final tie-break. Fully determined by the
 *  data, so it is deterministic regardless of the order the rules were evaluated in — the same
 *  property that makes the sum below order-independent. */
function breakdownOrder(a: ScoreDimension, b: ScoreDimension): number {
  const rankA = severityRank(a.severity)
  const rankB = severityRank(b.severity)
  if (rankA !== rankB) return rankA - rankB

  const costA = a.weight * (1 - a.fit)
  const costB = b.weight * (1 - b.fit)
  if (costA !== costB) return costB - costA

  return a.ruleId < b.ruleId ? -1 : a.ruleId > b.ruleId ? 1 : 0
}

export function scorePlan(report: RuleReport): PlanScore {
  const dimensions = report.outcomes
    .filter((outcome) => normaliseCount(outcome.opportunities) > 0)
    .map(toDimension)
    .sort(breakdownOrder)

  if (dimensions.length === 0) {
    return { score: null, dimensions: [] }
  }

  let weightedSum = 0
  let weightTotal = 0
  for (const dimension of dimensions) {
    weightedSum += dimension.weight * dimension.fit
    weightTotal += dimension.weight
  }

  return { score: Math.round((weightedSum / weightTotal) * 100), dimensions }
}
