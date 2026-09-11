import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  occupancyOf,
  planTotals,
  occupantsAt,
  NOTHING_SEATED,
  roundTableColumns,
  MAX_ROUND_TABLE_COLUMNS,
  seatingViewFrom,
} from './floorplan'
import type { SeatingView, TableOccupants } from './floorplan'
import type { Guest, Pin, RoomConfig } from '../../domain/types'
import { seatPins } from '../../domain/seating'
import { allocate } from '../../domain/allocate'

/**
 * TT-11, "Render the floorplan from config", extended by TT-12's placing tests and TT-13's
 * `seatingViewFrom`. The table-geometry describes (`tablesInRoom`/`normaliseRoom`) and the
 * pins-only seating describes (`seatingFromPins`/`unseatedGuests`, superseded by `seatPins`)
 * moved to `src/domain/seating.test.ts` alongside the model they now exercise. This file keeps
 * the rendering-facing pieces — occupancy, totals, the empty-table default, the CSS-as-text
 * guards — plus the adapter that turns a domain `SeatingPlan` into this screen's `SeatingView`.
 *
 * KB-3's three scenario rooms: small-and-cosy {4,8,8}, adding-up {9,8,6}, celebrity-scale
 * {26,8,8}. "Five tables" and "twenty-seven" both count the top table.
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

function makeGuests(count: number): Guest[] {
  return Array.from({ length: count }, (_, index) => makeGuest(`g-${index}`))
}

function occupantsFixture(overrides: Partial<TableOccupants> = {}): TableOccupants {
  return { guests: [], pinnedCount: 0, inViolation: false, ...overrides }
}

describe('occupancyOf — the three states, and the degenerate zero-capacity table', () => {
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

describe('planTotals', () => {
  it('with nothing seated, nobody is pinned and guestCount is the full list', () => {
    const guests = [makeGuest('g-1'), makeGuest('g-2'), makeGuest('g-3')]
    expect(planTotals(guests, NOTHING_SEATED)).toEqual({
      guestCount: 3,
      pinnedCount: 0,
    })
  })

  it('two guests seated, one pinned, counts the one pin', () => {
    const guests = [makeGuest('g-1'), makeGuest('g-2'), makeGuest('g-3')]
    const seatedPair = [guests[0], guests[1]]
    if (!seatedPair[0] || !seatedPair[1]) {
      throw new Error('expected two seeded guests')
    }
    const seating: SeatingView = {
      byTableId: {
        'round-1': occupantsFixture({
          guests: [
            { guest: seatedPair[0], pinned: true },
            { guest: seatedPair[1], pinned: false },
          ],
          pinnedCount: 1,
        }),
      },
    }

    expect(planTotals(guests, seating)).toEqual({
      guestCount: 3,
      pinnedCount: 1,
    })
  })

  it('pinnedCount sums the per-table figures directly, with no deduplication', () => {
    const guest = makeGuest('g-1')
    const seating: SeatingView = {
      byTableId: {
        'round-1': occupantsFixture({ guests: [{ guest, pinned: true }], pinnedCount: 1 }),
        'round-2': occupantsFixture({ pinnedCount: 2 }),
      },
    }

    expect(planTotals([guest], seating).pinnedCount).toBe(3)
  })

  it('guestCount always equals the guest list length, independent of what the seating claims', () => {
    const guests = [makeGuest('g-1'), makeGuest('g-2')]
    const seating: SeatingView = {
      byTableId: {
        'round-1': occupantsFixture({
          guests: [...guests, makeGuest('not-in-the-guest-list')].map((guest) => ({ guest, pinned: false })),
        }),
      },
    }

    expect(planTotals(guests, seating).guestCount).toBe(2)
  })
})

describe('occupantsAt — the empty-table default, never undefined', () => {
  const emptyTable: TableOccupants = { guests: [], pinnedCount: 0, inViolation: false }

  it('returns the empty-table value for any id at all when nothing is seated', () => {
    expect(occupantsAt(NOTHING_SEATED, 'top')).toEqual(emptyTable)
    expect(occupantsAt(NOTHING_SEATED, 'round-1')).toEqual(emptyTable)
    expect(occupantsAt(NOTHING_SEATED, 'an-id-nobody-generated')).toEqual(emptyTable)
  })

  it('returns the empty-table value for an id missing from a partially-seated view', () => {
    const seating: SeatingView = {
      byTableId: { 'round-1': occupantsFixture({ guests: [{ guest: makeGuest('g-1'), pinned: false }] }) },
    }
    expect(occupantsAt(seating, 'round-2')).toEqual(emptyTable)
  })

  it('returns the real entry, unchanged, for an id that is present', () => {
    const entry = occupantsFixture({
      guests: [{ guest: makeGuest('g-1'), pinned: true }],
      pinnedCount: 1,
      inViolation: true,
    })
    const seating: SeatingView = { byTableId: { 'round-1': entry } }
    expect(occupantsAt(seating, 'round-1')).toEqual(entry)
  })
})

describe('NOTHING_SEATED — the empty fixture PlanHeader.test.tsx renders against', () => {
  it('has no seated tables at all', () => {
    expect(NOTHING_SEATED.byTableId).toEqual({})
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

// TT-11 fix: a fixed repeat(N, ...) column count can only ever overflow below its own minimum
// width, never wrap — a narrow viewport used to scroll the whole row sideways instead of
// adding rows. auto-fit reads the container's real width and wraps instead; --floorplan-columns
// now bounds max-width so fewer-than-the-cap tables can't grow past the per-table ceiling on a
// wide screen. auto-fill is specifically wrong here: unlike auto-fit it would leave empty
// trailing tracks rather than collapsing them, which breaks centering below the table count.
describe('FloorplanGrid.module.css — .grid wraps by width (auto-fit), capped by --floorplan-columns via max-width', () => {
  function readFloorplanGridCss(): string {
    const dir = dirname(fileURLToPath(import.meta.url))
    return readFileSync(join(dir, 'FloorplanGrid.module.css'), 'utf8')
  }

  function stripComments(css: string): string {
    return css.replace(/\/\*[\s\S]*?\*\//g, '')
  }

  it('declares grid-template-columns as auto-fit with a 112px floor, not auto-fill and not a fixed repeat count', () => {
    const css = stripComments(readFloorplanGridCss())
    expect(css).toMatch(/grid-template-columns\s*:\s*repeat\(\s*auto-fit\s*,\s*minmax\(\s*112px/i)
    expect(css).not.toMatch(/auto-fill/i)
  })

  it('bounds max-width with --floorplan-columns, so the per-table ceiling still holds below the table count', () => {
    const css = stripComments(readFloorplanGridCss())
    const rule = /\.grid\s*\{([^}]*)\}/.exec(css)
    expect(rule, 'expected a .grid rule in FloorplanGrid.module.css').not.toBeNull()
    const body = rule?.[1] ?? ''
    expect(body).toMatch(/max-width\s*:\s*calc\([^)]*var\(--floorplan-columns/i)
  })
})

/*
 * Regression, TT-11 review: without `overflow-x: auto`, the round-table grid's own overflow
 * escaped into the document and scrolled the whole page sideways. This guards that
 * `.gridScroll` declares it (not the default `visible`) and does not also pin vertical overflow
 * to hidden or scroll — only a browser pass can confirm the geometry itself.
 *
 * Updated, TT-35 review: the fixed-viewport canvas means vertical overflow now belongs to this
 * box too, not the document — `overflow-y: auto` plus `flex: 1; min-height: 0` (so the box has a
 * real, shrinkable height to hand that overflow into) are what let a tall plan (27 tables) scroll
 * inside the floorplan floor rather than pushing AppShell's .main to scroll the whole screen.
 */
