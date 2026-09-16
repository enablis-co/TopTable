import { describe, expect, it } from 'vitest'
import { pinnedGuestsIn } from './pinnedGuests'
import { allocate } from '../../domain/allocate'
import { seatPins } from '../../domain/seating'
import type { Seat, SeatedTable, SeatingPlan } from '../../domain/seating'
import type { Guest, Pin, RoomConfig } from '../../domain/types'
import { planTotals, seatingViewFrom } from './floorplan'

/**
 * TT-16 part two. `pinnedGuestsIn` projects a `SeatingPlan` onto the rows the "Pinned guests"
 * panel lists — every pinned guest, by name and table, in a deterministic order. Written from
 * section 9's AC-P criteria and section 10's documented `PinnedGuestRow`/`pinnedGuestsIn` shape.
 * Does not open pinnedGuests.ts.
 *
 * D11's invariant is the one that matters most: the number of rows this returns must equal
 * `planTotals(...).pinnedCount`, the same figure rendered beside the panel in the header. A
 * header saying 3 over a panel listing 2 is the defect most likely to ship, so it is checked
 * against plans built through both `seatPins` and `allocate`, including one with an overflowing
 * pin.
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

function seat(guest: Guest, pinned: boolean): Seat {
  return { guest, pinned }
}

function makeTable(overrides: Partial<SeatedTable> & Pick<SeatedTable, 'id'>): SeatedTable {
  return {
    kind: 'round',
    number: 1,
    label: `Table ${overrides.id}`,
    capacity: 4,
    seats: [null, null, null, null],
    overflow: [],
    ...overrides,
  }
}

function plan(tables: SeatedTable[], unseated: Guest[] = []): SeatingPlan {
  return { tables, unseated }
}

describe('pinnedGuestsIn — one row per pinned guest, by name and table', () => {
  it('two pinned guests at two different tables give two rows, each carrying the guest name and the table label', () => {
    const alice = makeGuest('alice', { name: 'Alice' })
    const bob = makeGuest('bob', { name: 'Bob' })
    const p = plan([
      makeTable({ id: 'round-1', label: 'Table 1', seats: [seat(alice, true), null, null, null] }),
      makeTable({ id: 'round-2', label: 'Table 2', seats: [seat(bob, true), null, null, null] }),
    ])

    const rows = pinnedGuestsIn(p)

    expect(rows).toHaveLength(2)
    expect(rows.find((row) => row.guestId === 'alice')).toMatchObject({
      guestName: 'Alice',
      tableId: 'round-1',
      tableLabel: 'Table 1',
      overCapacity: false,
    })
    expect(rows.find((row) => row.guestId === 'bob')).toMatchObject({
      guestName: 'Bob',
      tableId: 'round-2',
      tableLabel: 'Table 2',
      overCapacity: false,
    })
  })

  it('a solver-seated, unpinned guest contributes no row', () => {
    const carol = makeGuest('carol', { name: 'Carol' })
    const p = plan([makeTable({ id: 'round-1', seats: [seat(carol, false), null, null, null] })])

    expect(pinnedGuestsIn(p)).toHaveLength(0)
  })

  it('an overflow seat with pinned: true is returned and marked over capacity', () => {
    const dana = makeGuest('dana', { name: 'Dana' })
    const p = plan([makeTable({ id: 'round-1', overflow: [seat(dana, true)] })])

    const rows = pinnedGuestsIn(p)
    expect(rows).toHaveLength(1)
    expect(rows[0]).toMatchObject({ guestId: 'dana', overCapacity: true })
  })

  it('an overflow seat with pinned: false contributes no row', () => {
    const eve = makeGuest('eve', { name: 'Eve' })
    const p = plan([makeTable({ id: 'round-1', overflow: [seat(eve, false)] })])

    expect(pinnedGuestsIn(p)).toHaveLength(0)
  })

  it('no pins at all gives an empty array, never null or undefined', () => {
    const p = plan([makeTable({ id: 'round-1' })])
    const rows = pinnedGuestsIn(p)
    expect(rows).not.toBeNull()
    expect(rows).not.toBeUndefined()
    expect(rows).toEqual([])
  })
})

describe('pinnedGuestsIn — deterministic order: table order, then seat order, then overflow', () => {
  it('orders rows by table position, then ascending seat index, then overflow, regardless of insertion order', () => {
    const fromSecondTable = makeGuest('second-table-guest', { name: 'Second Table Guest' })
    const seatOneOfFirst = makeGuest('first-table-seat-1', { name: 'First Table Seat 1' })
    const seatZeroOfFirst = makeGuest('first-table-seat-0', { name: 'First Table Seat 0' })
    const overflowOfFirst = makeGuest('first-table-overflow', { name: 'First Table Overflow' })

    const p = plan([
      makeTable({
        id: 'round-1',
        // Deliberately built out of seat order: index 1 holds a pin, index 0 is set after it.
        seats: [null, seat(seatOneOfFirst, true), null, null],
        overflow: [seat(overflowOfFirst, true)],
      }),
      makeTable({ id: 'round-2', seats: [seat(fromSecondTable, true), null, null, null] }),
    ])
    // Now backfill seat 0 of the first table, after the plan above was already built, to prove
    // the order is read off the plan's own structure rather than remembered from insertion.
    const withSeatZero = plan([
      { ...p.tables[0], seats: [seat(seatZeroOfFirst, true), seat(seatOneOfFirst, true), null, null] } as SeatedTable,
      p.tables[1] as SeatedTable,
    ])

    const rows = pinnedGuestsIn(withSeatZero)

    expect(rows.map((row) => row.guestId)).toEqual([
      'first-table-seat-0',
      'first-table-seat-1',
      'first-table-overflow',
      'second-table-guest',
    ])
  })
})

describe('pinnedGuestsIn — the same plan scored twice is deeply equal', () => {
  it('returns deeply equal rows across two calls on the same plan', () => {
    const guest = makeGuest('frank', { name: 'Frank' })
    const p = plan([makeTable({ id: 'round-1', seats: [seat(guest, true), null, null, null] })])

    expect(pinnedGuestsIn(p)).toEqual(pinnedGuestsIn(p))
  })
})

describe('pinnedGuestsIn — the row count matches the header figure exactly (D11)', () => {
  const room: RoomConfig = { roundTables: 1, seatsEach: 1, topTableSeats: 0 }

  it('agrees with planTotals(...).pinnedCount for a plan built through seatPins, including an overflowing pin', () => {
    const guests: Guest[] = [makeGuest('gemma', { name: 'Gemma' }), makeGuest('harry', { name: 'Harry' })]
    // One seat in the room; both guests hand-pinned to it, so the second overflows.
    const pins: Pin[] = [
      { guestId: 'gemma', tableId: 'round-1' },
      { guestId: 'harry', tableId: 'round-1' },
    ]

    const seated = seatPins(room, guests, pins)
    const rows = pinnedGuestsIn(seated)
    const totals = planTotals(guests, seatingViewFrom(seated))

    expect(rows).toHaveLength(totals.pinnedCount)
    expect(rows.some((row) => row.overCapacity)).toBe(true)
  })

  it('agrees with planTotals(...).pinnedCount for a plan built through allocate, including an overflowing pin', () => {
    const guests: Guest[] = [
      makeGuest('ian', { name: 'Ian' }),
      makeGuest('jo', { name: 'Jo' }),
      makeGuest('ken', { name: 'Ken' }),
    ]
    const pins: Pin[] = [
      { guestId: 'ian', tableId: 'round-1' },
      { guestId: 'jo', tableId: 'round-1' },
    ]

    const allocated = allocate(room, guests, pins)
    const rows = pinnedGuestsIn(allocated)
    const totals = planTotals(guests, seatingViewFrom(allocated))

    expect(rows).toHaveLength(totals.pinnedCount)
    expect(rows.some((row) => row.overCapacity)).toBe(true)
  })

  it('a pin naming a table that does not exist in the room contributes no row, matching a header figure of 0', () => {
    const guests: Guest[] = [makeGuest('lena', { name: 'Lena' })]
    const pins: Pin[] = [{ guestId: 'lena', tableId: 'no-such-table' }]

    const seated = seatPins(room, guests, pins)
    const rows = pinnedGuestsIn(seated)
    const totals = planTotals(guests, seatingViewFrom(seated))

    expect(rows).toHaveLength(0)
    expect(totals.pinnedCount).toBe(0)
  })
})
