import { describe, expect, it } from 'vitest'
import {
  evaluatePlan,
  hardViolationCount,
  hardViolations,
  isPublishable,
  seatGuardFrom,
  softViolations,
  tablesWithHardViolation,
  withSeat,
} from './engine'
import type { Finding, GuardPlan, Remedy, RuleAssessment, RulePlan, SeatingRule, Severity } from './contract'
import type { PlanSoFar } from '../allocate'
import type { Guest } from '../types'

/**
 * TT-14's engine: stamping a rule's severity and remedy onto its findings, the hard/soft
 * selectors, the hypothetical-seat helper, and the guard auto-allocate consults. Written from
 * TT-14's acceptance criteria and the engine's own documented contract, against fixture rules
 * defined inline — the glob in registry.ts is registry.test.ts's concern, not this file's. Does
 * not open engine.ts, contract.ts or registry.ts.
 *
 * TT-16: `evaluate` now returns `{ findings, opportunities, missed }` (`RuleAssessment`) rather
 * than a bare array, and `evaluatePlan` also builds one `RuleOutcome` per rule into
 * `report.outcomes`. `makeRule`'s default and every fixture below are wrapped for that shape; no
 * existing assertion changes, only the fixture return shape.
 *
 * `missed` is a rule's count of chances it did not take — distinct from `findings.length`, the
 * count of what is actually wrong with the seating. Nothing in this file's own fixtures needs the
 * two to differ, so `assessment()` defaults `missed` to the same value as `opportunities` unless a
 * fixture asks for something else; the distinction itself belongs to score.ts's own suite.
 *
 * TT-46: an outcome's weight defaults from its own severity now (3 for hard, 1 for soft) rather
 * than to a single flat default — the existing "declares no weight" test below is corrected for
 * that, since `makeRule`'s own default severity is `'hard'`. `isPublishable(report)` is new,
 * beside `hardViolationCount`, and is checked here both against `hardViolationCount(report) === 0`
 * and — its structural half — without this file ever importing or calling `scorePlan`, so a report
 * that would score 100 while carrying a hard finding still comes back not publishable.
 */

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

function makePlan(): RulePlan {
  return {
    tables: [
      {
        id: 'round-1',
        kind: 'round',
        number: 1,
        label: 'Table 1',
        capacity: 2,
        seats: [null, null],
        overflow: [],
      },
      {
        id: 'round-2',
        kind: 'round',
        number: 2,
        label: 'Table 2',
        capacity: 2,
        seats: [null, null],
        overflow: [],
      },
    ],
    unseated: [],
  }
}

/** Wraps a bare findings array as the `RuleAssessment` shape `evaluate` now returns, with
 *  `opportunities` and `missed` both defaulting to the findings count so the domain invariant
 *  (`findings.length <= missed <= opportunities`) holds trivially wherever a fixture doesn't care. */
function assessment(
  findings: readonly Finding[],
  opportunities = findings.length,
  missed = findings.length,
): RuleAssessment {
  return { findings, opportunities, missed }
}

/** A fixture rule's own `evaluate` only ever needs `plan.tables` — none of this file's fixtures
 *  read the guest list — so every one is written against `GuardPlan`. `GuardPlan` is assignable
 *  wherever `RulePlan` is expected (it has everything `RulePlan` needs, plus nothing extra to
 *  omit), so one such fixture serves every severity/remedy combination `SeatingRule` allows. */
type RuleOverrides = {
  id: string
  description?: string
  weight?: number
  severity?: Severity
  remedy?: Remedy
  evaluate?: (plan: GuardPlan) => RuleAssessment
}

function makeRule(overrides: RuleOverrides): SeatingRule {
  return {
    severity: 'hard',
    remedy: 'seating',
    description: `fixture rule ${overrides.id}`,
    evaluate: () => assessment([]),
    ...overrides,
  }
}