describe('FloorplanGrid.module.css — .gridScroll absorbs the grid\'s overflow, not the document (TT-11, TT-35 review)', () => {
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

  it('.gridScroll does not pin overflow-y to hidden or scroll — either would break the fixed-viewport canvas (permanently clipping a tall plan, or showing a bar even when everything fits)', () => {
    const css = stripComments(readFloorplanGridCss())
    const rule = /\.gridScroll\s*\{([^}]*)\}/.exec(css)
    const body = rule?.[1] ?? ''

    expect(body).not.toMatch(/overflow-y\s*:\s*(hidden|scroll)\b/i)
    expect(body).not.toMatch(/overflow\s*:\s*(hidden|scroll|auto)\b/i)
  })

  it('review fix (TT-35): .gridScroll declares overflow-y: auto and has a real, shrinkable height to scroll within — flex: 1 and min-height: 0 — so a tall plan scrolls here instead of the whole screen', () => {
    const css = stripComments(readFloorplanGridCss())
    const rule = /\.gridScroll\s*\{([^}]*)\}/.exec(css)
    const body = rule?.[1] ?? ''

    expect(body).toMatch(/overflow-y\s*:\s*auto\b/i)
    expect(body).toMatch(/flex\s*:\s*1\b/)
    expect(body).toMatch(/min-height\s*:\s*0\b/)
  })
})

