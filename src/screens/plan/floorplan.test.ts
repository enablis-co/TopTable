import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  floorplanFromRoom,
  normaliseRoom,
  occupancyOf,
  planTotals,
  occupantsAt,
  NOTHING_SEATED,
  roundTableColumns,
  MAX_ROUND_TABLE_COLUMNS,
  seatingFromPins,
  unseatedGuests,
} from './floorplan'
import type { SeatingView, TableOccupants } from './floorplan'
import type { Guest, Pin, RoomConfig } from '../../domain/types'
import { totalSeats } from '../../domain/capacity'

/**
 * TT-11, "Render the floorplan from config", extended by TT-12, "Place a guest by clicking".
 * Written from the acceptance criteria and KB-3's exact room numbers, without opening
 * floorplan.ts.
 *
 * KB-3's three scenario rooms: small-and-cosy {4,8,8}, adding-up {9,8,6}, celebrity-scale
 * {26,8,8}. "Five tables" and "twenty-seven" both count the top table.
 *
 * Every Guest fixture sets `age` to an AgeBand, never a number — see the comment on Guest.age
 * in src/domain/types.ts for why KB-3's `number` typing is the stale copy here.
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

function occupantsFixture(overrides: Partial<TableOccupants> = {}): TableOccupants {
  return { guests: [], pinnedCount: 0, inViolation: false, ...overrides }
}

describe('floorplanFromRoom — table count is derived from config (C1, C7)', () => {
  it('renders 5 slots for Small and cosy: 4 round tables + the top table', () => {
    const room: RoomConfig = { roundTables: 4, seatsEach: 8, topTableSeats: 8 }
    expect(floorplanFromRoom(room)).toHaveLength(5)
  })

  it('renders 27 slots for Celebrity scale: 26 round tables + the top table', () => {
    const room: RoomConfig = { roundTables: 26, seatsEach: 8, topTableSeats: 8 }
    expect(floorplanFromRoom(room)).toHaveLength(27)
  })

  it('renders 10 slots for Adding up: 9 round tables + the top table', () => {
    const room: RoomConfig = { roundTables: 9, seatsEach: 8, topTableSeats: 6 }
    expect(floorplanFromRoom(room)).toHaveLength(10)
  })
})

describe('floorplanFromRoom — the top table first, round tables numbered in order (C2, C3)', () => {
  it('puts the top table first, then every round table numbered 1..N with a stable id and label', () => {
    const room: RoomConfig = { roundTables: 3, seatsEach: 8, topTableSeats: 6 }
    const slots = floorplanFromRoom(room)

    expect(slots).toHaveLength(4)
    const [top, r1, r2, r3] = slots
    if (!top || !r1 || !r2 || !r3) {
      throw new Error('expected 4 slots: the top table plus three round tables')
    }

    expect(top).toEqual({ id: 'top', kind: 'top', number: null, label: 'Top table', capacity: 6 })
    expect(r1).toEqual({ id: 'round-1', kind: 'round', number: 1, label: 'Table 1', capacity: 8 })
    expect(r2).toEqual({ id: 'round-2', kind: 'round', number: 2, label: 'Table 2', capacity: 8 })
    expect(r3).toEqual({ id: 'round-3', kind: 'round', number: 3, label: 'Table 3', capacity: 8 })

    // Checked generically too, not just against the three hand-picked indices above.
    expect(slots.slice(1).every((slot) => slot.kind === 'round')).toBe(true)
    expect(slots.slice(1).map((slot) => slot.number)).toEqual([1, 2, 3])
  })

  it('round slots carry capacity === seatsEach; the top slot carries topTableSeats, not seatsEach', () => {
    const room: RoomConfig = { roundTables: 2, seatsEach: 5, topTableSeats: 6 }
    const slots = floorplanFromRoom(room)

    const top = slots.find((slot) => slot.kind === 'top')
    const roundSlots = slots.filter((slot) => slot.kind === 'round')

    expect(top?.capacity).toBe(6)
    expect(roundSlots.map((slot) => slot.capacity)).toEqual([5, 5])
  })
})

describe('floorplanFromRoom — a table type can be entirely absent (C1)', () => {
  it('topTableSeats: 0 renders no top slot, and the round tables still render', () => {
    const room: RoomConfig = { roundTables: 4, seatsEach: 8, topTableSeats: 0 }
    const slots = floorplanFromRoom(room)

    expect(slots).toHaveLength(4)
    expect(slots.every((slot) => slot.kind === 'round')).toBe(true)
    expect(slots.map((slot) => slot.id)).toEqual(['round-1', 'round-2', 'round-3', 'round-4'])
  })

  it('roundTables: 0 with topTableSeats: 8 renders the top table alone', () => {
    const room: RoomConfig = { roundTables: 0, seatsEach: 8, topTableSeats: 8 }
    const slots = floorplanFromRoom(room)

    expect(slots).toEqual([{ id: 'top', kind: 'top', number: null, label: 'Top table', capacity: 8 }])
  })

  it('a room with no round tables and no top table seats renders nothing at all', () => {
    const room: RoomConfig = { roundTables: 0, seatsEach: 8, topTableSeats: 0 }
    expect(floorplanFromRoom(room)).toEqual([])
  })
})

describe('floorplanFromRoom — degenerate config is normalised, not capped (A12)', () => {
  it.each([
    ['NaN', NaN, 0],
    ['a negative number', -5, 0],
    ['a fraction', 2.7, 2],
    ['Infinity', Infinity, 0],
  ] as const)('roundTables: %s produces %i round tables and never throws', (_label, raw, expectedCount) => {
    const room: RoomConfig = { roundTables: raw, seatsEach: 8, topTableSeats: 8 }
    const slots = floorplanFromRoom(room)

    const roundSlots = slots.filter((slot) => slot.kind === 'round')
    expect(roundSlots).toHaveLength(expectedCount)
    for (const slot of slots) {
      expect(Number.isInteger(slot.capacity)).toBe(true)
      expect(slot.capacity).toBeGreaterThanOrEqual(0)
      if (slot.number !== null) {
        expect(Number.isInteger(slot.number)).toBe(true)
        expect(slot.number).toBeGreaterThanOrEqual(1)
      }
    }
  })

  it.each([
    ['NaN', NaN, 0],
    ['a negative number', -3, 0],
    ['a fraction', 4.9, 4],
    ['Infinity', Infinity, 0],
  ] as const)(
    'seatsEach: %s normalises every round table capacity to %i and never throws',
    (_label, raw, expectedCapacity) => {
      const room: RoomConfig = { roundTables: 2, seatsEach: raw, topTableSeats: 8 }
      const slots = floorplanFromRoom(room)

      const roundSlots = slots.filter((slot) => slot.kind === 'round')
      expect(roundSlots).toHaveLength(2)
      for (const slot of roundSlots) {
        expect(slot.capacity).toBe(expectedCapacity)
      }
    },
  )

  it.each([
    ['NaN', NaN],
    ['a negative number', -2],
    ['Infinity', Infinity],
  ] as const)('topTableSeats: %s normalises to 0, so no top slot renders at all', (_label, raw) => {
    const room: RoomConfig = { roundTables: 2, seatsEach: 8, topTableSeats: raw }
    const slots = floorplanFromRoom(room)

    expect(slots.some((slot) => slot.kind === 'top')).toBe(false)
    expect(slots).toHaveLength(2)
  })

  it('topTableSeats: 6.9 normalises to 6 and the top slot still renders, at that capacity', () => {
    const room: RoomConfig = { roundTables: 2, seatsEach: 8, topTableSeats: 6.9 }
    const slots = floorplanFromRoom(room)
    const top = slots.find((slot) => slot.kind === 'top')

    expect(top).toEqual({ id: 'top', kind: 'top', number: null, label: 'Top table', capacity: 6 })
  })

  it('never throws, and never produces a negative, fractional or NaN figure, when every field is degenerate at once', () => {
    const room: RoomConfig = { roundTables: NaN, seatsEach: -8, topTableSeats: 3.9 }
    const slots = floorplanFromRoom(room)

    for (const slot of slots) {
      expect(Number.isFinite(slot.capacity)).toBe(true)
      expect(Number.isInteger(slot.capacity)).toBe(true)
      expect(slot.capacity).toBeGreaterThanOrEqual(0)
    }
  })
})

describe('normaliseRoom — one normalisation, shared by the gate and the generator (regression, TT-11 review)', () => {
  it("matches floorplanFromRoom's own table for the reviewer's exact degenerate room", () => {
    // Hand-edited storage: raw totalSeats reads -1 * 8 + 8 = 0, hiding a top table that
    // floorplanFromRoom already renders because it normalises internally.
    const room: RoomConfig = { roundTables: -1, seatsEach: 8, topTableSeats: 8 }
    const normalised = normaliseRoom(room)
    const slots = floorplanFromRoom(room)
    const [only] = slots

    if (!only) {
      throw new Error('expected exactly one slot: the top table alone')
    }

    expect(normalised).toEqual({ roundTables: 0, seatsEach: 8, topTableSeats: 8 })
    expect(slots).toHaveLength(1)
    expect(only.kind).toBe('top')
    // The figure PlanScreen's gate now computes agrees with there being a real, rendered table.
    expect(totalSeats(normalised)).toBeGreaterThan(0)
  })

  it('is idempotent: normalising an already-normalised room changes nothing', () => {
    const room: RoomConfig = { roundTables: 4, seatsEach: 8, topTableSeats: 8 }
    expect(normaliseRoom(room)).toEqual(room)
  })

  it.each([
    ['NaN', NaN],
    ['a negative number', -5],
    ['a fraction', 2.7],
    ['Infinity', Infinity],
  ] as const)('normalises %s the same way in every field, independently', (_label, raw) => {
    const room: RoomConfig = { roundTables: raw, seatsEach: raw, topTableSeats: raw }
    const normalised = normaliseRoom(room)

    expect(Number.isInteger(normalised.roundTables)).toBe(true)
    expect(Number.isInteger(normalised.seatsEach)).toBe(true)
    expect(Number.isInteger(normalised.topTableSeats)).toBe(true)
    expect(normalised.roundTables).toBeGreaterThanOrEqual(0)
    expect(normalised.seatsEach).toBeGreaterThanOrEqual(0)
    expect(normalised.topTableSeats).toBeGreaterThanOrEqual(0)
  })
})

describe('occupancyOf — the three states, and the degenerate zero-capacity table (C4)', () => {
  it.each([
    [0, 8, 'empty'],
    [8, 8, 'full'],
    [9, 8, 'full'],
    [3, 8, 'partial'],
    // Nobody at a 0-capacity table reads 'empty', which only holds if the zero-count check
    // runs before the capacity check (0 >= 0 would otherwise say 'full').
    [0, 0, 'empty'],
    // The contrasting corner: occupants against a 0-capacity table is 'full', not an error,
    // once the zero-count short-circuit no longer applies.
    [5, 0, 'full'],
  ] as const)('occupancyOf(%i, %i) is %s', (count, capacity, expected) => {
    expect(occupancyOf(count, capacity)).toBe(expected)
  })
})

describe('planTotals (C5)', () => {
  it('with nothing seated, every guest is unseated and nobody is pinned', () => {
    const guests = [makeGuest('g-1'), makeGuest('g-2'), makeGuest('g-3')]
    expect(planTotals(guests, NOTHING_SEATED)).toEqual({
      guestCount: 3,
      pinnedCount: 0,
      unseatedCount: 3,
    })
  })

  it('two guests placed, one pinned, drops unseated by two and counts the one pin', () => {
    const guests = [makeGuest('g-1'), makeGuest('g-2'), makeGuest('g-3')]
    const seatedPair = [guests[0], guests[1]]
    if (!seatedPair[0] || !seatedPair[1]) {
      throw new Error('expected two seeded guests')
    }
    const seating: SeatingView = {
      byTableId: {
        'round-1': occupantsFixture({ guests: [seatedPair[0], seatedPair[1]], pinnedCount: 1 }),
      },
    }

    expect(planTotals(guests, seating)).toEqual({
      guestCount: 3,
      pinnedCount: 1,
      unseatedCount: 1,
    })
  })

  it('a guest listed at two tables does not drive unseatedCount below zero', () => {
    const guest = makeGuest('g-1')
    const guests = [guest]
    // The same guest, double-listed at two tables — what a sum-of-counts implementation would
    // double-count, and what a Set of seated ids gets right.
    const seating: SeatingView = {
      byTableId: {
        'round-1': occupantsFixture({ guests: [guest] }),
        'round-2': occupantsFixture({ guests: [guest] }),
      },
    }

    const totals = planTotals(guests, seating)
    expect(totals.unseatedCount).toBe(0)
    expect(totals.unseatedCount).toBeGreaterThanOrEqual(0)
  })

  it('pinnedCount sums the per-table figures directly, with no deduplication', () => {
    const guest = makeGuest('g-1')
    const seating: SeatingView = {
      byTableId: {
        'round-1': occupantsFixture({ guests: [guest], pinnedCount: 1 }),
        'round-2': occupantsFixture({ pinnedCount: 2 }),
      },
    }

    expect(planTotals([guest], seating).pinnedCount).toBe(3)
  })

  it('guestCount always equals the guest list length, independent of what the seating claims', () => {
    const guests = [makeGuest('g-1'), makeGuest('g-2')]
    const seating: SeatingView = {
      byTableId: {
        'round-1': occupantsFixture({ guests: [...guests, makeGuest('not-in-the-guest-list')] }),
      },
    }

    expect(planTotals(guests, seating).guestCount).toBe(2)
  })
})

describe('occupantsAt — the empty-table default, never undefined (C4, C5)', () => {
  const emptyTable: TableOccupants = { guests: [], pinnedCount: 0, inViolation: false }

  it('returns the empty-table value for any id at all when nothing is seated', () => {
    expect(occupantsAt(NOTHING_SEATED, 'top')).toEqual(emptyTable)
    expect(occupantsAt(NOTHING_SEATED, 'round-1')).toEqual(emptyTable)
    expect(occupantsAt(NOTHING_SEATED, 'an-id-nobody-generated')).toEqual(emptyTable)
  })

  it('returns the empty-table value for an id missing from a partially-seated view', () => {
    const seating: SeatingView = {
      byTableId: { 'round-1': occupantsFixture({ guests: [makeGuest('g-1')] }) },
    }
    expect(occupantsAt(seating, 'round-2')).toEqual(emptyTable)
  })

  it('returns the real entry, unchanged, for an id that is present', () => {
    const entry = occupantsFixture({ guests: [makeGuest('g-1')], pinnedCount: 1, inViolation: true })
    const seating: SeatingView = { byTableId: { 'round-1': entry } }
    expect(occupantsAt(seating, 'round-1')).toEqual(entry)
  })
})

describe('NOTHING_SEATED — what TT-11 hands to every table today', () => {
  it('has no seated tables at all', () => {
    expect(NOTHING_SEATED.byTableId).toEqual({})
  })
})

describe('determinism', () => {
  it('floorplanFromRoom returns deeply equal output for the same room, called twice', () => {
    const room: RoomConfig = { roundTables: 9, seatsEach: 8, topTableSeats: 6 }
    expect(floorplanFromRoom(room)).toEqual(floorplanFromRoom(room))
    // And for two separately-constructed but equal room objects, not just the same reference.
    expect(floorplanFromRoom({ ...room })).toEqual(floorplanFromRoom({ ...room }))
  })
})

// `roundTableColumns` makes the column count respond to table count directly — auto-fit/
// auto-fill can't, since they respond only to container width.
describe('roundTableColumns — the column count responds to the table count (human decision, 2026-09-09)', () => {
  it('below the cap, uses exactly as many columns as there are tables — one row', () => {
    expect(roundTableColumns(1)).toBe(1)
    expect(roundTableColumns(4)).toBe(4)
    expect(roundTableColumns(9)).toBe(9)
  })

  it('at exactly the cap, uses the cap', () => {
    expect(roundTableColumns(MAX_ROUND_TABLE_COLUMNS)).toBe(MAX_ROUND_TABLE_COLUMNS)
  })

  it('beyond the cap, stays at the cap rather than growing further — this is what makes extra tables add rows, not narrower columns', () => {
    expect(roundTableColumns(MAX_ROUND_TABLE_COLUMNS + 1)).toBe(MAX_ROUND_TABLE_COLUMNS)
    expect(roundTableColumns(26)).toBe(MAX_ROUND_TABLE_COLUMNS)
    expect(roundTableColumns(200)).toBe(MAX_ROUND_TABLE_COLUMNS)
  })

  it('never returns fewer than one column, even for a degenerate zero or negative count', () => {
    expect(roundTableColumns(0)).toBe(1)
    expect(roundTableColumns(-5)).toBe(1)
  })

  it('is a pure function: the same count always produces the same column count', () => {
    expect(roundTableColumns(9)).toBe(roundTableColumns(9))
  })
})

// Checks that .grid's column count still comes from `--floorplan-columns`, not auto-fit/
// auto-fill quietly reintroduced — both would compile and could even look right in a
// screenshot at one table count while silently reverting the fix above.
describe('FloorplanGrid.module.css — .grid is driven by the JS-computed column count, not auto-fit/auto-fill', () => {
  function readFloorplanGridCss(): string {
    const dir = dirname(fileURLToPath(import.meta.url))
    return readFileSync(join(dir, 'FloorplanGrid.module.css'), 'utf8')
  }

  // Comments are stripped first, so a prose mention of auto-fit in the file's own header
  // comment doesn't fail this check.
  function stripComments(css: string): string {
    return css.replace(/\/\*[\s\S]*?\*\//g, '')
  }

  it('declares grid-template-columns from var(--floorplan-columns), not auto-fit or auto-fill', () => {
    const css = stripComments(readFloorplanGridCss())
    expect(css).toMatch(/grid-template-columns\s*:\s*repeat\(\s*var\(--floorplan-columns/i)
    expect(css).not.toMatch(/auto-fit/i)
    expect(css).not.toMatch(/auto-fill/i)
  })
})

/*
 * Regression, TT-11 review: without `overflow-x: auto`, the round-table grid's own overflow
 * escaped into the document and scrolled the whole page sideways. This guards that
 * `.gridScroll` declares it (not the default `visible`) and does not also trap vertical
 * scrolling, which belongs to the document — only a browser pass can confirm the geometry itself.
 */