describe("evaluatePlan — a finding is stamped with its own rule's id, severity and remedy (TT-14)", () => {
  it('carries every finding field through unchanged, plus ruleId, severity and remedy taken from the rule, not the finding', () => {
    const finding: Finding = {
      tableIds: ['round-1'],
      guestIds: ['g-1'],
      message: 'fixture message',
      detail: 'fixture detail',
    }
    const rule = makeRule({
      id: 'fixture-hard-flag',
      severity: 'hard',
      remedy: 'flag',
      evaluate: () => assessment([finding]),
    })

    const report = evaluatePlan(makePlan(), [rule])

    expect(report.violations).toEqual([{ ...finding, ruleId: 'fixture-hard-flag', severity: 'hard', remedy: 'flag' }])
  })

  it('a rule declared soft can never produce a hard violation, however its finding is shaped', () => {
    const rule = makeRule({
      id: 'fixture-soft',
      severity: 'soft',
      evaluate: () => assessment([{ tableIds: ['round-1'], guestIds: ['g-1'], message: 'soft finding' }]),
    })

    const report = evaluatePlan(makePlan(), [rule])

    expect(hardViolations(report)).toEqual([])
    expect(softViolations(report)).toHaveLength(1)
    expect(softViolations(report)[0]?.severity).toBe('soft')
  })
})

describe('evaluatePlan — ruleCount reflects exactly the rules passed in (TT-14; TT-16)', () => {
  it('counts every rule given, whether or not it fires', () => {
    const firing = makeRule({
      id: 'fires',
      evaluate: () => assessment([{ tableIds: ['round-1'], guestIds: ['g-1'], message: 'x' }]),
    })
    const quiet1 = makeRule({ id: 'quiet-1' })
    const quiet2 = makeRule({ id: 'quiet-2' })

    const report = evaluatePlan(makePlan(), [firing, quiet1, quiet2])

    expect(report.ruleCount).toBe(3)
  })

  it('an empty rule list yields no violations, a ruleCount of 0 and no outcomes — nothing registered is not a failure', () => {
    const report = evaluatePlan(makePlan(), [])

    expect(report).toEqual({ violations: [], ruleCount: 0, outcomes: [] })
  })
})

describe('hardViolations, softViolations, hardViolationCount and tablesWithHardViolation partition one report (TT-14; KB-2)', () => {
  it('splits a mix of hard and soft findings, from different rules and different tables, correctly', () => {
    const hardRule = makeRule({
      id: 'hard-rule',
      severity: 'hard',
      remedy: 'seating',
      evaluate: () => assessment([{ tableIds: ['round-1'], guestIds: ['g-1'], message: 'hard finding' }]),
    })
    const softRule = makeRule({
      id: 'soft-rule',
      severity: 'soft',
      remedy: 'seating',
      evaluate: () => assessment([{ tableIds: ['round-2'], guestIds: ['g-2'], message: 'soft finding' }]),
    })
    const secondHardRule = makeRule({
      id: 'hard-rule-2',
      severity: 'hard',
      remedy: 'flag',
      evaluate: () => assessment([{ tableIds: ['round-2'], guestIds: ['g-3'], message: 'second hard finding' }]),
    })

    const report = evaluatePlan(makePlan(), [hardRule, softRule, secondHardRule])

    expect(hardViolations(report)).toHaveLength(2)
    expect(softViolations(report)).toHaveLength(1)
    expect(hardViolationCount(report)).toBe(2)
    expect(tablesWithHardViolation(report)).toEqual(new Set(['round-1', 'round-2']))
  })

  it('an entirely quiet report partitions to nothing, and hardViolationCount is 0', () => {
    const report = evaluatePlan(makePlan(), [makeRule({ id: 'quiet' })])

    expect(hardViolations(report)).toEqual([])
    expect(softViolations(report)).toEqual([])
    expect(hardViolationCount(report)).toBe(0)
    expect(tablesWithHardViolation(report)).toEqual(new Set())
  })
})