describe('seatingViewFrom — a domain SeatingPlan projected onto this screen (TT-13)', () => {
  it('a table with nothing seated at it gets no entry in byTableId', () => {
    const room: RoomConfig = { roundTables: 2, seatsEach: 4, topTableSeats: 0 }
    const guests = [makeGuest('g-1')]
    const pins: Pin[] = [{ guestId: 'g-1', tableId: 'round-1' }]
    const plan = seatPins(room, guests, pins)

    const seating = seatingViewFrom(plan)

    expect(Object.keys(seating.byTableId)).toEqual(['round-1'])
    expect(seating.byTableId['round-2']).toBeUndefined()
    expect(occupantsAt(seating, 'round-2')).toEqual({ guests: [], pinnedCount: 0, inViolation: false })
  })

  it("a table's guests appear in seat order, which is also guest-list order for an un-allocated plan", () => {
    const room: RoomConfig = { roundTables: 1, seatsEach: 4, topTableSeats: 0 }
    const guests = [makeGuest('g-1'), makeGuest('g-2'), makeGuest('g-3')]
    // Pinned in the opposite order to the guest list — seatPins fills the lowest free seat by
    // walking guests, not pins, so the rendered order should still follow the guest list.
    const pinsReversed: Pin[] = [
      { guestId: 'g-3', tableId: 'round-1' },
      { guestId: 'g-1', tableId: 'round-1' },
      { guestId: 'g-2', tableId: 'round-1' },
    ]
    const plan = seatPins(room, guests, pinsReversed)

    const seating = seatingViewFrom(plan)

    expect(occupantsAt(seating, 'round-1').guests.map(({ guest }) => guest.id)).toEqual(['g-1', 'g-2', 'g-3'])
  })

  it('overflow occupants render after the seated ones, so a hand-pinned ninth guest still reads through to "9 of 8 seats"', () => {
    const room: RoomConfig = { roundTables: 1, seatsEach: 8, topTableSeats: 0 }
    const guests = Array.from({ length: 9 }, (_, index) => makeGuest(`g-${index + 1}`))
    const pins: Pin[] = guests.map((guest) => ({ guestId: guest.id, tableId: 'round-1' }))
    const plan = seatPins(room, guests, pins)

    const occupants = occupantsAt(seatingViewFrom(plan), 'round-1')

    expect(occupants.guests.map(({ guest }) => guest.id)).toEqual([
      'g-1', 'g-2', 'g-3', 'g-4', 'g-5', 'g-6', 'g-7', 'g-8', 'g-9',
    ])
    expect(occupancyOf(occupants.guests.length, 8)).toBe('full')
  })

  it('pinnedCount counts only honoured pins — a solver-filled table with no pins at all reads 0', () => {
    const room: RoomConfig = { roundTables: 1, seatsEach: 8, topTableSeats: 0 }
    const guests = makeGuests(8)
    const plan = allocate(room, guests, [])

    const occupants = occupantsAt(seatingViewFrom(plan), 'round-1')

    expect(occupants.guests).toHaveLength(8)
    expect(occupants.pinnedCount).toBe(0)
  })

  it('two honoured pins plus six solver-filled guests at the same table reads pinnedCount 2', () => {
    const room: RoomConfig = { roundTables: 1, seatsEach: 8, topTableSeats: 0 }
    const guests = makeGuests(8)
    const pins: Pin[] = [
      { guestId: 'g-0', tableId: 'round-1' },
      { guestId: 'g-1', tableId: 'round-1' },
    ]
    const plan = allocate(room, guests, pins)

    const occupants = occupantsAt(seatingViewFrom(plan), 'round-1')

    expect(occupants.guests).toHaveLength(8)
    expect(occupants.pinnedCount).toBe(2)
  })

  it('a table named in the passed-in set reads inViolation: true (TT-14)', () => {
    const room: RoomConfig = { roundTables: 1, seatsEach: 4, topTableSeats: 0 }
    const guests = makeGuests(5)
    const pins: Pin[] = guests.map((guest) => ({ guestId: guest.id, tableId: 'round-1' }))
    const plan = seatPins(room, guests, pins)

    const seating = seatingViewFrom(plan, new Set(['round-1']))

    expect(occupantsAt(seating, 'round-1').inViolation).toBe(true)
  })

  it('a table not named in the passed-in set reads inViolation: false, even while another table is named (TT-14)', () => {
    const room: RoomConfig = { roundTables: 2, seatsEach: 4, topTableSeats: 0 }
    const guests = [makeGuest('g-1'), makeGuest('g-2')]
    const pins: Pin[] = [
      { guestId: 'g-1', tableId: 'round-1' },
      { guestId: 'g-2', tableId: 'round-2' },
    ]
    const plan = seatPins(room, guests, pins)

    const seating = seatingViewFrom(plan, new Set(['round-1']))

    expect(occupantsAt(seating, 'round-2').inViolation).toBe(false)
  })

  it('called with no second argument, every table reads inViolation: false — "no rules registered" (TT-14)', () => {
    const room: RoomConfig = { roundTables: 1, seatsEach: 4, topTableSeats: 0 }
    const guests = makeGuests(5)
    const pins: Pin[] = guests.map((guest) => ({ guestId: guest.id, tableId: 'round-1' }))
    const plan = seatPins(room, guests, pins)

    expect(occupantsAt(seatingViewFrom(plan), 'round-1').inViolation).toBe(false)
  })

  it('a table named in the set with nothing seated still gets its own entry, not the shared empty-table fallback (TT-14)', () => {
    const room: RoomConfig = { roundTables: 2, seatsEach: 4, topTableSeats: 0 }
    const plan = seatPins(room, [], [])

    const seating = seatingViewFrom(plan, new Set(['round-1']))

    expect(Object.keys(seating.byTableId)).toEqual(['round-1'])
    expect(occupantsAt(seating, 'round-1')).toEqual({ guests: [], pinnedCount: 0, inViolation: true })
    expect(occupantsAt(seating, 'round-2')).toEqual({ guests: [], pinnedCount: 0, inViolation: false })
  })

  it('pinnedCount sums correctly against a real seatPins-derived seating view, with two honoured pins', () => {
    const room: RoomConfig = { roundTables: 2, seatsEach: 4, topTableSeats: 0 }
    const guests = makeGuests(6)
    const pins: Pin[] = [
      { guestId: 'g-0', tableId: 'round-1' },
      { guestId: 'g-1', tableId: 'round-1' },
    ]
    const plan = seatPins(room, guests, pins)

    expect(planTotals(guests, seatingViewFrom(plan)).pinnedCount).toBe(2)
  })

  it('is deterministic: the same plan produces a deeply equal view twice', () => {
    const room: RoomConfig = { roundTables: 2, seatsEach: 4, topTableSeats: 4 }
    const guests = makeGuests(6)
    const plan = allocate(room, guests, [])

    expect(seatingViewFrom(plan)).toEqual(seatingViewFrom(plan))
  })
})
