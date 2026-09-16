import { describe, expect, it } from 'vitest'
import { scorePlan } from './score'
import type { RuleOutcome, RuleReport } from './engine'

/**
 * TT-16's arithmetic: `scorePlan` turns a `RuleReport`'s `outcomes` into one `PlanScore`. Written
 * against `RuleReport`/`RuleOutcome` (engine.ts's own exported types) and `PlanScore`/
 * `ScoreDimension` (score.ts's own exported types) — reading a type is not reading an
 * implementation. Does not open score.ts.
 *
 * Every arithmetic assertion below is hand-computed from TT-16's own formula (a rule's fit is
 * `1 − missed ÷ opportunities`, then the weighted mean on 0-100, plainly rounded) and never read
 * back from scorePlan's own output, so a defect that moves every dimension the same
 * plausible-looking way still shows up as a mismatch.
 *
 * `missed` is a rule's count of chances it did not take — never `findings.length`. A partner pair
 * nobody has seated yet is one such chance: a miss, but not a finding, because nothing about the
 * seating itself is wrong. `opportunities` and `missed` are set independently in the fixtures below
 * for exactly that reason.
 */

function makeOutcome(overrides: Partial<RuleOutcome> & Pick<RuleOutcome, 'ruleId'>): RuleOutcome {
  return {
    severity: 'soft',
    description: `Fixture description for ${overrides.ruleId}`,
    weight: 1,
    opportunities: 0,
    missed: 0,
    ...overrides,
  }
}

function makeReport(outcomes: RuleOutcome[]): RuleReport {
  return { violations: [], ruleCount: outcomes.length, outcomes }
}

describe('scorePlan — the weighted mean of soft sub-scores', () => {
  it('two soft rules, weight 1 each, fits 1.0 and 0.5, scores 75', () => {
    const report = makeReport([
      makeOutcome({ ruleId: 'perfect', opportunities: 4, missed: 0 }), // fit 1.0
      makeOutcome({ ruleId: 'half', opportunities: 4, missed: 2 }), // fit 0.5
    ])

    // (1×1.0 + 1×0.5) / (1+1) = 0.75 → 75
    expect(scorePlan(report).score).toBe(75)
  })

  it('a soft rule with 4 opportunities and 2 missed scores 50 on its own', () => {
    const report = makeReport([makeOutcome({ ruleId: 'half', opportunities: 4, missed: 2 })])

    expect(scorePlan(report).score).toBe(50)
  })

  it('soft rules with fits 1.0 and 0.0 at weights 3 and 1 score 75, not the plain average of 50', () => {
    const report = makeReport([
      makeOutcome({ ruleId: 'heavy-perfect', weight: 3, opportunities: 4, missed: 0 }), // fit 1.0
      makeOutcome({ ruleId: 'light-zero', weight: 1, opportunities: 4, missed: 4 }), // fit 0.0
    ])

    // (3×1.0 + 1×0.0) / (3+1) = 0.75 → 75
    expect(scorePlan(report).score).toBe(75)
  })
})

describe('scorePlan — a zero-opportunity soft rule drops out of the mean entirely', () => {
  it('adding a soft outcome with 0 opportunities to a report scoring 50 leaves it at 50', () => {
    const before = makeReport([makeOutcome({ ruleId: 'half', opportunities: 4, missed: 2 })])
    const after = makeReport([
      makeOutcome({ ruleId: 'half', opportunities: 4, missed: 2 }),
      makeOutcome({ ruleId: 'nothing-to-judge', opportunities: 0, missed: 0 }),
    ])

    expect(scorePlan(before).score).toBe(50)
    expect(scorePlan(after).score).toBe(50)
  })
})

describe('scorePlan — a plan with no soft violations scores 100', () => {
  it('every soft outcome at 0 missed scores 100', () => {
    const report = makeReport([
      makeOutcome({ ruleId: 'clean-a', opportunities: 6, missed: 0 }),
      makeOutcome({ ruleId: 'clean-b', opportunities: 3, missed: 0 }),
    ])

    expect(scorePlan(report).score).toBe(100)
  })
})

describe('scorePlan — no cap, no floor: a 100 can hide a real finding', () => {
  it('one missed chance against 200 opportunities scores 100, and the dimension still reports the exact 1 and 200', () => {
    const report = makeReport([makeOutcome({ ruleId: 'celebrity-scale', opportunities: 200, missed: 1 })])

    const result = scorePlan(report)

    // 1 - 1/200 = 0.995 → 99.5 → rounds to 100
    expect(result.score).toBe(100)
    const [dimension] = result.dimensions
    expect(dimension?.missed).toBe(1)
    expect(dimension?.opportunities).toBe(200)
  })
})

describe('scorePlan — hard outcomes never move the score', () => {
  it('the same soft outcomes score identically with and without hard outcomes present, including a hard outcome with many missed chances', () => {
    const softOnly = makeReport([
      makeOutcome({ ruleId: 'perfect', opportunities: 4, missed: 0 }),
      makeOutcome({ ruleId: 'half', opportunities: 4, missed: 2 }),
    ])
    const withHard = makeReport([
      makeOutcome({ ruleId: 'perfect', opportunities: 4, missed: 0 }),
      makeOutcome({ ruleId: 'half', opportunities: 4, missed: 2 }),
      makeOutcome({ ruleId: 'capacity', severity: 'hard', opportunities: 12, missed: 12 }),
    ])

    const softOnlyResult = scorePlan(softOnly)
    const withHardResult = scorePlan(withHard)

    expect(withHardResult.score).toBe(softOnlyResult.score)
    expect(withHardResult.score).toBe(75)
    expect(withHardResult.dimensions).toEqual(softOnlyResult.dimensions)
  })
})

