import { describe, expect, it } from 'vitest'
import { rule as everyoneSeatedRule } from './everyoneSeated.rule'
import { evaluatePlan, hardViolations } from './engine'
import type { RulePlan } from './contract'
import type { Seat, SeatedTable } from '../seating'
import type { Guest } from '../types'

/**
 * TT-47's everyone-seated hard rule (KB-2: "A guest without a seat is a violation while a seat is
 * free. A room with fewer seats than guests is short rather than in violation"; KB-1: "Seats may
 * fall short of guests, which is a warning and never a block"). Written from TT-47's acceptance
 * criteria and KB-1/KB-2. Does not open everyoneSeated.rule.ts, score.ts or the planOccupancy
 * addition to seating.ts.
 *
 * A guest counts as having "no real seat" whether they are in the plan's own `unseated` list or
 * sitting in a table's `overflow` — a hand pin that overfilled a table gives a guest no seat any
 * more than not pinning them at all does (KB-2; `partnersAdjacent.rule.ts` treats the two the same
 * way for the same reason).
 *
 * The rule is scoped: it fires only up to however many seats the room actually has spare. A room
 * short of seats leaves people standing without ever raising this rule, however many are left —
 * that shortfall is the setup screen's business (KB-1), not a hard violation here.
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

/** A round table of the given capacity, seated with `occupants[i]` at seat i and the rest empty,
 *  plus whatever guests are named in `overflow`. */
function makeTable(id: string, capacity: number, occupants: Record<number, Guest>, overflow: Guest[] = []): SeatedTable {
  return {
    id,
    kind: 'round',
    number: 1,
    label: id,
    capacity,
    seats: Array.from({ length: capacity }, (_, i) => {
      const guest = occupants[i]
      return guest ? seatOccupant(guest) : null
    }),
    overflow: overflow.map(seatOccupant),
  }
}

function makeGuests(count: number, prefix = 'g'): Guest[] {
  return Array.from({ length: count }, (_, index) => makeGuest(`${prefix}-${index}`))
}

describe('everyone seated — fires when a guest has no seat and the room still has one free (KB-2)', () => {
  it('two of four guests unseated, with seats to spare, is exactly one finding', () => {
    const [a, b] = makeGuests(2)
    const table = makeTable('round-1', 4, { 0: a!, 1: b! })
    const plan: RulePlan = { tables: [table], unseated: makeGuests(2, 'unseated') }

    const { findings, opportunities, missed } = everyoneSeatedRule.evaluate(plan)

    expect(findings).toHaveLength(1)
    expect(missed).toBe(2)
    expect(opportunities).toBe(4) // min(guests 4, totalSeats 4)
  })

  it('reads as hard through the engine, with an empty tableIds — this violation is about the room, not a table', () => {
    const [a] = makeGuests(1)
    const table = makeTable('round-1', 4, { 0: a! })
    const plan: RulePlan = { tables: [table], unseated: makeGuests(1, 'unseated') }

    const report = evaluatePlan(plan, [everyoneSeatedRule])
    const hard = hardViolations(report)

    expect(hard).toHaveLength(1)
    expect(hard[0]?.ruleId).toBe('everyone-seated')
    expect(hard[0]?.severity).toBe('hard')
    expect(hard[0]?.remedy).toBe('flag')
    expect(hard[0]?.tableIds).toEqual([])
  })
})

describe('everyone seated — quiet when every guest holds a real seat', () => {
  it('every guest seated, with seats to spare, raises no finding and misses nothing', () => {
    const [a, b] = makeGuests(2)
    const table = makeTable('round-1', 4, { 0: a!, 1: b! })
    const plan: RulePlan = { tables: [table], unseated: [] }

    const { findings, missed } = everyoneSeatedRule.evaluate(plan)

    expect(findings).toEqual([])
    expect(missed).toBe(0)
  })
})

describe('everyone seated — a short room stays quiet once every seat is filled, however many are left standing (KB-1, KB-2)', () => {
  it('fewer seats than guests, every seat filled, is quiet no matter how many stand', () => {
    const [a, b] = makeGuests(2)
    const table = makeTable('round-1', 2, { 0: a!, 1: b! })
    const standing = makeGuests(3, 'standing')
    const plan: RulePlan = { tables: [table], unseated: standing }

    const { findings, opportunities, missed } = everyoneSeatedRule.evaluate(plan)

    expect(findings).toEqual([])
    expect(missed).toBe(0)
    expect(opportunities).toBe(2) // min(guests 5, totalSeats 2)
  })
})

