import { describe, expect, it } from 'vitest'
import { scorePlan } from './score'
import type { PlanCoverage } from './score'
import type { RuleOutcome, RuleReport } from './engine'

/**
 * TT-46's arithmetic (KB-8 "The arithmetic"): `scorePlan` turns a `RuleReport`'s `outcomes` into
 * one `PlanScore` — the weighted mean of every rule's sub-score, hard and soft alike, a hard rule
 * weighing 3 to a soft rule's 1 by default. Written against `RuleOutcome`/`RuleReport` (engine.ts's
 * own exported types) and `PlanScore`/`ScoreDimension`/`PlanCoverage` (score.ts's own exported
 * types) — reading a type is not reading an implementation. Does not open score.ts.
 *
 * Every arithmetic assertion below is hand-computed from KB-8's own formula (a rule's fit is
 * `1 − missed ÷ opportunities`, then the weighted mean on 0-100, plainly rounded) and never read
 * back from scorePlan's own output, so a defect that moves every dimension the same
 * plausible-looking way still shows up as a mismatch.
 *
 * `missed` is a rule's count of chances it did not take — never `findings.length`. A partner pair
 * nobody has seated yet is one such chance: a miss, but not a finding, because nothing about the
 * seating itself is wrong. `opportunities` and `missed` are set independently in the fixtures below
 * for exactly that reason.
 *
 * TT-46 superseded the soft-rules-only score TT-16 shipped. `makeOutcome` now defaults `weight` from
 * `severity` (3 for hard, 1 for soft) rather than to a flat 1, because that is what the engine
 * itself now hands `scorePlan` for a rule declaring no override — a fixture defaulting to the old
 * flat 1 for a hard outcome would silently test a shape production code never produces.
 *
 * TT-48 (KB-8 "The arithmetic", updated): `scorePlan` now takes a second, mandatory `PlanCoverage`
 * argument (`{ guests, seated }`) and scales the weighted mean by `seated / guests` before the one
 * final rounding. Every re-derived call below passes `COMPLETE_COVERAGE` — a `PlanCoverage` whose
 * `seated` equals its `guests`, so the factor is exactly one and every hand-computed figure already
 * in this file is untouched by TT-48: the coverage figure itself is arbitrary, since
 * `PlanCoverage` is a property of the whole guest list, never of any one rule's own opportunities,
 * and none of the fixtures below is built from a real plan for `scorePlan` to derive it from. TT-48's
 * own new behaviour — a real, incomplete coverage actually moving the score — gets its own
 * describe block at the end of this file, where the coverage figure is exactly what the fixture
 * intends rather than an inert stand-in.
 */

const COMPLETE_COVERAGE: PlanCoverage = { guests: 7, seated: 7 }

function makeOutcome(overrides: Partial<RuleOutcome> & Pick<RuleOutcome, 'ruleId'>): RuleOutcome {
  const severity = overrides.severity ?? 'soft'
  return {
    severity,
    description: `Fixture description for ${overrides.ruleId}`,
    weight: severity === 'hard' ? 3 : 1,
    opportunities: 0,
    missed: 0,
    ...overrides,
  }
}

function makeReport(outcomes: RuleOutcome[]): RuleReport {
  return { violations: [], ruleCount: outcomes.length, outcomes }
}

describe('scorePlan — the weighted mean of two soft sub-scores', () => {
  it('two soft rules, weight 1 each, fits 1.0 and 0.5, scores 75', () => {
    const report = makeReport([
      makeOutcome({ ruleId: 'perfect', opportunities: 4, missed: 0 }), // fit 1.0
      makeOutcome({ ruleId: 'half', opportunities: 4, missed: 2 }), // fit 0.5
    ])

    // (1×1.0 + 1×0.5) / (1+1) = 0.75 → 75, × coverage factor 1 (complete) = 75
    expect(scorePlan(report, COMPLETE_COVERAGE).score).toBe(75)
  })

  it('a soft rule with 4 opportunities and 2 missed scores 50 on its own', () => {
    const report = makeReport([makeOutcome({ ruleId: 'half', opportunities: 4, missed: 2 })])

    expect(scorePlan(report, COMPLETE_COVERAGE).score).toBe(50)
  })

  it('soft rules with fits 1.0 and 0.0 at weights 3 and 1 score 75, not the plain average of 50', () => {
    const report = makeReport([
      makeOutcome({ ruleId: 'heavy-perfect', weight: 3, opportunities: 4, missed: 0 }), // fit 1.0
      makeOutcome({ ruleId: 'light-zero', weight: 1, opportunities: 4, missed: 4 }), // fit 0.0
    ])

    // (3×1.0 + 1×0.0) / (3+1) = 0.75 → 75
    expect(scorePlan(report, COMPLETE_COVERAGE).score).toBe(75)
  })
})