describe('FloorplanGrid.module.css — .gridScroll absorbs the grid\'s horizontal overflow, not the document (TT-11 review)', () => {
  function readFloorplanGridCss(): string {
    const dir = dirname(fileURLToPath(import.meta.url))
    return readFileSync(join(dir, 'FloorplanGrid.module.css'), 'utf8')
  }

  function stripComments(css: string): string {
    return css.replace(/\/\*[\s\S]*?\*\//g, '')
  }

  it('.gridScroll declares overflow-x: auto, not the default visible', () => {
    const css = stripComments(readFloorplanGridCss())
    const rule = /\.gridScroll\s*\{([^}]*)\}/.exec(css)

    expect(rule, 'expected a .gridScroll rule in FloorplanGrid.module.css').not.toBeNull()
    const body = rule?.[1] ?? ''

    expect(body).toMatch(/overflow-x\s*:\s*auto\b/i)
    expect(body).not.toMatch(/overflow-x\s*:\s*visible\b/i)
  })

  it('.gridScroll does not also pin overflow-y to hidden or scroll — vertical overflow stays with the document', () => {
    const css = stripComments(readFloorplanGridCss())
    const rule = /\.gridScroll\s*\{([^}]*)\}/.exec(css)
    const body = rule?.[1] ?? ''

    expect(body).not.toMatch(/overflow-y\s*:\s*(hidden|scroll)\b/i)
    expect(body).not.toMatch(/overflow\s*:\s*(hidden|scroll|auto)\b/i)
  })
})