describe('everyone seated — a short room still raises the violation while any seat, including a top-table seat, remains free (KB-2)', () => {
  it('a short room only partly seated counts the free seats it actually has, never the standing guests, and names the true number left standing', () => {
    const [a, b] = makeGuests(2)
    const seatedTable = makeTable('round-1', 3, { 0: a!, 1: b! }) // 1 seat still free here
    const emptyTable = makeTable('round-2', 2, {}) // 2 seats free here
    const standing = makeGuests(8, 'standing') // far more than the 3 free seats total

    const plan: RulePlan = { tables: [seatedTable, emptyTable], unseated: standing }
    const { findings, opportunities, missed } = everyoneSeatedRule.evaluate(plan)

    // 10 guests, 5 total seats, 2 seated -> 3 free seats, 8 standing. missed is capped at the 3
    // free seats, not the 8 who are actually standing.
    expect(opportunities).toBe(5) // min(guests 10, totalSeats 5)
    expect(missed).toBe(3)
    expect(findings).toHaveLength(1)

    // The message reports the true number of unseated guests (8), not missed (3, capped by the
    // free-seat count) — the detail reports the free seats, which is where missed's number lives.
    expect(findings[0]?.message).toBe('8 guests have no seat')
    expect(findings[0]?.detail).toBe('3 seats are still free')
  })
})

describe('everyone seated — a guest in a table\'s overflow is exactly as unseated as one on the unseated list (KB-2)', () => {
  it('an overflowed guest, with a seat free at another table, is counted as having no seat', () => {
    const [a, b] = makeGuests(2)
    const fullTable = makeTable('round-1', 1, { 0: a! }, [b!]) // b overflows here
    const emptyTable = makeTable('round-2', 1, {}) // a seat free elsewhere

    const plan: RulePlan = { tables: [fullTable, emptyTable], unseated: [] }
    const { findings, opportunities, missed } = everyoneSeatedRule.evaluate(plan)

    expect(opportunities).toBe(2) // min(guests 2, totalSeats 2)
    expect(missed).toBe(1)
    expect(findings).toHaveLength(1)
  })
})

describe('everyone seated — opportunities is a property of the guest list against the room, never of how seated the plan is (KB-8)', () => {
  it('the same guest list and room give identical opportunities whether the plan is empty or fully seated', () => {
    const guests = makeGuests(3)
    const emptyTable = makeTable('round-1', 5, {})
    const fullTable = makeTable('round-1', 5, { 0: guests[0]!, 1: guests[1]!, 2: guests[2]! })

    const emptyPlan: RulePlan = { tables: [emptyTable], unseated: guests }
    const fullPlan: RulePlan = { tables: [fullTable], unseated: [] }

    expect(everyoneSeatedRule.evaluate(emptyPlan).opportunities).toBe(
      everyoneSeatedRule.evaluate(fullPlan).opportunities,
    )
  })

  it('zero guests reports zero opportunities and stays quiet, even with real seats configured', () => {
    const table = makeTable('round-1', 6, {})
    const plan: RulePlan = { tables: [table], unseated: [] }

    const { findings, opportunities, missed } = everyoneSeatedRule.evaluate(plan)

    expect(opportunities).toBe(0)
    expect(missed).toBe(0)
    expect(findings).toEqual([])
  })

  it('a room with no seats configured reports zero opportunities, never the raw guest count, and stays quiet (KB-8)', () => {
    const standing = makeGuests(5)
    const plan: RulePlan = { tables: [], unseated: standing }

    const { findings, opportunities, missed } = everyoneSeatedRule.evaluate(plan)

    expect(opportunities).toBe(0) // min(guests 5, totalSeats 0) — not 5
    expect(missed).toBe(0)
    expect(findings).toEqual([])
  })
})

describe('everyone seated — pure: deterministic and non-mutating (docs/engineering-standards.md)', () => {
  it('evaluating the same plan twice gives an equal assessment', () => {
    const [a] = makeGuests(1)
    const table = makeTable('round-1', 3, { 0: a! })
    const plan: RulePlan = { tables: [table], unseated: makeGuests(2, 'unseated') }

    expect(everyoneSeatedRule.evaluate(plan)).toEqual(everyoneSeatedRule.evaluate(plan))
  })

  it('does not mutate the plan it is given', () => {
    const [a] = makeGuests(1)
    const table = makeTable('round-1', 3, { 0: a! })
    const plan: RulePlan = { tables: [table], unseated: makeGuests(2, 'unseated') }
    const before = JSON.parse(JSON.stringify(plan)) as unknown

    everyoneSeatedRule.evaluate(plan)

    expect(JSON.parse(JSON.stringify(plan))).toEqual(before)
  })
})

describe('everyone seated — through evaluateRegistered-style publishability (TT-47, KB-2)', () => {
  it('anybody unseated with a seat free makes the plan unpublishable; fully seating them makes it publishable again', () => {
    const [a, b] = makeGuests(2)
    const shortOfSeated = makeTable('round-1', 3, { 0: a! }) // b has nowhere, one seat still free
    const unpublishablePlan: RulePlan = { tables: [shortOfSeated], unseated: [b!] }

    const fullySeated = makeTable('round-1', 3, { 0: a!, 1: b! })
    const publishablePlan: RulePlan = { tables: [fullySeated], unseated: [] }

    const unpublishableReport = evaluatePlan(unpublishablePlan, [everyoneSeatedRule])
    const publishableReport = evaluatePlan(publishablePlan, [everyoneSeatedRule])

    expect(hardViolations(unpublishableReport)).toHaveLength(1)
    expect(hardViolations(publishableReport)).toHaveLength(0)
  })
})
