import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { scorePlan } from './score'
import type { PlanCoverage } from './score'
import { evaluatePlan } from './engine'
import { evaluateRegistered, REGISTERED_RULES } from './registry'
import { allocate } from '../allocate'
import type { RuleOutcome, RuleReport } from './engine'
import type { GuardPlan, Remedy, RuleAssessment, RulePlan, SeatingRule, Severity } from './contract'
import type { Seat, SeatedTable } from '../seating'
import type { Guest, RoomConfig } from '../types'
import type { ScenarioId } from '../scenarios'

/**
 * TT-16: the criteria that read as properties of the score rather than as single values — a rule
 * the scorer has never heard of still moves the score, through the registry glob alone, and two
 * plans of the same guest list are directly comparable: no more findings anywhere and fewer on
 * one dimension scores strictly higher, and the figure does not move with the size of the room
 * behind it. Written from .claude/plans/TT-16.md section 3. Does not open score.ts or engine.ts.
 *
 * TT-16's own review found that comparability can fail in a way a report built from hand-picked
 * outcomes cannot show: if a rule's opportunity count shrinks as the plan empties, an incomplete
 * plan can outscore a complete one. The describe block below titled "a complete plan beats an
 * incomplete one" drives real plans through `evaluateRegistered` for exactly that reason — a
 * hand-built `RuleOutcome` lets the fixture author pin the denominator, which is the thing under
 * test here.
 *
 * A second hole a later cold re-review found — a rule computing its denominator from `plan.tables`
 * alone, because `RulePlan.unseated` could be omitted and the call still compiled — has no runtime
 * test here. Demonstrating it would mean constructing a `RulePlan` without `unseated` and showing
 * the resulting count comes out wrong; `contract.ts`'s `RulePlan` now makes `unseated` mandatory,
 * so that construction is a compile error, not a runtime outcome. `engine.test.ts`'s
 * `PlanSoFar`-is-not-`RulePlan` assignability marker is where this guarantee lives instead.
 *
 * TT-46: every rule now scores, hard and soft alike, so "a complete plan beats an incomplete one"
 * is hand-recomputed below from KB-8's formula rather than left at a bare `toBeGreaterThan` — both
 * capacity and partners-adjacent now contribute, and the exact figures are pinned so a regression
 * in either dimension's contribution shows up as a mismatch rather than a still-true inequality.
 * A10 gains a hard-severity counterpart to the existing soft one, and A12 gains a shuffled-order
 * pass over the real registry, alongside registry.test.ts's own reversed-order one.
 *
 * TT-48 (KB-8, "plan score = fit × (guests seated ÷ guests)"): `scorePlan` now takes a mandatory
 * second `PlanCoverage` argument. Where a test scores a hand-built `RuleOutcome` report with no
 * real plan behind it, `COMPLETE_COVERAGE` below keeps the factor at exactly one, so every figure
 * already pinned in this file from before TT-48 is untouched (48-A3, 48-A8) — the coverage number
 * itself is arbitrary, since it is a property of the whole guest list and these fixtures build no
 * such list. Where a test drives a real `RulePlan` through `evaluateRegistered` (TT-47 registers a
 * fourth rule, `everyone-seated`, into that same registry), the coverage is hand-counted from that
 * same fixture's own tables and `unseated` list — `seated` is guests holding a real seat index,
 * `guests` is seated + overflow + unseated (TT-47's own definition, restated here rather than
 * imported, so this file never depends on reading `planOccupancy`'s own source to get it right) —
 * and TT-47 lands as a fourth contributing dimension there, so the two pinned figures (95, 80)
 * before TT-47 move to 97 and 18 once it and TT-48 are both in.
 */

const COMPLETE_COVERAGE: PlanCoverage = { guests: 9, seated: 9 }

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