describe('evaluatePlan — outcomes: one per rule, in order, whether or not it fired (TT-16)', () => {
  it('returns one outcome per rule given, in the order given', () => {
    const firing = makeRule({
      id: 'fires',
      evaluate: () => assessment([{ tableIds: ['round-1'], guestIds: ['g-1'], message: 'x' }]),
    })
    const quiet1 = makeRule({ id: 'quiet-1' })
    const quiet2 = makeRule({ id: 'quiet-2' })

    const report = evaluatePlan(makePlan(), [firing, quiet1, quiet2])

    expect(report.outcomes.map((outcome) => outcome.ruleId)).toEqual(['fires', 'quiet-1', 'quiet-2'])
  })

  it("each outcome carries the rule's own ruleId, severity, description, opportunities and missed count, taken from the assessment unchanged", () => {
    const rule = makeRule({
      id: 'fixture-outcome',
      severity: 'soft',
      remedy: 'seating',
      description: 'Fixture rule description, verbatim',
      evaluate: () =>
        assessment(
          [
            { tableIds: ['round-1'], guestIds: ['g-1'], message: 'x' },
            { tableIds: ['round-2'], guestIds: ['g-2'], message: 'y' },
          ],
          5, // opportunities
          // missed, deliberately not equal to findings.length (2) — proves the outcome carries
          // the assessment's own missed count rather than deriving one from the findings array.
          3,
        ),
    })

    const report = evaluatePlan(makePlan(), [rule])
    const [outcome] = report.outcomes

    expect(outcome).toMatchObject({
      ruleId: 'fixture-outcome',
      severity: 'soft',
      description: 'Fixture rule description, verbatim',
      opportunities: 5,
      missed: 3,
    })
    expect(softViolations(report)).toHaveLength(2)
  })

  it("an outcome's weight is the rule's declared weight, or its severity's own default where it declares none — 3 for hard, 1 for soft (TT-46)", () => {
    const weighted = makeRule({ id: 'weighted', weight: 5 })
    const unweightedHard = makeRule({ id: 'unweighted-hard', severity: 'hard' })
    const unweightedSoft = makeRule({ id: 'unweighted-soft', severity: 'soft' })

    const report = evaluatePlan(makePlan(), [weighted, unweightedHard, unweightedSoft])

    expect(report.outcomes.find((outcome) => outcome.ruleId === 'weighted')?.weight).toBe(5)
    expect(report.outcomes.find((outcome) => outcome.ruleId === 'unweighted-hard')?.weight).toBe(3)
    expect(report.outcomes.find((outcome) => outcome.ruleId === 'unweighted-soft')?.weight).toBe(1)
  })

  it('outcomes.length equals ruleCount for every report, firing or quiet, many rules or none', () => {
    const reports = [
      evaluatePlan(makePlan(), []),
      evaluatePlan(makePlan(), [makeRule({ id: 'solo' })]),
      evaluatePlan(makePlan(), [makeRule({ id: 'a' }), makeRule({ id: 'b' }), makeRule({ id: 'c' })]),
    ]

    for (const report of reports) {
      expect(report.outcomes.length).toBe(report.ruleCount)
    }
  })
})

describe('withSeat — the hypothetical plan a guard reasons about', () => {
  it('fills the named seat and leaves every other table shared by reference', () => {
    const plan = makePlan()
    const guest = makeGuest('g-1')

    const next = withSeat(plan, 'round-1', 0, guest)

    expect(next.tables.find((table) => table.id === 'round-1')?.seats[0]).toEqual({ guest, pinned: false })
    expect(next.tables.find((table) => table.id === 'round-2')).toBe(plan.tables.find((table) => table.id === 'round-2'))
  })

  it('does not mutate the plan it was given', () => {
    const plan = makePlan()

    withSeat(plan, 'round-1', 0, makeGuest('g-1'))

    expect(plan.tables.find((table) => table.id === 'round-1')?.seats[0]).toBeNull()
  })

  it('throws for a table id absent from the plan, rather than silently doing nothing', () => {
    expect(() => withSeat(makePlan(), 'round-99', 0, makeGuest('g-1'))).toThrow()
  })
})