describe('scorePlan — every rule contributes, hard and soft alike (A1)', () => {
  it('a hard outcome (fit 0.5) and a soft outcome (fit 1.0), neither declaring a weight, score (3×0.5 + 1×1.0) / 4 = 63', () => {
    const report = makeReport([
      makeOutcome({ ruleId: 'hard-half', severity: 'hard', opportunities: 4, missed: 2 }), // fit 0.5
      makeOutcome({ ruleId: 'soft-perfect', severity: 'soft', opportunities: 4, missed: 0 }), // fit 1.0
    ])

    // (3×0.5 + 1×1.0) / (3+1) = 2.5/4 = 0.625 → 63 (plain rounding of 62.5)
    expect(scorePlan(report, COMPLETE_COVERAGE).score).toBe(63)
  })

  it('adding a hard outcome to a soft-only report changes the score — a hard rule is no longer invisible to it', () => {
    const softOnly = makeReport([makeOutcome({ ruleId: 'soft-half', opportunities: 4, missed: 2 })]) // fit 0.5
    const withHard = makeReport([
      makeOutcome({ ruleId: 'soft-half', opportunities: 4, missed: 2 }),
      makeOutcome({ ruleId: 'hard-zero', severity: 'hard', opportunities: 4, missed: 4 }), // fit 0.0
    ])

    expect(scorePlan(softOnly, COMPLETE_COVERAGE).score).toBe(50)
    // (1×0.5 + 3×0.0) / (1+3) = 0.125 → 13 (plain rounding of 12.5)
    expect(scorePlan(withHard, COMPLETE_COVERAGE).score).toBe(13)
    expect(scorePlan(withHard, COMPLETE_COVERAGE).score).not.toBe(scorePlan(softOnly, COMPLETE_COVERAGE).score)
  })
})

describe('scorePlan — a zero-opportunity soft rule drops out of the mean entirely (A5)', () => {
  it('adding a soft outcome with 0 opportunities to a report scoring 50 leaves it at 50', () => {
    const before = makeReport([makeOutcome({ ruleId: 'half', opportunities: 4, missed: 2 })])
    const after = makeReport([
      makeOutcome({ ruleId: 'half', opportunities: 4, missed: 2 }),
      makeOutcome({ ruleId: 'nothing-to-judge', opportunities: 0, missed: 0 }),
    ])

    expect(scorePlan(before, COMPLETE_COVERAGE).score).toBe(50)
    expect(scorePlan(after, COMPLETE_COVERAGE).score).toBe(50)
  })
})

describe('scorePlan — a zero-opportunity hard rule drops out of the mean entirely too (A5)', () => {
  it('adding a hard outcome with 0 opportunities to a report scoring 50 leaves it at 50, never pulled toward 100', () => {
    const before = makeReport([makeOutcome({ ruleId: 'half', opportunities: 4, missed: 2 })]) // soft, fit 0.5
    const after = makeReport([
      makeOutcome({ ruleId: 'half', opportunities: 4, missed: 2 }),
      makeOutcome({ ruleId: 'hard-nothing-to-judge', severity: 'hard', opportunities: 0, missed: 0 }),
    ])

    expect(scorePlan(before, COMPLETE_COVERAGE).score).toBe(50)
    expect(scorePlan(after, COMPLETE_COVERAGE).score).toBe(50)
  })
})

describe('scorePlan — a plan with no soft violations scores 100', () => {
  it('every soft outcome at 0 missed scores 100', () => {
    const report = makeReport([
      makeOutcome({ ruleId: 'clean-a', opportunities: 6, missed: 0 }),
      makeOutcome({ ruleId: 'clean-b', opportunities: 3, missed: 0 }),
    ])

    expect(scorePlan(report, COMPLETE_COVERAGE).score).toBe(100)
  })
})