describe('scorePlan — two plans of the same guest list are directly comparable', () => {
  it('no more missed chances on any dimension, and strictly fewer on one, scores strictly higher', () => {
    const worse = makeReport([
      makeOutcome({ ruleId: 'partners-adjacent', opportunities: 10, missed: 4 }),
      makeOutcome({ ruleId: 'household-together', opportunities: 10, missed: 3 }),
    ])
    const better = makeReport([
      makeOutcome({ ruleId: 'partners-adjacent', opportunities: 10, missed: 4 }), // unchanged
      makeOutcome({ ruleId: 'household-together', opportunities: 10, missed: 2 }), // strictly fewer
    ])

    const worseScore = scorePlan(worse, COMPLETE_COVERAGE).score
    const betterScore = scorePlan(better, COMPLETE_COVERAGE).score

    expect(betterScore).not.toBeNull()
    expect(worseScore).not.toBeNull()
    expect(betterScore as number).toBeGreaterThan(worseScore as number)
  })

  it('the same miss rate, from a small room and from a large one, scores the same — the figure does not move with room size', () => {
    const smallRoom = makeReport([makeOutcome({ ruleId: 'partners-adjacent', opportunities: 10, missed: 1 })])
    const largeRoom = makeReport([makeOutcome({ ruleId: 'partners-adjacent', opportunities: 200, missed: 20 })])

    // Both are a 10% miss rate (fit 0.9); only the room behind them differs in scale.
    expect(scorePlan(smallRoom, COMPLETE_COVERAGE).score).toBe(scorePlan(largeRoom, COMPLETE_COVERAGE).score)
  })
})