describe('seatingFromPins — placing guests at slots from a pin list (TT-12)', () => {
  it('two pins on round-1 and one on top seat the right guests at the right slots; every other slot stays empty', () => {
    const room: RoomConfig = { roundTables: 3, seatsEach: 8, topTableSeats: 6 }
    const slots = floorplanFromRoom(room)
    const guests = [makeGuest('g-1'), makeGuest('g-2'), makeGuest('g-3')]
    const pins: Pin[] = [
      { guestId: 'g-1', tableId: 'round-1' },
      { guestId: 'g-2', tableId: 'round-1' },
      { guestId: 'g-3', tableId: 'top' },
    ]

    const seating = seatingFromPins(slots, guests, pins)

    expect(occupantsAt(seating, 'round-1').guests.map((g) => g.id)).toEqual(['g-1', 'g-2'])
    expect(occupantsAt(seating, 'top').guests.map((g) => g.id)).toEqual(['g-3'])
    expect(occupantsAt(seating, 'round-2')).toEqual({ guests: [], pinnedCount: 0, inViolation: false })
    expect(occupantsAt(seating, 'round-3')).toEqual({ guests: [], pinnedCount: 0, inViolation: false })
  })

  it('every seated table has pinnedCount equal to its own guest count, and inViolation false — TT-12 seats only through pins', () => {
    const room: RoomConfig = { roundTables: 2, seatsEach: 8, topTableSeats: 6 }
    const slots = floorplanFromRoom(room)
    const guests = [makeGuest('g-1'), makeGuest('g-2'), makeGuest('g-3')]
    const pins: Pin[] = [
      { guestId: 'g-1', tableId: 'round-1' },
      { guestId: 'g-2', tableId: 'round-1' },
      { guestId: 'g-3', tableId: 'round-2' },
    ]

    const seating = seatingFromPins(slots, guests, pins)

    for (const tableId of Object.keys(seating.byTableId)) {
      const occupants = occupantsAt(seating, tableId)
      expect(occupants.pinnedCount).toBe(occupants.guests.length)
      expect(occupants.inViolation).toBe(false)
    }
  })

  it('feeding the result to planTotals: three pins across two tables count three pinned and drop unseated by three', () => {
    const room: RoomConfig = { roundTables: 2, seatsEach: 8, topTableSeats: 6 }
    const slots = floorplanFromRoom(room)
    const guests = [makeGuest('g-1'), makeGuest('g-2'), makeGuest('g-3'), makeGuest('g-4'), makeGuest('g-5')]
    const pins: Pin[] = [
      { guestId: 'g-1', tableId: 'round-1' },
      { guestId: 'g-2', tableId: 'round-1' },
      { guestId: 'g-3', tableId: 'round-2' },
    ]

    const seating = seatingFromPins(slots, guests, pins)

    expect(planTotals(guests, seating)).toEqual({ guestCount: 5, pinnedCount: 3, unseatedCount: 2 })
  })

  it('guest order within a table follows the guest list, not the order pins were made — two pin arrays in opposite order produce deeply equal seating', () => {
    const room: RoomConfig = { roundTables: 1, seatsEach: 8, topTableSeats: 0 }
    const slots = floorplanFromRoom(room)
    const guests = [makeGuest('g-1'), makeGuest('g-2')]
    const pinsForward: Pin[] = [
      { guestId: 'g-1', tableId: 'round-1' },
      { guestId: 'g-2', tableId: 'round-1' },
    ]
    const pinsReversed: Pin[] = [
      { guestId: 'g-2', tableId: 'round-1' },
      { guestId: 'g-1', tableId: 'round-1' },
    ]

    const seatingForward = seatingFromPins(slots, guests, pinsForward)
    const seatingReversed = seatingFromPins(slots, guests, pinsReversed)

    expect(seatingReversed).toEqual(seatingForward)
    expect(occupantsAt(seatingReversed, 'round-1').guests.map((g) => g.id)).toEqual(['g-1', 'g-2'])
  })

  it('a pin naming a table not in the room is ignored: that guest is unseated, no slot gains them, and nothing throws', () => {
    const room: RoomConfig = { roundTables: 3, seatsEach: 8, topTableSeats: 6 }
    const slots = floorplanFromRoom(room)
    const guests = [makeGuest('g-1')]
    const pins: Pin[] = [{ guestId: 'g-1', tableId: 'round-99' }]

    expect(() => seatingFromPins(slots, guests, pins)).not.toThrow()
    const seating = seatingFromPins(slots, guests, pins)

    for (const slot of slots) {
      expect(occupantsAt(seating, slot.id).guests).toEqual([])
    }
    expect(unseatedGuests(guests, seating)).toEqual(guests)
  })

  it('a pin naming a guest not in the list is ignored the same way', () => {
    const room: RoomConfig = { roundTables: 1, seatsEach: 8, topTableSeats: 0 }
    const slots = floorplanFromRoom(room)
    const guests = [makeGuest('g-1')]
    const pins: Pin[] = [{ guestId: 'g-ghost', tableId: 'round-1' }]

    const seating = seatingFromPins(slots, guests, pins)

    expect(occupantsAt(seating, 'round-1').guests).toEqual([])
    expect(unseatedGuests(guests, seating)).toEqual(guests)
  })

  it('removing the only pin at a table returns it to pinnedCount: 0, which is what clears the dot', () => {
    const room: RoomConfig = { roundTables: 1, seatsEach: 8, topTableSeats: 0 }
    const slots = floorplanFromRoom(room)
    const guests = [makeGuest('g-1')]

    const withPin = seatingFromPins(slots, guests, [{ guestId: 'g-1', tableId: 'round-1' }])
    expect(occupantsAt(withPin, 'round-1').pinnedCount).toBe(1)

    const withoutPin = seatingFromPins(slots, guests, [])
    expect(occupantsAt(withoutPin, 'round-1').pinnedCount).toBe(0)
  })

  it('is deterministic: the same slots, guests and pins produce deeply equal seating when called twice', () => {
    const room: RoomConfig = { roundTables: 2, seatsEach: 8, topTableSeats: 6 }
    const slots = floorplanFromRoom(room)
    const guests = [makeGuest('g-1'), makeGuest('g-2')]
    const pins: Pin[] = [{ guestId: 'g-1', tableId: 'round-1' }]

    expect(seatingFromPins(slots, guests, pins)).toEqual(seatingFromPins(slots, guests, pins))
    expect(seatingFromPins([...slots], [...guests], [...pins])).toEqual(seatingFromPins(slots, guests, pins))
  })
})