describe('scorePlan — no cap, no floor: a 100 can hide a real finding', () => {
  it('one missed chance against 200 opportunities scores 100, and the dimension still reports the exact 1 and 200', () => {
    const report = makeReport([makeOutcome({ ruleId: 'celebrity-scale', opportunities: 200, missed: 1 })])

    const result = scorePlan(report, COMPLETE_COVERAGE)

    // 1 - 1/200 = 0.995 → 99.5 → rounds to 100
    expect(result.score).toBe(100)
    const [dimension] = result.dimensions
    expect(dimension?.missed).toBe(1)
    expect(dimension?.opportunities).toBe(200)
  })
})

describe('scorePlan — weight defaults and coercion (A3, A4)', () => {
  it('an outcome with weight 1 (the default an undeclared soft rule weight resolves to) scores identically to one explicitly declaring weight 1', () => {
    const implicit = makeReport([makeOutcome({ ruleId: 'half', opportunities: 4, missed: 2 })])
    const explicit = makeReport([makeOutcome({ ruleId: 'half', opportunities: 4, missed: 2, weight: 1 })])

    expect(scorePlan(implicit, COMPLETE_COVERAGE)).toEqual(scorePlan(explicit, COMPLETE_COVERAGE))
  })

  it('an outcome with severity "hard" and no declared weight produces a dimension weight of 3; "soft" with none produces 1', () => {
    const hardReport = makeReport([makeOutcome({ ruleId: 'hard-default', severity: 'hard', opportunities: 4, missed: 0 })])
    const softReport = makeReport([makeOutcome({ ruleId: 'soft-default', severity: 'soft', opportunities: 4, missed: 0 })])

    expect(scorePlan(hardReport, COMPLETE_COVERAGE).dimensions[0]?.weight).toBe(3)
    expect(scorePlan(softReport, COMPLETE_COVERAGE).dimensions[0]?.weight).toBe(1)
  })

  it('an outcome declaring weight: 5 produces a dimension of weight 5, at either severity', () => {
    const hardReport = makeReport([makeOutcome({ ruleId: 'hard-five', severity: 'hard', weight: 5, opportunities: 4, missed: 0 })])
    const softReport = makeReport([makeOutcome({ ruleId: 'soft-five', severity: 'soft', weight: 5, opportunities: 4, missed: 0 })])

    expect(scorePlan(hardReport, COMPLETE_COVERAGE).dimensions[0]?.weight).toBe(5)
    expect(scorePlan(softReport, COMPLETE_COVERAGE).dimensions[0]?.weight).toBe(5)
  })

  it('weights of 0, -2, NaN and Infinity on a soft outcome each score identically to weight 1', () => {
    // Two outcomes so weight actually has something to weigh against — with only one outcome,
    // weight cancels out of the mean regardless of its value, which would prove nothing.
    function scoreWithFirstWeight(weight: number): number | null {
      return scorePlan(
        makeReport([
          makeOutcome({ ruleId: 'first', weight, opportunities: 4, missed: 0 }), // fit 1.0
          makeOutcome({ ruleId: 'second', weight: 5, opportunities: 4, missed: 4 }), // fit 0.0
        ]),
        COMPLETE_COVERAGE,
      ).score
    }

    // (1×1.0 + 5×0.0) / (1+5) = 0.16666... → 16.666... → rounds to 17
    const reference = scoreWithFirstWeight(1)
    expect(reference).toBe(17)

    for (const badWeight of [0, -2, Number.NaN, Number.POSITIVE_INFINITY]) {
      expect(scoreWithFirstWeight(badWeight)).toBe(reference)
    }
  })

  it('an invalid weight on a hard outcome falls back to 3, the hard default, never to the soft default of 1', () => {
    function scoreWithFirstWeight(weight: number): number | null {
      return scorePlan(
        makeReport([
          makeOutcome({ ruleId: 'first', severity: 'hard', weight, opportunities: 4, missed: 0 }), // fit 1.0
          makeOutcome({ ruleId: 'second', severity: 'hard', weight: 5, opportunities: 4, missed: 4 }), // fit 0.0
        ]),
        COMPLETE_COVERAGE,
      ).score
    }

    // (3×1.0 + 5×0.0) / (3+5) = 0.375 → 37.5 → rounds to 38
    const fallsBackToThree = scoreWithFirstWeight(3)
    expect(fallsBackToThree).toBe(38)
    // Sanity: the soft default (1) would give a visibly different figure — (1×1.0+5×0.0)/6 ≈
    // 16.67 → 17 — so this reference is actually capable of catching the wrong fallback.
    expect(scoreWithFirstWeight(1)).toBe(17)

    for (const badWeight of [0, -2, Number.NaN, Number.POSITIVE_INFINITY]) {
      expect(scoreWithFirstWeight(badWeight)).toBe(fallsBackToThree)
    }
  })
})