describe('scorePlan — a complete plan beats an incomplete one, on the same guest list', () => {
  function makeGuest(id: string, overrides: Partial<Guest> = {}): Guest {
    return {
      id,
      name: `Guest ${id}`,
      side: 'bride',
      role: 'guest',
      age: 'adult',
      household: null,
      partnerOf: null,
      conflictsWith: [],
      tags: [],
      allergies: [],
      dietaryPreferences: [],
      accessibility: [],
      socialType: 'sociable',
      ...overrides,
    }
  }

  function seatOccupant(guest: Guest): Seat {
    return { guest, pinned: false }
  }

  function makePartnerPair(n: number): [Guest, Guest] {
    const aId = `p${n}a`
    const bId = `p${n}b`
    return [makeGuest(aId, { partnerOf: bId }), makeGuest(bId, { partnerOf: aId })]
  }

  /** Two guests seated together at their own two-seat table — always adjacent, since a two-seat
   *  ring has no other arrangement. */
  function adjacentPairTable(id: string, a: Guest, b: Guest): SeatedTable {
    return { id, kind: 'round', number: null, label: id, capacity: 2, seats: [seatOccupant(a), seatOccupant(b)], overflow: [] }
  }

  /** One guest alone at a one-seat table — seated, but nowhere near their partner. */
  function soloTable(id: string, guest: Guest): SeatedTable {
    return { id, kind: 'round', number: null, label: id, capacity: 1, seats: [seatOccupant(guest)], overflow: [] }
  }

  /** Ten partner pairs. Every guest is seated: eight pairs adjacent, two pairs each split across
   *  their own separate one-seat tables. */
  function buildCompletePlanWithSomeSplit(): RulePlan {
    const tables: SeatedTable[] = []
    for (let n = 1; n <= 8; n++) {
      const [a, b] = makePartnerPair(n)
      tables.push(adjacentPairTable(`adjacent-${n}`, a, b))
    }
    for (const n of [9, 10]) {
      const [a, b] = makePartnerPair(n)
      tables.push(soloTable(`split-${n}-a`, a))
      tables.push(soloTable(`split-${n}-b`, b))
    }
    return { tables, unseated: [] }
  }

  /** The same ten pairs. Only two pairs are seated (adjacent); the other eight pairs — sixteen
   *  guests — are left entirely unseated. */
  function buildMostlyUnseatedPlan(): RulePlan {
    const tables: SeatedTable[] = []
    const unseated: Guest[] = []
    for (let n = 1; n <= 10; n++) {
      const [a, b] = makePartnerPair(n)
      if (n <= 2) {
        tables.push(adjacentPairTable(`adjacent-${n}`, a, b))
      } else {
        unseated.push(a, b)
      }
    }
    return { tables, unseated }
  }

  it('seating everyone, with two of ten pairs split, scores strictly higher than seating only two pairs and leaving the other eight unseated', () => {
    const completePlan = buildCompletePlanWithSomeSplit()
    const mostlyUnseatedPlan = buildMostlyUnseatedPlan()

    // Hand-counted from each fixture's own tables and unseated list (TT-47's definition,
    // restated in this file's own top comment): 10 pairs is 20 guests either way.
    // Complete: every guest is seated (16 at the eight adjacent-pair tables, 4 more at the four
    // solo tables) — 20 of 20 seated.
    // Mostly unseated: only the n<=2 pairs are seated (4 guests); the other 8 pairs (16 guests)
    // are in `unseated` — 4 of 20 seated.
    const completeCoverage: PlanCoverage = { guests: 20, seated: 20 }
    const mostlyUnseatedCoverage: PlanCoverage = { guests: 20, seated: 4 }

    const complete = scorePlan(evaluateRegistered(completePlan), completeCoverage)
    const mostlyUnseated = scorePlan(evaluateRegistered(mostlyUnseatedPlan), mostlyUnseatedCoverage)

    // Ten opportunities in both reports — the same guest list — because opportunities is a
    // property of who is on the list, never of how much of the plan is filled in.
    expect(complete.dimensions.find((d) => d.ruleId === 'partners-adjacent')?.opportunities).toBe(10)
    expect(mostlyUnseated.dimensions.find((d) => d.ruleId === 'partners-adjacent')?.opportunities).toBe(10)

    expect(complete.score).not.toBeNull()
    expect(mostlyUnseated.score).not.toBeNull()
    expect(complete.score as number).toBeGreaterThan(mostlyUnseated.score as number)

    // Hand-computed from KB-8, now that capacity, everyone-seated (TT-47) and partners-adjacent
    // all score (top-table has no top table in either fixture, so it drops out of both means):
    //
    // Complete (20 guests, 20 seats, all seated): capacity fit 1.0 (12 opportunities — one per
    // table — 0 missed, weight 3); everyone-seated fit 1.0 (min(20, 20) = 20 opportunities, 0
    // missed — nobody unseated, weight 3); partners-adjacent fit 0.8 (10 opportunities, 2 missed —
    // the two split pairs, each a finding across two tables), weight 1.
    // Mean = (3×1.0 + 3×1.0 + 1×0.8) / (3+3+1) = 6.8/7 = 0.971428... Coverage factor 20/20 = 1.
    // Score = round(0.971428... × 1 × 100) = 97.
    //
    // Mostly unseated (20 guests, 4 seats, 4 seated): capacity fit 1.0 (2 opportunities, 0 missed,
    // weight 3); everyone-seated fit 1.0 (min(20, 4) = 4 opportunities; the room is short *and*
    // full — 0 free seats — so missed = min(16, 0) = 0: the rule stays quiet exactly as KB-1/KB-2
    // require, weight 3); partners-adjacent fit 0.2 (10 opportunities, 8 missed — the eight
    // wholly-unseated pairs), weight 1.
    // Mean = (3×1.0 + 3×1.0 + 1×0.2) / 7 = 6.2/7 = 0.885714... Coverage factor 4/20 = 0.2.
    // Score = round(0.885714... × 0.2 × 100) = round(17.7142...) = 18.
    expect(complete.score).toBe(97)
    expect(mostlyUnseated.score).toBe(18)
  })
})