describe("seatGuardFrom — only a hard, seating-remedy rule may refuse a candidate seat (TT-14: \"Auto-allocate has to tell those apart, or it will hunt for a seating fix that does not exist\")", () => {
  it('refuses when a hard, seating rule finds a violation naming that table and that guest', () => {
    const rule = makeRule({
      id: 'hard-seating',
      severity: 'hard',
      remedy: 'seating',
      evaluate: (plan) => {
        const table = plan.tables.find((t) => t.seats.some((seat) => seat?.guest.id === 'g-1'))
        return assessment(table ? [{ tableIds: [table.id], guestIds: ['g-1'], message: 'blocked' }] : [])
      },
    })
    const guard = seatGuardFrom([rule])

    const allowed = guard({ plan: makePlan(), tableId: 'round-1', seatIndex: 0, guest: makeGuest('g-1') })

    expect(allowed).toBe(false)
  })

  it("a soft rule's finding never refuses a seat, however hard it looks otherwise", () => {
    const rule = makeRule({
      id: 'soft-rule',
      severity: 'soft',
      remedy: 'seating',
      evaluate: () => assessment([{ tableIds: ['round-1'], guestIds: ['g-1'], message: 'soft objection' }]),
    })
    const guard = seatGuardFrom([rule])

    expect(guard({ plan: makePlan(), tableId: 'round-1', seatIndex: 0, guest: makeGuest('g-1') })).toBe(true)
  })

  it('a hard rule whose remedy is "flag" never refuses a seat — this is the criterion auto-allocate depends on most', () => {
    const rule = makeRule({
      id: 'hard-flag',
      severity: 'hard',
      remedy: 'flag',
      evaluate: () => assessment([{ tableIds: ['round-1'], guestIds: ['g-1'], message: 'flagged, not fixable by seating' }]),
    })
    const guard = seatGuardFrom([rule])

    expect(guard({ plan: makePlan(), tableId: 'round-1', seatIndex: 0, guest: makeGuest('g-1') })).toBe(true)
  })

  it('refuses only when a finding names both the candidate table and the candidate guest, never one alone', () => {
    const namesWrongGuest = makeRule({
      id: 'wrong-guest',
      severity: 'hard',
      remedy: 'seating',
      evaluate: () => assessment([{ tableIds: ['round-1'], guestIds: ['someone-else'], message: 'x' }]),
    })
    const namesWrongTable = makeRule({
      id: 'wrong-table',
      severity: 'hard',
      remedy: 'seating',
      evaluate: () => assessment([{ tableIds: ['round-2'], guestIds: ['g-1'], message: 'x' }]),
    })
    const candidate = { plan: makePlan(), tableId: 'round-1', seatIndex: 0, guest: makeGuest('g-1') }

    expect(seatGuardFrom([namesWrongGuest])(candidate)).toBe(true)
    expect(seatGuardFrom([namesWrongTable])(candidate)).toBe(true)
  })

  it('allows everything when given no rules at all', () => {
    const guard = seatGuardFrom([])

    expect(guard({ plan: makePlan(), tableId: 'round-1', seatIndex: 0, guest: makeGuest('g-1') })).toBe(true)
  })

  it('allows everything when every rule given is hard-or-seating but none is both at once', () => {
    const onlySoftAndFlag = [
      makeRule({
        id: 'soft',
        severity: 'soft',
        remedy: 'seating',
        evaluate: () => assessment([{ tableIds: ['round-1'], guestIds: ['g-1'], message: 'x' }]),
      }),
      makeRule({
        id: 'flag',
        severity: 'hard',
        remedy: 'flag',
        evaluate: () => assessment([{ tableIds: ['round-1'], guestIds: ['g-1'], message: 'x' }]),
      }),
    ]
    const guard = seatGuardFrom(onlySoftAndFlag)

    expect(guard({ plan: makePlan(), tableId: 'round-1', seatIndex: 0, guest: makeGuest('g-1') })).toBe(true)
  })

  it('asks its hard, seating rules about the hypothetical plan with the candidate already seated, not the plan as it stands', () => {
    const seesTheCandidateSeated = makeRule({
      id: 'sees-candidate',
      severity: 'hard',
      remedy: 'seating',
      evaluate: (plan) => {
        const table = plan.tables.find((t) => t.id === 'round-1')
        const seated = table?.seats.some((seat) => seat?.guest.id === 'g-1') ?? false
        return assessment(seated ? [{ tableIds: ['round-1'], guestIds: ['g-1'], message: 'x' }] : [])
      },
    })
    const guard = seatGuardFrom([seesTheCandidateSeated])

    // g-1 is nowhere in makePlan(); a refusal here is only possible if the rule was asked about
    // withSeat's hypothetical, not the plan as handed to the guard.
    expect(guard({ plan: makePlan(), tableId: 'round-1', seatIndex: 0, guest: makeGuest('g-1') })).toBe(false)
  })
})