describe('scorePlan — missed is normalised through the same path as opportunities (TT-16)', () => {
  function scoreWithMissed(missed: number) {
    return scorePlan(makeReport([makeOutcome({ ruleId: 'flaky', opportunities: 4, missed })]), COMPLETE_COVERAGE)
  }

  it('a non-finite missed count (NaN, +Infinity, -Infinity) scores identically to a missed of 0, never a NaN score', () => {
    const reference = scoreWithMissed(0)
    expect(reference.score).toBe(100)
    expect(reference.dimensions[0]?.missed).toBe(0)

    for (const badMissed of [Number.NaN, Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY]) {
      const result = scoreWithMissed(badMissed)

      expect(Number.isNaN(result.score)).toBe(false)
      expect(result).toEqual(reference)
    }
  })

  it('a negative missed count scores identically to a missed of 0, never a negative count or a fit above 1', () => {
    expect(scoreWithMissed(-3)).toEqual(scoreWithMissed(0))
  })

  it('a fractional missed count is floored to a whole number of chances, never "2.5 of 4 missed" on the dimension', () => {
    const result = scoreWithMissed(2.5)

    // 1 − 2÷4 = 0.5 → 50: the fraction is floored to 2, not zeroed and not rounded to 3.
    expect(result.score).toBe(50)
    expect(result.dimensions[0]?.missed).toBe(2)
    expect(Number.isInteger(result.dimensions[0]?.missed)).toBe(true)
  })
})

describe('scorePlan — a rule reporting more missed chances than opportunities cannot go negative or above 100', () => {
  it('5 missed against 2 opportunities clamps its fit to 0, never negative', () => {
    const report = makeReport([makeOutcome({ ruleId: 'over-reporting', opportunities: 2, missed: 5 })])

    const result = scorePlan(report, COMPLETE_COVERAGE)

    expect(result.score).toBe(0)
    expect(result.dimensions[0]?.fit).toBe(0)
  })
})

describe('scorePlan — the score is null, never 0, when there is nothing to say (A6)', () => {
  it('no outcomes at all scores null, and null is not 0', () => {
    const result = scorePlan(makeReport([]), COMPLETE_COVERAGE)
    expect(result.score).toBeNull()
    expect(result.score).not.toBe(0)
  })

  it('soft outcomes present, but every one has 0 opportunities, scores null', () => {
    const report = makeReport([
      makeOutcome({ ruleId: 'nothing-a', opportunities: 0, missed: 0 }),
      makeOutcome({ ruleId: 'nothing-b', opportunities: 0, missed: 0 }),
    ])
    expect(scorePlan(report, COMPLETE_COVERAGE).score).toBeNull()
  })

  it('outcomes present at both severities, but every one with 0 opportunities, scores null', () => {
    const report = makeReport([
      makeOutcome({ ruleId: 'nothing-hard', severity: 'hard', opportunities: 0, missed: 0 }),
      makeOutcome({ ruleId: 'nothing-soft', severity: 'soft', opportunities: 0, missed: 0 }),
    ])
    expect(scorePlan(report, COMPLETE_COVERAGE).score).toBeNull()
  })

  it('a hard outcome alone, with real opportunities, produces a real score rather than null (A1) — hard rules are no longer excluded from scoring entirely', () => {
    const report = makeReport([makeOutcome({ ruleId: 'capacity', severity: 'hard', opportunities: 10, missed: 2 })])

    // 1 − 2/10 = 0.8 → 80
    expect(scorePlan(report, COMPLETE_COVERAGE).score).toBe(80)
  })
})