describe('scorePlan — every soft rule contributes, and a rule the scorer has never heard of still moves the figure', () => {
  function makePlan(): RulePlan {
    return {
      tables: [
        {
          id: 'round-1',
          kind: 'round',
          number: 1,
          label: 'Table 1',
          capacity: 4,
          seats: [null, null, null, null],
          overflow: [],
        },
      ],
      unseated: [],
    }
  }

  /** This fixture's `evaluate` only ever reads `plan.tables` (most return a fixed assessment
   *  regardless of input), so each is written against `GuardPlan` — assignable wherever `RulePlan`
   *  is expected, since `RulePlan` has everything `GuardPlan` needs and nothing it must omit. */
  function fixtureRule(overrides: { id: string; description?: string; weight?: number; severity?: Severity; remedy?: Remedy; evaluate?: (plan: GuardPlan) => RuleAssessment }): SeatingRule {
    return {
      severity: 'soft',
      remedy: 'seating',
      description: `Fixture soft rule ${overrides.id}, invented for this test alone`,
      evaluate: () => ({ findings: [], opportunities: 0, missed: 0 }),
      ...overrides,
    }
  }

  it('scoring with one fixture rule vs. with two gives a different score, with no scoring code naming either rule', () => {
    const ruleA = fixtureRule({
      id: 'fixture-a',
      evaluate: () => ({
        findings: [
          { tableIds: ['round-1'], guestIds: ['g-1'], message: 'fixture finding one' },
          { tableIds: ['round-1'], guestIds: ['g-2'], message: 'fixture finding two' },
        ],
        opportunities: 4,
        missed: 2,
      }), // fit 0.5
    })
    const ruleB = fixtureRule({
      id: 'fixture-b',
      evaluate: () => ({ findings: [], opportunities: 4, missed: 0 }), // fit 1.0
    })
    const plan = makePlan()

    const scoreWithOnlyA = scorePlan(evaluatePlan(plan, [ruleA]), COMPLETE_COVERAGE).score
    const scoreWithBoth = scorePlan(evaluatePlan(plan, [ruleA, ruleB]), COMPLETE_COVERAGE).score

    // Only A: 50. A and B, weight 1 each: (0.5 + 1.0) / 2 = 0.75 → 75.
    expect(scoreWithOnlyA).toBe(50)
    expect(scoreWithBoth).toBe(75)
    expect(scoreWithBoth).not.toBe(scoreWithOnlyA)
  })

  it("a fixture rule's own description reaches scorePlan's dimensions untouched — the rule labels itself", () => {
    const rule = fixtureRule({
      id: 'fixture-labelled',
      description: 'A label scorePlan has never seen written anywhere in its own source',
      evaluate: () => ({
        findings: [{ tableIds: ['round-1'], guestIds: ['g-1'], message: 'x' }],
        opportunities: 2,
        missed: 1,
      }),
    })

    const { dimensions } = scorePlan(evaluatePlan(makePlan(), [rule]), COMPLETE_COVERAGE)

    expect(dimensions).toHaveLength(1)
    expect(dimensions[0]?.description).toBe('A label scorePlan has never seen written anywhere in its own source')
  })
})

