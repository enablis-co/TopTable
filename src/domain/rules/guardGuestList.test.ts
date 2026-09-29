import { describe, expect, it } from 'vitest'
import { seatGuardFrom } from './engine'
import { allocate } from '../allocate'
import type { SeatGuard } from '../allocate'
import type { GuardableRule, RulePlan, RuleAssessment, Remedy, Severity, SeatingRule } from './contract'
import type { Seat, SeatedTable } from '../seating'
import type { Guest, RoomConfig } from '../types'

/**
 * TT-17's seam: a hard, seating-remedy rule's `evaluate` now takes the full `RulePlan`, and the
 * guest list it can see on `plan.unseated` is built honestly from `SeatCandidate.guests` (Q1;
 * KB-8). Written from TT-17's plan section 3, S1 through S3 and S7. Does not open engine.ts,
 * contract.ts or allocate.ts.
 *
 * S4 (only a hard, seating rule's finding naming both the candidate table and guest refuses a
 * seat) is unedited, existing coverage in `engine.test.ts`. S5 (`PlanSoFar` is still not
 * assignable to `RulePlan`) is the marker test at `engine.test.ts:515-527`, also unedited. S6
 * (capacity, top-table, everyone-seated and partners-adjacent behave identically) is the claim
 * every existing, unedited `*.rule.test.ts` file makes by continuing to pass. None of the three
 * is re-asserted here.
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

function seatOccupant(guest: Guest): Seat {
  return { guest, pinned: false }
}

function makeTable(id: string, kind: 'round' | 'top', capacity: number, occupants: Record<number, Guest> = {}): SeatedTable {
  return {
    id,
    kind,
    number: kind === 'round' ? 1 : null,
    label: id,
    capacity,
    seats: Array.from({ length: capacity }, (_, i) => {
      const guest = occupants[i]
      return guest ? seatOccupant(guest) : null
    }),
    overflow: [],
  }
}

type RuleOverrides = {
  id: string
  description?: string
  weight?: number
  severity?: Severity
  remedy?: Remedy
  evaluate?: (plan: RulePlan) => RuleAssessment
}

function makeRule(overrides: RuleOverrides): SeatingRule {
  return {
    severity: 'hard',
    remedy: 'seating',
    description: `fixture rule ${overrides.id}`,
    evaluate: () => ({ findings: [], opportunities: 0, missed: 0 }),
    ...overrides,
  }
}

function deepFreeze<T>(value: T): T {
  if (value !== null && typeof value === 'object' && !Object.isFrozen(value)) {
    const record = value as Record<string, unknown>
    for (const key of Object.keys(record)) {
      deepFreeze(record[key])
    }
    Object.freeze(value)
  }
  return value
}

describe('S1 — a hard, seating rule\'s evaluate is typed against RulePlan, and plan.unseated compiles', () => {
  it('the evaluate parameter type and RulePlan are mutually assignable, checked at compile time', () => {
    // Same marker idiom as engine.test.ts:515-527's PlanSoFar/RulePlan check: if either alias
    // resolved to `false`, assigning `true` to it would fail typecheck rather than this runtime
    // assertion running at all.
    type GuardableEvaluateParam = Parameters<GuardableRule['evaluate']>[0]
    type ParamAcceptsRulePlan = RulePlan extends GuardableEvaluateParam ? true : false
    type RulePlanAcceptsParam = GuardableEvaluateParam extends RulePlan ? true : false

    const paramAcceptsRulePlan: ParamAcceptsRulePlan = true
    const rulePlanAcceptsParam: RulePlanAcceptsParam = true

    expect(paramAcceptsRulePlan).toBe(true)
    expect(rulePlanAcceptsParam).toBe(true)
  })

  it('a fixture hard, seating rule reading plan.unseated.length compiles and can be passed to seatGuardFrom', () => {
    const rule = makeRule({
      id: 'reads-unseated',
      evaluate: (plan) => ({ findings: [], opportunities: plan.unseated.length, missed: 0 }),
    })
    const guard = seatGuardFrom([rule])
    const table = makeTable('round-1', 'round', 4)

    expect(() =>
      guard({ plan: { tables: [table] }, tableId: 'round-1', seatIndex: 0, guest: makeGuest('g-1'), guests: [] }),
    ).not.toThrow()
  })
})

describe('S3 — the hypothetical plan a hard seating rule is asked about', () => {
  it('unseated is every candidate.guests entry with no table, in list order; the candidate is seated and never in it', () => {
    const g1 = makeGuest('g1')
    const g2 = makeGuest('g2')
    const g3 = makeGuest('g3')
    const g4 = makeGuest('g4')
    const table: SeatedTable = { ...makeTable('round-1', 'round', 4, { 0: g1 }), overflow: [seatOccupant(g2)] }

    let seen: RulePlan | undefined
    const recorder = makeRule({
      id: 'recorder',
      evaluate: (plan) => {
        seen = plan
        return { findings: [], opportunities: 0, missed: 0 }
      },
    })
    const guard = seatGuardFrom([recorder])

    guard({ plan: { tables: [table] }, tableId: 'round-1', seatIndex: 1, guest: g3, guests: [g1, g2, g3, g4] })

    expect(seen?.unseated).toEqual([g4])
    const seenTable = seen?.tables.find((t) => t.id === 'round-1')
    expect(seenTable?.seats[1]).toEqual({ guest: g3, pinned: false })
  })
})

describe('S2 — every SeatCandidate carries the whole guest list allocate was called with', () => {
  it('a recording guard sees candidate.guests deep-equal to the guest list, on every call', () => {
    const room: RoomConfig = { roundTables: 2, seatsEach: 4, topTableSeats: 0 }
    const guests = Array.from({ length: 6 }, (_, i) => makeGuest(`g-${i}`))
    const seenGuestLists: (readonly Guest[])[] = []
    const recordingGuard: SeatGuard = (candidate) => {
      seenGuestLists.push(candidate.guests)
      return true
    }

    allocate(room, guests, [], { allowSeat: recordingGuard })

    expect(seenGuestLists.length).toBeGreaterThan(0)
    for (const seen of seenGuestLists) {
      expect(seen).toEqual(guests)
    }
  })
})

describe('S7 — the guard does not mutate what it is handed', () => {
  it('candidate.plan and candidate.guests are unchanged after a guard call, even when frozen', () => {
    const g1 = makeGuest('g1')
    const g2 = makeGuest('g2')
    const table = makeTable('round-1', 'round', 4)
    const rule = makeRule({ id: 'noop' })
    const guard = seatGuardFrom([rule])

    const plan = deepFreeze({ tables: [table] })
    const guests = deepFreeze([g1, g2])
    const planBefore = structuredClone(plan)
    const guestsBefore = structuredClone(guests)

    expect(() => guard({ plan, tableId: 'round-1', seatIndex: 0, guest: g1, guests })).not.toThrow()

    expect(plan).toEqual(planBefore)
    expect(guests).toEqual(guestsBefore)
  })
})