describe('scorePlan — deterministic and order-independent', () => {
  const outcomes = [
    makeOutcome({ ruleId: 'perfect', opportunities: 4, missed: 0 }),
    makeOutcome({ ruleId: 'half', opportunities: 4, missed: 2 }),
    makeOutcome({ ruleId: 'zero', opportunities: 6, missed: 6 }),
  ]

  it('the same report scored twice returns deeply equal results', () => {
    const report = makeReport(outcomes)
    expect(scorePlan(report, COMPLETE_COVERAGE)).toEqual(scorePlan(report, COMPLETE_COVERAGE))
  })

  it('the same outcomes in reverse order produce the identical score and the identical dimensions array', () => {
    const forward = scorePlan(makeReport(outcomes), COMPLETE_COVERAGE)
    const reversed = scorePlan(makeReport([...outcomes].reverse()), COMPLETE_COVERAGE)

    expect(reversed.score).toBe(forward.score)
    expect(reversed.dimensions).toEqual(forward.dimensions)
  })

  it('the same holds for a mix of hard and soft outcomes', () => {
    const mixed = [
      makeOutcome({ ruleId: 'hard-a', severity: 'hard', opportunities: 4, missed: 1 }),
      makeOutcome({ ruleId: 'soft-a', severity: 'soft', opportunities: 4, missed: 2 }),
      makeOutcome({ ruleId: 'hard-b', severity: 'hard', opportunities: 6, missed: 6 }),
    ]
    const forward = scorePlan(makeReport(mixed), COMPLETE_COVERAGE)
    const reversed = scorePlan(makeReport([...mixed].reverse()), COMPLETE_COVERAGE)

    expect(reversed.score).toBe(forward.score)
    expect(reversed.dimensions).toEqual(forward.dimensions)
  })
})

describe('scorePlan — dimensions carry every field, and exclude only zero-opportunity rules, at either severity', () => {
  it('dimensions include the scoring hard rule and the scoring soft rule, each with its full shape, and exclude the zero-opportunity one', () => {
    const report = makeReport([
      makeOutcome({
        ruleId: 'the-soft-one',
        severity: 'soft',
        description: 'Fixture describing this soft rule, verbatim',
        weight: 2,
        opportunities: 8,
        missed: 3,
      }),
      makeOutcome({
        ruleId: 'the-hard-one',
        severity: 'hard',
        description: 'Fixture describing this hard rule, verbatim',
        opportunities: 10,
        missed: 1,
      }),
      makeOutcome({ ruleId: 'the-empty-soft-one', opportunities: 0, missed: 0 }),
    ])

    const { dimensions } = scorePlan(report, COMPLETE_COVERAGE)

    expect(dimensions).toHaveLength(2)
    expect(dimensions.some((d) => d.ruleId === 'the-empty-soft-one')).toBe(false)

    const softDimension = dimensions.find((d) => d.ruleId === 'the-soft-one')
    expect(softDimension).toMatchObject({
      severity: 'soft',
      description: 'Fixture describing this soft rule, verbatim',
      weight: 2,
      opportunities: 8,
      missed: 3,
    })
    expect(softDimension?.fit).toBeCloseTo(0.625, 10)

    const hardDimension = dimensions.find((d) => d.ruleId === 'the-hard-one')
    expect(hardDimension).toMatchObject({
      severity: 'hard',
      description: 'Fixture describing this hard rule, verbatim',
      weight: 3, // no override declared — the hard default
      opportunities: 10,
      missed: 1,
    })
    expect(hardDimension?.fit).toBeCloseTo(0.9, 10)
  })
})

describe('scorePlan — dimensions come back worst-first within a severity', () => {
  it('a dimension costing weight × (1 − fit) of 1.5 precedes one costing 0.25', () => {
    const report = makeReport([
      // Listed cheap-first in the input, so ordering only holds if scorePlan actually sorts.
      makeOutcome({ ruleId: 'y-cheap', weight: 1, opportunities: 4, missed: 1 }), // fit .75, cost .25
      makeOutcome({ ruleId: 'x-costly', weight: 3, opportunities: 4, missed: 2 }), // fit .5, cost 1.5
    ])

    const { dimensions } = scorePlan(report, COMPLETE_COVERAGE)

    expect(dimensions.map((d) => d.ruleId)).toEqual(['x-costly', 'y-cheap'])
  })

  it('ruleId ascending breaks a tie in cost', () => {
    // Both dimensions cost weight × (1 − fit) = 1 × (1 − .5) = .5 — an exact tie, listed with the
    // alphabetically-later id first in the input so ordering only holds if scorePlan breaks the
    // tie on ruleId itself.
    const tiedReport = makeReport([
      makeOutcome({ ruleId: 'b-rule', weight: 1, opportunities: 2, missed: 1 }), // fit .5, cost .5
      makeOutcome({ ruleId: 'a-rule', weight: 1, opportunities: 2, missed: 1 }), // fit .5, cost .5
    ])

    const { dimensions } = scorePlan(tiedReport, COMPLETE_COVERAGE)
    expect(dimensions.map((d) => d.ruleId)).toEqual(['a-rule', 'b-rule'])
  })
})

