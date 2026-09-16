import { DEFAULT_RULE_WEIGHT } from './contract'
import type { RuleOutcome, RuleReport } from './engine'

/**
 * The plan fit score (TT-16): one number, 0-100, over the soft rules only. Named `score.ts`,
 * which `registry.ts`'s `./*.rule.ts` glob cannot match — the same reason `contract.ts` carries
 * that name.
 */

export type ScoreDimension = {
  ruleId: string
  /** The rule's own description. The only label the breakdown has, and the only one it needs. */
  description: string
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
  /** 0-100, or null when no soft rule had an opportunity to be satisfied (TT-16). Never 0 for
   *  "nothing to say". Plainly rounded: 100 means the weighted mean rounds to 100, never that
   *  the plan has no soft violations — the breakdown's exact missed counts are where a finding
   *  behind a rounded 100 is visible. There is no cap and no floor. */
  score: number | null
  /** Worst first: weight × (1 − fit) descending, ruleId ascending as tie-break. Only the soft
   *  rules that scored; a soft rule with no opportunities is not here. */
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
 *  negative — becomes the default. Mirrors the coercion `RuleOutcome.weight`'s doc comment
 *  promises but does not itself perform. */
function normaliseWeight(value: number): number {
  return Number.isFinite(value) && value > 0 ? value : DEFAULT_RULE_WEIGHT
}

function toDimension(outcome: RuleOutcome): ScoreDimension {
  const opportunities = normaliseCount(outcome.opportunities)
  const missed = normaliseCount(outcome.missed)
  const weight = normaliseWeight(outcome.weight)
  const fit = clamp01(1 - missed / opportunities)

  return {
    ruleId: outcome.ruleId,
    description: outcome.description,
    weight,
    opportunities,
    missed,
    fit,
  }
}

/** Worst first: what a person wants when the question is "what cost me". Fully determined by
 *  the data, so it is deterministic regardless of the order the rules were evaluated in — the
 *  same property that makes the sum below order-independent. */
function worstFirst(a: ScoreDimension, b: ScoreDimension): number {
  const costA = a.weight * (1 - a.fit)
  const costB = b.weight * (1 - b.fit)

  if (costA !== costB) return costB - costA
  return a.ruleId < b.ruleId ? -1 : a.ruleId > b.ruleId ? 1 : 0
}

export function scorePlan(report: RuleReport): PlanScore {
  const dimensions = report.outcomes
    .filter((outcome) => outcome.severity === 'soft' && normaliseCount(outcome.opportunities) > 0)
    .map(toDimension)
    .sort(worstFirst)

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
