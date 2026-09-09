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
} from './floorplan'
import type { SeatingView, TableOccupants } from './floorplan'
import type { Guest, RoomConfig } from '../../domain/types'
import { totalSeats } from '../../domain/capacity'

/**
 * TT-11, "Render the floorplan from config" — C1, C2, C3, C4, C5, C7, A12 and determinism.
 * Written from TT-11's own acceptance criteria (fetched from Tickety directly), KB-3's exact
 * room numbers and `docs/style-guide.html`'s floorplan note, against the `floorplan.ts` contract
 * published in `.claude/plans/TT-11.md` section 4. This file does not open floorplan.ts: it is
 * written against the plan's declared signatures only.
 *
 * KB-3's three scenario rooms are quoted directly (cross-checked against both KB-3 and
 * src/domain/scenarios.ts's SCENARIOS manifest, read independently of this file):
 * small-and-cosy {4,8,8}, adding-up {9,8,6}, celebrity-scale {26,8,8}. "Five tables" and
 * "twenty-seven" (C7) both count the top table — the arithmetic only works that way.
 *
 * Every Guest fixture sets `age` to an AgeBand ('adult' etc.), never a number: KB-3 still types
 * the field `number`, but the product decision of 2026-09-09 recorded on Guest.age in
 * src/domain/types.ts makes KB-3 the stale copy here.
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

    // Every later slot is 'round' in order — the letter of C2, checked generically rather than
    // only against the three hand-picked indices above.
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
    // { roundTables: -1, seatsEach: 8, topTableSeats: 8 } from hand-edited storage: raw
    // totalSeats reads -1 * 8 + 8 = 0, which is what PlanScreen's gate tested before this
    // fix — hiding a top table that floorplanFromRoom already rendered because it normalises
    // internally. normaliseRoom is that same normalisation, exported so the gate can share
    // it rather than risk drifting from it.
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
    // The case the argument order exists for: a table with nobody at it reads 'empty' even
    // when its capacity is also 0, which only holds if occupantCount === 0 is tested before
    // >= capacity (0 >= 0 is also true, and would say 'full' if tested first).
    [0, 0, 'empty'],
    // The contrasting corner, to prove the ordering both ways: occupants against a
    // zero-capacity table is 'full', not 'partial' and not an error, once the zero-count
    // short-circuit no longer applies (5 is not 0, and 5 >= 0).
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
    // The same guest, double-listed at two different tables — precisely what a sum-of-counts
    // implementation (2 occupants counted against 1 real guest) would get wrong, and what a
    // Set of seated ids gets right.
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

/*
 * Human decision, 2026-09-09: table size has to shrink as the round-table count grows, which
 * `auto-fit`/`auto-fill` cannot do on their own (FloorplanGrid.module.css's header comment has
 * the full case — measured, not assumed: at this app's 1392px reference content width, 4, 9 and
 * 26 round tables all rendered at exactly 200px with plain `auto-fit`). `roundTableColumns` is
 * the pure function that makes the column count itself respond to the count instead — below the
 * cap, one row of exactly as many columns as tables; at or beyond it, capped and wrapping.
 */
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

/*
 * A narrow regression guard, not a repeat of floorplanStyles.test.ts's more thorough
 * declared-vs-wins treatment of PlanTable.module.css (which this file does not touch): this
 * checks a single fact in FloorplanGrid.module.css as text — that `.grid`'s column count is
 * driven by the `--floorplan-columns` custom property `roundTableColumns` feeds it, and that
 * `auto-fit`/`auto-fill` have not quietly come back. Both would compile and might even look
 * right in a screenshot at one specific table count while reintroducing the exact dead branch
 * this ticket's follow-up exists to close — see this file's own `roundTableColumns` describe
 * block and FloorplanGrid.module.css's header comment for why. A stylesheet-text check cannot
 * prove the browser actually renders different sizes at different counts (only the browser pass
 * can, and that is where this was actually confirmed) — it can only prove the mechanism that
 * makes that possible is still the one in the file, not silently reverted.
 */