describe('scorePlan — dimensions list every hard rule before every soft one, regardless of cost (A9)', () => {
  it('a low-cost hard dimension precedes a high-cost soft dimension — the opposite of pure worst-first', () => {
    const report = makeReport([
      // Listed soft-first, and the soft one costs far more (weight × (1−fit) = 1×1 = 1) than the
      // hard one (weight × (1−fit) = 3×0.01 = 0.03) — a worst-first-only sort would put the soft
      // dimension first; hard-before-soft must still win.
      makeOutcome({ ruleId: 'soft-costly', severity: 'soft', opportunities: 4, missed: 4 }), // fit 0.0
      makeOutcome({ ruleId: 'hard-cheap', severity: 'hard', opportunities: 100, missed: 1 }), // fit 0.99
    ])

    const { dimensions } = scorePlan(report, COMPLETE_COVERAGE)
    expect(dimensions.map((d) => d.ruleId)).toEqual(['hard-cheap', 'soft-costly'])
  })

  it('several hard and soft outcomes interleaved in the input come back with every hard dimension before every soft one', () => {
    const report = makeReport([
      makeOutcome({ ruleId: 'soft-a', severity: 'soft', opportunities: 4, missed: 1 }),
      makeOutcome({ ruleId: 'hard-a', severity: 'hard', opportunities: 4, missed: 1 }),
      makeOutcome({ ruleId: 'soft-b', severity: 'soft', opportunities: 4, missed: 3 }),
      makeOutcome({ ruleId: 'hard-b', severity: 'hard', opportunities: 4, missed: 3 }),
    ])

    const { dimensions } = scorePlan(report, COMPLETE_COVERAGE)
    const severityOf = (ruleId: string) => dimensions.find((d) => d.ruleId === ruleId)?.severity
    const hardIndexes = dimensions.map((d, i) => (d.severity === 'hard' ? i : -1)).filter((i) => i >= 0)
    const softIndexes = dimensions.map((d, i) => (d.severity === 'soft' ? i : -1)).filter((i) => i >= 0)

    expect(Math.max(...hardIndexes)).toBeLessThan(Math.min(...softIndexes))
    expect(severityOf('hard-a')).toBe('hard')
    expect(severityOf('soft-a')).toBe('soft')
  })
})

describe("scorePlan — a dimension's description is the outcome's own, never derived, mapped or rewritten", () => {
  it('the exact string the outcome carried comes back unchanged', () => {
    const report = makeReport([
      makeOutcome({
        ruleId: 'whatever-id',
        description: 'A wholly invented sentence nobody else in this file would guess',
        opportunities: 4,
        missed: 1,
      }),
    ])

    const { dimensions } = scorePlan(report, COMPLETE_COVERAGE)
    expect(dimensions[0]?.description).toBe('A wholly invented sentence nobody else in this file would guess')
  })
})

/**
 * TT-48 (KB-8: "plan score = fit × (guests seated ÷ guests), on 0-100"). Every figure below is
 * hand-derived from that formula and the fixture's own coverage — never read back from `scorePlan`.
 * `PlanCoverage` is deliberately a separate argument from the `RuleReport`: nothing here builds a
 * real `SeatingPlan` to derive it from, because the point of these cases is the factor's own
 * arithmetic in isolation from any one rule's opportunities.
 */