describe('scorePlan — weight defaults and coercion', () => {
  it('an outcome with weight 1 (the default an undeclared rule weight resolves to) scores identically to one explicitly declaring weight 1', () => {
    const implicit = makeReport([makeOutcome({ ruleId: 'half', opportunities: 4, missed: 2 })])
    const explicit = makeReport([makeOutcome({ ruleId: 'half', opportunities: 4, missed: 2, weight: 1 })])

    expect(scorePlan(implicit)).toEqual(scorePlan(explicit))
  })

  it('weights of 0, -2, NaN and Infinity each score identically to weight 1', () => {
    // Two outcomes so weight actually has something to weigh against — with only one outcome,
    // weight cancels out of the mean regardless of its value, which would prove nothing.
    function scoreWithFirstWeight(weight: number): number | null {
      return scorePlan(
        makeReport([
          makeOutcome({ ruleId: 'first', weight, opportunities: 4, missed: 0 }), // fit 1.0
          makeOutcome({ ruleId: 'second', weight: 5, opportunities: 4, missed: 4 }), // fit 0.0
        ]),
      ).score
    }

    // (1×1.0 + 5×0.0) / (1+5) = 0.16666... → 16.666... → rounds to 17
    const reference = scoreWithFirstWeight(1)
    expect(reference).toBe(17)

    for (const badWeight of [0, -2, Number.NaN, Number.POSITIVE_INFINITY]) {
      expect(scoreWithFirstWeight(badWeight)).toBe(reference)
    }
  })
})

describe('scorePlan — missed is normalised through the same path as opportunities (TT-16)', () => {
  function scoreWithMissed(missed: number) {
    return scorePlan(makeReport([makeOutcome({ ruleId: 'flaky', opportunities: 4, missed })]))
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

    const result = scorePlan(report)

    expect(result.score).toBe(0)
    expect(result.dimensions[0]?.fit).toBe(0)
  })
})

describe('scorePlan — the score is null, never 0, when there is nothing to say', () => {
  it('no outcomes at all scores null, and null is not 0', () => {
    const result = scorePlan(makeReport([]))
    expect(result.score).toBeNull()
    expect(result.score).not.toBe(0)
  })

  it('only hard outcomes scores null', () => {
    const report = makeReport([makeOutcome({ ruleId: 'capacity', severity: 'hard', opportunities: 10, missed: 2 })])
    expect(scorePlan(report).score).toBeNull()
  })

  it('soft outcomes present, but every one has 0 opportunities, scores null', () => {
    const report = makeReport([
      makeOutcome({ ruleId: 'nothing-a', opportunities: 0, missed: 0 }),
      makeOutcome({ ruleId: 'nothing-b', opportunities: 0, missed: 0 }),
    ])
    expect(scorePlan(report).score).toBeNull()
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
    expect(scorePlan(report)).toEqual(scorePlan(report))
  })

  it('the same outcomes in reverse order produce the identical score and the identical dimensions array', () => {
    const forward = scorePlan(makeReport(outcomes))
    const reversed = scorePlan(makeReport([...outcomes].reverse()))

    expect(reversed.score).toBe(forward.score)
    expect(reversed.dimensions).toEqual(forward.dimensions)
  })
})

describe('scorePlan — dimensions carry every field, and exclude hard rules and zero-opportunity soft rules', () => {
  it('dimensions include only the scoring soft rule, with its full shape', () => {
    const report = makeReport([
      makeOutcome({
        ruleId: 'the-soft-one',
        description: 'Fixture describing this soft rule, verbatim',
        weight: 2,
        opportunities: 8,
        missed: 3,
      }),
      makeOutcome({ ruleId: 'the-hard-one', severity: 'hard', opportunities: 10, missed: 1 }),
      makeOutcome({ ruleId: 'the-empty-soft-one', opportunities: 0, missed: 0 }),
    ])

    const { dimensions } = scorePlan(report)

    expect(dimensions).toHaveLength(1)
    const [dimension] = dimensions
    expect(dimension).toMatchObject({
      ruleId: 'the-soft-one',
      description: 'Fixture describing this soft rule, verbatim',
      weight: 2,
      opportunities: 8,
      missed: 3,
    })
    // 1 - 3/8 = 0.625
    expect(dimension?.fit).toBeCloseTo(0.625, 10)
    expect(dimensions.some((d) => d.ruleId === 'the-hard-one')).toBe(false)
    expect(dimensions.some((d) => d.ruleId === 'the-empty-soft-one')).toBe(false)
  })
})

describe('scorePlan — dimensions come back worst-first', () => {
  it('a dimension costing weight × (1 − fit) of 1.5 precedes one costing 0.25', () => {
    const report = makeReport([
      // Listed cheap-first in the input, so ordering only holds if scorePlan actually sorts.
      makeOutcome({ ruleId: 'y-cheap', weight: 1, opportunities: 4, missed: 1 }), // fit .75, cost .25
      makeOutcome({ ruleId: 'x-costly', weight: 3, opportunities: 4, missed: 2 }), // fit .5, cost 1.5
    ])

    const { dimensions } = scorePlan(report)

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

    const { dimensions } = scorePlan(tiedReport)
    expect(dimensions.map((d) => d.ruleId)).toEqual(['a-rule', 'b-rule'])
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

    const { dimensions } = scorePlan(report)
    expect(dimensions[0]?.description).toBe('A wholly invented sentence nobody else in this file would guess')
  })
})
