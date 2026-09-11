import { describe, expect, it } from 'vitest'
import {
  evaluatePlan,
  hardViolationCount,
  hardViolations,
  seatGuardFrom,
  softViolations,
  tablesWithHardViolation,
  withSeat,
} from './engine'
import type { Finding, RulePlan, SeatingRule } from './contract'
import type { PlanSoFar } from '../allocate'
import type { Guest } from '../types'

/**
 * TT-14's engine: stamping a rule's severity and remedy onto its findings, the hard/soft
 * selectors, the hypothetical-seat helper, and the guard auto-allocate consults. Written from
 * TT-14's acceptance criteria and the engine's own documented contract, against fixture rules
 * defined inline — the glob in registry.ts is registry.test.ts's concern, not this file's. Does
 * not open engine.ts, contract.ts or registry.ts.
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
  }
}

function makeRule(overrides: Partial<SeatingRule> & Pick<SeatingRule, 'id'>): SeatingRule {
  return {
    severity: 'hard',
    remedy: 'seating',
    description: `fixture rule ${overrides.id}`,
    evaluate: () => [],
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
    const rule = makeRule({ id: 'fixture-hard-flag', severity: 'hard', remedy: 'flag', evaluate: () => [finding] })

    const report = evaluatePlan(makePlan(), [rule])

    expect(report.violations).toEqual([{ ...finding, ruleId: 'fixture-hard-flag', severity: 'hard', remedy: 'flag' }])
  })

  it('a rule declared soft can never produce a hard violation, however its finding is shaped', () => {
    const rule = makeRule({
      id: 'fixture-soft',
      severity: 'soft',
      evaluate: () => [{ tableIds: ['round-1'], guestIds: ['g-1'], message: 'soft finding' }],
    })

    const report = evaluatePlan(makePlan(), [rule])

    expect(hardViolations(report)).toEqual([])
    expect(softViolations(report)).toHaveLength(1)
    expect(softViolations(report)[0]?.severity).toBe('soft')
  })
})

describe('evaluatePlan — ruleCount reflects exactly the rules passed in (TT-14; TT-16)', () => {
  it('counts every rule given, whether or not it fires', () => {
    const firing = makeRule({ id: 'fires', evaluate: () => [{ tableIds: ['round-1'], guestIds: ['g-1'], message: 'x' }] })
    const quiet1 = makeRule({ id: 'quiet-1' })
    const quiet2 = makeRule({ id: 'quiet-2' })

    const report = evaluatePlan(makePlan(), [firing, quiet1, quiet2])

    expect(report.ruleCount).toBe(3)
  })

  it('an empty rule list yields no violations and a ruleCount of 0 — nothing registered is not a failure', () => {
    const report = evaluatePlan(makePlan(), [])

    expect(report).toEqual({ violations: [], ruleCount: 0 })
  })
})

describe('hardViolations, softViolations, hardViolationCount and tablesWithHardViolation partition one report (TT-14; KB-2)', () => {
  it('splits a mix of hard and soft findings, from different rules and different tables, correctly', () => {
    const hardRule = makeRule({
      id: 'hard-rule',
      severity: 'hard',
      remedy: 'seating',
      evaluate: () => [{ tableIds: ['round-1'], guestIds: ['g-1'], message: 'hard finding' }],
    })
    const softRule = makeRule({
      id: 'soft-rule',
      severity: 'soft',
      remedy: 'seating',
      evaluate: () => [{ tableIds: ['round-2'], guestIds: ['g-2'], message: 'soft finding' }],
    })
    const secondHardRule = makeRule({
      id: 'hard-rule-2',
      severity: 'hard',
      remedy: 'flag',
      evaluate: () => [{ tableIds: ['round-2'], guestIds: ['g-3'], message: 'second hard finding' }],
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
        return table ? [{ tableIds: [table.id], guestIds: ['g-1'], message: 'blocked' }] : []
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
      evaluate: () => [{ tableIds: ['round-1'], guestIds: ['g-1'], message: 'soft objection' }],
    })
    const guard = seatGuardFrom([rule])

    expect(guard({ plan: makePlan(), tableId: 'round-1', seatIndex: 0, guest: makeGuest('g-1') })).toBe(true)
  })

  it('a hard rule whose remedy is "flag" never refuses a seat — this is the criterion auto-allocate depends on most', () => {
    const rule = makeRule({
      id: 'hard-flag',
      severity: 'hard',
      remedy: 'flag',
      evaluate: () => [{ tableIds: ['round-1'], guestIds: ['g-1'], message: 'flagged, not fixable by seating' }],
    })
    const guard = seatGuardFrom([rule])

    expect(guard({ plan: makePlan(), tableId: 'round-1', seatIndex: 0, guest: makeGuest('g-1') })).toBe(true)
  })

  it('refuses only when a finding names both the candidate table and the candidate guest, never one alone', () => {
    const namesWrongGuest = makeRule({
      id: 'wrong-guest',
      severity: 'hard',
      remedy: 'seating',
      evaluate: () => [{ tableIds: ['round-1'], guestIds: ['someone-else'], message: 'x' }],
    })
    const namesWrongTable = makeRule({
      id: 'wrong-table',
      severity: 'hard',
      remedy: 'seating',
      evaluate: () => [{ tableIds: ['round-2'], guestIds: ['g-1'], message: 'x' }],
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
        evaluate: () => [{ tableIds: ['round-1'], guestIds: ['g-1'], message: 'x' }],
      }),
      makeRule({
        id: 'flag',
        severity: 'hard',
        remedy: 'flag',
        evaluate: () => [{ tableIds: ['round-1'], guestIds: ['g-1'], message: 'x' }],
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
        return seated ? [{ tableIds: ['round-1'], guestIds: ['g-1'], message: 'x' }] : []
      },
    })
    const guard = seatGuardFrom([seesTheCandidateSeated])

    // g-1 is nowhere in makePlan(); a refusal here is only possible if the rule was asked about
    // withSeat's hypothetical, not the plan as handed to the guard.
    expect(guard({ plan: makePlan(), tableId: 'round-1', seatIndex: 0, guest: makeGuest('g-1') })).toBe(false)
  })
})

describe('RulePlan and PlanSoFar are the same shape, checked at compile time', () => {
  it("is mutually assignable with allocate.ts's PlanSoFar, so one evaluate can serve both the report and the guard", () => {
    // As with the seats-readonly marker (commit 2de627a): if the two types were not mutually
    // assignable, this alias would resolve to `false`, and assigning `true` to it would fail
    // typecheck rather than this runtime assertion.
    type BothWays = RulePlan extends PlanSoFar ? (PlanSoFar extends RulePlan ? true : false) : false
    const marker: BothWays = true

    expect(marker).toBe(true)
  })
})