describe('scorePlan — a hard fixture rule the scorer has never heard of also moves the score, and sorts ahead of every soft dimension (A10, TT-46)', () => {
  function makePlan(): RulePlan {
    return {
      tables: [
        {
          id: 'round-1',
          kind: 'round',
          number: 1,
          label: 'Table 1',
          capacity: 4,
          seats: [null, null, null, null],
          overflow: [],
        },
      ],
      unseated: [],
    }
  }

  function fixtureRule(overrides: {
    id: string
    description?: string
    weight?: number
    severity?: Severity
    remedy?: Remedy
    evaluate?: (plan: GuardPlan) => RuleAssessment
  }): SeatingRule {
    return {
      severity: 'soft',
      remedy: 'seating',
      description: `Fixture rule ${overrides.id}, invented for this test alone`,
      evaluate: () => ({ findings: [], opportunities: 0, missed: 0 }),
      ...overrides,
    }
  }

  it('a hard fixture rule changes the score, with no rule id named in the scoring code, and lands ahead of the soft dimension', () => {
    const softRule = fixtureRule({
      id: 'fixture-soft',
      evaluate: () => ({ findings: [], opportunities: 4, missed: 2 }), // fit 0.5
    })
    const hardRule = fixtureRule({
      id: 'fixture-hard',
      severity: 'hard',
      evaluate: () => ({ findings: [], opportunities: 4, missed: 0 }), // fit 1.0
    })
    const plan = makePlan()

    const softOnlyScore = scorePlan(evaluatePlan(plan, [softRule]), COMPLETE_COVERAGE).score
    const withHardResult = scorePlan(evaluatePlan(plan, [softRule, hardRule]), COMPLETE_COVERAGE)

    // Soft alone: 1 - 2/4 = 0.5 → 50. With the hard rule added at its default weight of 3:
    // (3×1.0 + 1×0.5) / (3+1) = 3.5/4 = 0.875 → 88 (plain rounding of 87.5).
    expect(softOnlyScore).toBe(50)
    expect(withHardResult.score).toBe(88)
    expect(withHardResult.score).not.toBe(softOnlyScore)
    expect(withHardResult.dimensions.map((d) => d.ruleId)).toEqual(['fixture-hard', 'fixture-soft'])
  })
})

const DIR = dirname(fileURLToPath(import.meta.url))

type ScenarioFixture = { meta: { tables: RoomConfig }; guests: Guest[] }

function readScenario(id: ScenarioId): ScenarioFixture {
  const path = join(DIR, '../../../public/scenarios', `${id}.json`)
  return JSON.parse(readFileSync(path, 'utf8')) as ScenarioFixture
}

/**
 * Coverage for both describe blocks below is hand-counted from the plan `allocate` itself
 * returns — `guests.length` guests in total, and `guests.length - plan.unseated.length` of them
 * holding a real seat (this scenario's room has more seats than guests, and `allocate` with no
 * pins seats everyone it can, per KB-1: "Auto-allocate ... fills every empty seat" — so this is
 * expected to be every guest, but the count is taken from the plan's own `unseated` field rather
 * than assumed). Both tests below check that two scoring paths agree given the *same* coverage,
 * not a specific pinned figure, so what matters is that both calls receive the identical value.
 */
function coverageOf(guests: readonly { id: string }[], plan: { unseated: readonly unknown[] }): PlanCoverage {
  return { guests: guests.length, seated: guests.length - plan.unseated.length }
}

describe('scorePlan — reaches whatever is registered through the glob alone, with no hardcoded rule list', () => {
  it('scoring evaluateRegistered(plan) on a scenario plan agrees exactly with scoring the same plan through REGISTERED_RULES directly', () => {
    const { meta, guests } = readScenario('adding-up')
    const plan = allocate(meta.tables, guests, [])
    const coverage = coverageOf(guests, plan)

    const throughRegistry = scorePlan(evaluateRegistered(plan), coverage)
    const throughDirectRules = scorePlan(evaluatePlan(plan, REGISTERED_RULES), coverage)

    expect(throughRegistry).toEqual(throughDirectRules)
  })
})

describe('scorePlan — the registered rules in shuffled order still produce an identical score (A12, TT-46)', () => {
  it('a fixed, non-trivial reordering of REGISTERED_RULES scores the same plan identically, dimensions and order included', () => {
    const { meta, guests } = readScenario('adding-up')
    const plan = allocate(meta.tables, guests, [])
    const coverage = coverageOf(guests, plan)
    // A rotation by one, not the reversal registry.test.ts's own order-independence check already
    // uses — a rule that happened to be order-independent only under a full reversal would still
    // pass that check and fail this one.
    const shuffled = [...REGISTERED_RULES.slice(1), ...REGISTERED_RULES.slice(0, 1)]

    const forward = scorePlan(evaluatePlan(plan, REGISTERED_RULES), coverage)
    const reordered = scorePlan(evaluatePlan(plan, shuffled), coverage)

    expect(reordered).toEqual(forward)
  })
})