describe('FloorplanGrid.module.css — .grid is driven by the JS-computed column count, not auto-fit/auto-fill', () => {
  function readFloorplanGridCss(): string {
    const dir = dirname(fileURLToPath(import.meta.url))
    return readFileSync(join(dir, 'FloorplanGrid.module.css'), 'utf8')
  }

  // The file's own header comment discusses auto-fit/auto-fill in prose, by name, at some
  // length — that is exactly the record of why they were rejected, and worth keeping. Comments
  // are stripped before checking for absence, so this test guards the actual declaration rather
  // than penalising the file for explaining itself.
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
 * TT-11 review, 2026-09-09. Measured directly in a browser (jsdom does no layout —
 * docs/engineering-standards.md, "What the suite cannot see"): at a 1100px viewport with
 * "Adding up" loaded (9 round tables — the narrowest KB-3 scenario that already overflows at
 * the 112px floor: 9 * 112px + 8 * 16px gaps = 1136px of content against a 1052px row), `.grid`
 * left at the default `overflow-x: visible` let that excess escape its own box:
 * `document.documentElement.scrollWidth` (1160px) exceeded its `clientWidth` (1100px) — the
 * 84px overflow, minus AppShell's 24px padding, escaped into the page — and the whole document
 * scrolled sideways, dragging the header and tab bar with it. After `overflow-x: auto`, the same
 * scenario measures 1100 against 1100; Celebrity scale (26 round tables, capped at
 * `MAX_ROUND_TABLE_COLUMNS` = 11 — the widest this grid ever asks to be: 11 * 112px + 10 * 16px
 * = 1392px of content) measures equal document figures at 1024px, 1100px and a 375px phone
 * width too. `justify-content: safe center` (this file's own header comment) was never the
 * defect: its fallback-to-start resolves against whether content overflows the box at all, not
 * against how that overflow is then handled, so the first table's rect stayed at x=24 in every
 * one of those cases, before this fix and after it — and a case that does not overflow at all
 * (four round tables at 1400px) still centres normally, 252px of leftover space on each side,
 * rather than this line quietly turning "safe" into a permanent "start". Vertical scrolling was
 * checked too: forced to a 400px-tall viewport, the document scrolled normally
 * (`window.scrollBy` moved it, scrollHeight 614 against clientHeight 400) while `.grid` itself
 * carried no internal vertical overflow at all (its own scrollHeight and clientHeight both
 * 368px) — nothing here traps it. This test cannot confirm any of that itself — R3's own lesson,
 * and the reason floorplanStyles.test.ts exists at all for PlanTable.module.css: a
 * stylesheet-text check proves a rule is *declared*, never that it *wins*. Only the browser pass
 * does that, and that is where all of the above was actually measured. This just guards that the
 * declaration is not quietly reverted.
 */
describe('FloorplanGrid.module.css — .grid absorbs its own horizontal overflow, not the document (TT-11 review)', () => {
  function readFloorplanGridCss(): string {
    const dir = dirname(fileURLToPath(import.meta.url))
    return readFileSync(join(dir, 'FloorplanGrid.module.css'), 'utf8')
  }

  function stripComments(css: string): string {
    return css.replace(/\/\*[\s\S]*?\*\//g, '')
  }

  it('.grid declares overflow-x: auto, not the default visible', () => {
    const css = stripComments(readFloorplanGridCss())
    const gridRule = /\.grid\s*\{([^}]*)\}/.exec(css)

    expect(gridRule, 'expected a .grid rule in FloorplanGrid.module.css').not.toBeNull()
    const body = gridRule?.[1] ?? ''

    expect(body).toMatch(/overflow-x\s*:\s*auto\b/i)
    expect(body).not.toMatch(/overflow-x\s*:\s*visible\b/i)
  })

  it('.grid does not also pin overflow-y to hidden or scroll — vertical overflow stays with the document', () => {
    const css = stripComments(readFloorplanGridCss())
    const gridRule = /\.grid\s*\{([^}]*)\}/.exec(css)
    const body = gridRule?.[1] ?? ''

    expect(body).not.toMatch(/overflow-y\s*:\s*(hidden|scroll)\b/i)
    expect(body).not.toMatch(/overflow\s*:\s*(hidden|scroll|auto)\b/i)
  })
})