describe('scorePlan — TT-48: scaled by the proportion of guests seated', () => {
  it('complete coverage gives exactly the weighted mean — the factor is one', () => {
    const report = makeReport([
      makeOutcome({ ruleId: 'hard-half', severity: 'hard', opportunities: 4, missed: 2 }), // fit 0.5
      makeOutcome({ ruleId: 'soft-perfect', severity: 'soft', opportunities: 4, missed: 0 }), // fit 1.0
    ])

    // Same mean as the A1 case above: (3×0.5 + 1×1.0) / 4 = 0.625 → 63, × factor 1 = 63.
    expect(scorePlan(report, { guests: 12, seated: 12 }).score).toBe(63)
  })

  it('an empty plan — nobody seated at all — scores 0, never null, once there is something to judge', () => {
    const report = makeReport([makeOutcome({ ruleId: 'some-rule', opportunities: 4, missed: 0 })]) // fit 1.0

    // Mean is 1.0, but the factor is 0/70 = 0 -> round(1.0 × 0 × 100) = 0.
    const result = scorePlan(report, { guests: 70, seated: 0 })
    expect(result.score).toBe(0)
    expect(result.score).not.toBeNull()
  })

  it('a half-seated plan cannot score above fifty: a perfect mean scores exactly 50, an imperfect one strictly less', () => {
    const perfectMean = makeReport([makeOutcome({ ruleId: 'clean', opportunities: 4, missed: 0 })]) // fit 1.0
    const imperfectMean = makeReport([makeOutcome({ ruleId: 'flawed', opportunities: 10, missed: 2 })]) // fit 0.8

    // 1.0 × (10/20) × 100 = 50.
    expect(scorePlan(perfectMean, { guests: 20, seated: 10 }).score).toBe(50)
    // 0.8 × (10/20) × 100 = 40, strictly below 50.
    const imperfectResult = scorePlan(imperfectMean, { guests: 20, seated: 10 })
    expect(imperfectResult.score).toBe(40)
    expect(imperfectResult.score as number).toBeLessThan(50)
  })

  it('no guests at all returns score: null and dimensions: [], even though the report carries a real, scoreable dimension', () => {
    const report = makeReport([makeOutcome({ ruleId: 'capacity', severity: 'hard', opportunities: 10, missed: 2 })])

    const result = scorePlan(report, { guests: 0, seated: 0 })

    expect(result.score).toBeNull()
    expect(result.dimensions).toEqual([])
  })

  it('the denominator is guests, not seats: a short room fully seated (40 of 70 guests) scores the mean × 40/70, not the plain mean', () => {
    const report = makeReport([makeOutcome({ ruleId: 'clean', opportunities: 4, missed: 0 })]) // fit 1.0

    // Mean is 1.0. 1.0 × (40/70) × 100 = 57.142... → 57. Never the plain mean (100).
    const result = scorePlan(report, { guests: 70, seated: 40 })
    expect(result.score).toBe(57)
    expect(result.score).not.toBe(100)
  })

  it('the factor is applied once and the whole figure rounded once, never fit rounded first and then scaled', () => {
    // fit = 1 - 1/3 = 0.66666..., a value whose own rounding to a percentage (67) would give a
    // different, wrong answer if scaled afterwards: 67 × 0.5 → 33.5 → 34 (wrong). The one correct
    // rounding is 0.66666... × 0.5 × 100 = 33.333... → 33.
    const report = makeReport([makeOutcome({ ruleId: 'thirds', opportunities: 3, missed: 1 })])

    const result = scorePlan(report, { guests: 2, seated: 1 })

    expect(result.score).toBe(33)
    expect(result.score).not.toBe(34)
  })

  it('the same report and coverage scored twice agree, and reversing the outcomes does not move the figure', () => {
    const outcomes = [
      makeOutcome({ ruleId: 'hard-a', severity: 'hard', opportunities: 4, missed: 1 }),
      makeOutcome({ ruleId: 'soft-a', severity: 'soft', opportunities: 4, missed: 2 }),
    ]
    const coverage: PlanCoverage = { guests: 8, seated: 5 }

    const first = scorePlan(makeReport(outcomes), coverage)
    const again = scorePlan(makeReport(outcomes), coverage)
    const reversed = scorePlan(makeReport([...outcomes].reverse()), coverage)

    expect(again).toEqual(first)
    expect(reversed.score).toBe(first.score)
    expect(reversed.dimensions).toEqual(first.dimensions)
  })
})