describe('isPublishable — true exactly when the report carries no hard violation (A7, TT-46)', () => {
  it('soft violations present and no hard violation makes a report publishable', () => {
    const softRule = makeRule({
      id: 'soft-rule',
      severity: 'soft',
      evaluate: () =>
        assessment(
          Array.from({ length: 12 }, (_, i) => ({ tableIds: ['round-1'], guestIds: [`g-${i}`], message: 'soft finding' })),
        ),
    })

    const report = evaluatePlan(makePlan(), [softRule])

    expect(hardViolationCount(report)).toBe(0)
    expect(isPublishable(report)).toBe(true)
  })

  it('one hard violation among a dozen soft ones makes a report not publishable', () => {
    const hardRule = makeRule({
      id: 'hard-rule',
      severity: 'hard',
      evaluate: () => assessment([{ tableIds: ['round-1'], guestIds: ['g-1'], message: 'hard finding' }]),
    })
    const softRule = makeRule({
      id: 'soft-rule',
      severity: 'soft',
      evaluate: () =>
        assessment(
          Array.from({ length: 12 }, (_, i) => ({ tableIds: ['round-2'], guestIds: [`s-${i}`], message: 'soft finding' })),
        ),
    })

    const report = evaluatePlan(makePlan(), [hardRule, softRule])

    expect(hardViolationCount(report)).toBeGreaterThan(0)
    expect(isPublishable(report)).toBe(false)
  })

  it('a report with no findings at all is publishable', () => {
    const report = evaluatePlan(makePlan(), [makeRule({ id: 'quiet' })])

    expect(isPublishable(report)).toBe(true)
  })

  it('agrees with hardViolationCount(report) === 0 on every fixture above and a couple more', () => {
    const fixtures = [
      evaluatePlan(makePlan(), []),
      evaluatePlan(makePlan(), [makeRule({ id: 'quiet' })]),
      evaluatePlan(makePlan(), [
        makeRule({
          id: 'hard',
          severity: 'hard',
          evaluate: () => assessment([{ tableIds: ['round-1'], guestIds: ['g-1'], message: 'x' }]),
        }),
      ]),
      evaluatePlan(makePlan(), [
        makeRule({
          id: 'soft',
          severity: 'soft',
          evaluate: () => assessment([{ tableIds: ['round-1'], guestIds: ['g-1'], message: 'x' }]),
        }),
      ]),
    ]

    for (const report of fixtures) {
      expect(isPublishable(report)).toBe(hardViolationCount(report) === 0)
    }
  })
})

describe('isPublishable — structurally independent of the score: it is called with a report alone, and this file never imports scorePlan (A7, TT-46)', () => {
  it('a report that would score a plain 100 (a hard rule missing 1 of 200 chances — the same no-cap rounding score.test.ts exercises) is still not publishable, because it carries a hard finding', () => {
    const almostPerfectHardRule = makeRule({
      id: 'almost-perfect-hard',
      severity: 'hard',
      // 1 - 1/200 = 0.995, which rounds to a plain 100 — hand-computed, never actually scored here.
      evaluate: () => assessment([{ tableIds: ['round-1'], guestIds: ['g-1'], message: 'one hard finding among 200 chances' }], 200, 1),
    })

    const report = evaluatePlan(makePlan(), [almostPerfectHardRule])

    expect(hardViolationCount(report)).toBe(1)
    expect(isPublishable(report)).toBe(false)
  })

  it('a report that would score low (a soft rule missing every chance, with nothing hard at all) is publishable', () => {
    const failingSoftRule = makeRule({
      id: 'failing-soft',
      severity: 'soft',
      evaluate: () => assessment([], 4, 4), // fit 0.0, a miss without a finding
    })

    const report = evaluatePlan(makePlan(), [failingSoftRule])

    expect(hardViolationCount(report)).toBe(0)
    expect(isPublishable(report)).toBe(true)
  })
})

describe('RulePlan and PlanSoFar are deliberately not interchangeable, checked at compile time', () => {
  it("PlanSoFar cannot stand in for RulePlan — a scoring rule can never be handed the solver's speculative, guest-list-less plan and silently compute its denominator from seated guests alone", () => {
    // RulePlan (tables and unseated, both mandatory) is assignable to PlanSoFar (tables only): it
    // has everything PlanSoFar needs, and more. The reverse must not hold — PlanSoFar carries no
    // guest list at all, so handing one to something typed for RulePlan must fail to typecheck.
    // As with the seats-readonly marker (commit 2de627a): if PlanSoFar were still assignable to
    // RulePlan, this alias would resolve to `true`, and assigning `false` to it would fail
    // typecheck rather than this runtime assertion.
    type PlanSoFarStandsInForRulePlan = PlanSoFar extends RulePlan ? true : false
    const marker: PlanSoFarStandsInForRulePlan = false

    expect(marker).toBe(false)
  })
})