describe('unseatedGuests — the guests with no resolvable pin (TT-12)', () => {
  it('with no pins at all, every guest is unseated, in guest-list order', () => {
    const room: RoomConfig = { roundTables: 1, seatsEach: 8, topTableSeats: 0 }
    const slots = floorplanFromRoom(room)
    const guests = [makeGuest('g-1'), makeGuest('g-2'), makeGuest('g-3')]
    const seating = seatingFromPins(slots, guests, [])

    expect(unseatedGuests(guests, seating)).toEqual(guests)
  })

  it('returns exactly the guests with no resolvable pin, in guest-list order', () => {
    const room: RoomConfig = { roundTables: 1, seatsEach: 8, topTableSeats: 0 }
    const slots = floorplanFromRoom(room)
    const guests = [makeGuest('g-1'), makeGuest('g-2'), makeGuest('g-3')]
    const pins: Pin[] = [{ guestId: 'g-2', tableId: 'round-1' }]
    const seating = seatingFromPins(slots, guests, pins)

    expect(unseatedGuests(guests, seating).map((g) => g.id)).toEqual(['g-1', 'g-3'])
  })

  it('with every guest seated, returns an empty list', () => {
    const room: RoomConfig = { roundTables: 1, seatsEach: 8, topTableSeats: 0 }
    const slots = floorplanFromRoom(room)
    const guests = [makeGuest('g-1'), makeGuest('g-2')]
    const pins: Pin[] = [
      { guestId: 'g-1', tableId: 'round-1' },
      { guestId: 'g-2', tableId: 'round-1' },
    ]
    const seating = seatingFromPins(slots, guests, pins)

    expect(unseatedGuests(guests, seating)).toEqual([])
  })

  it('a pin naming a table not in the room does not count as seating the guest — they still show as unseated', () => {
    const room: RoomConfig = { roundTables: 1, seatsEach: 8, topTableSeats: 0 }
    const slots = floorplanFromRoom(room)
    const guests = [makeGuest('g-1')]
    const pins: Pin[] = [{ guestId: 'g-1', tableId: 'round-99' }]
    const seating = seatingFromPins(slots, guests, pins)

    expect(unseatedGuests(guests, seating)).toEqual(guests)
  })

  it('reads who is seated off the given SeatingView rather than re-resolving pins: a guest seated there with no pin of their own still counts as seated', () => {
    const guest1 = makeGuest('g-1')
    const guest2 = makeGuest('g-2')
    const seating: SeatingView = { byTableId: { 'round-1': occupantsFixture({ guests: [guest1] }) } }

    expect(unseatedGuests([guest1, guest2], seating).map((g) => g.id)).toEqual(['g-2'])
  })
})
