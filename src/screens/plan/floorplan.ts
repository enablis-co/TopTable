import type { Guest, RoomConfig } from '../../domain/types'

/**
 * TT-11's pure view model for the Plan screen. No React, no store, no CSS — a screen-local
 * module, not a domain one (`docs/engineering-standards.md` puts screens and components on
 * the UI side of the boundary; nothing here is a seating rule).
 */

export type TableKind = 'top' | 'round'

export type TableSlot = {
  /** Stable and config-derived: 'top', or 'round-1' … 'round-N'. */
  id: string
  kind: TableKind
  /** 1-based for round tables. null for the top table. */
  number: number | null
  /** 'Top table', or 'Table 7'. */
  label: string
  /** topTableSeats for the top table, seatsEach for a round one. */
  capacity: number
}

/**
 * A12: coerces a possibly-degenerate room number to a finite, non-negative integer before
 * anything iterates over it. Mirrors `parseRoomNumber` in `src/screens/setup/roomInput.ts`
 * rather than importing it — that function's signature is `(raw: string) => number`, built
 * to parse a text field, and every value here is already a number.
 */
function normaliseCount(value: number): number {
  return Number.isFinite(value) ? Math.max(0, Math.trunc(value)) : 0
}

/**
 * The same A12 coercion, applied to all three fields and exported so every reader of a
 * possibly-degenerate `RoomConfig` shares one rule instead of each computing its own.
 *
 * TT-11's review found `PlanScreen` deciding whether to show the floorplan at all by calling
 * `totalSeats` on the *raw* room, while this module generates the grid from the *normalised*
 * one — so a hand-edited `{ roundTables: -1, seatsEach: 8, topTableSeats: 8 }` totalled 0 on
 * the raw numbers (`-1 * 8 + 8 = 0`) and hid a top table that, once normalised, genuinely has
 * 8 seats. `docs/state.md` is explicit that storage is not a trusted input, so that shape is
 * reachable without editing any code. `PlanScreen` and `PlanHeader` both compute a seat count
 * from `room` for exactly this reason — they call `totalSeats(normaliseRoom(room))` rather
 * than `totalSeats(room)`, so the gate, the header figure and the grid can no longer disagree
 * about the same input.
 */
export function normaliseRoom(room: RoomConfig): RoomConfig {
  return {
    roundTables: normaliseCount(room.roundTables),
    seatsEach: normaliseCount(room.seatsEach),
    topTableSeats: normaliseCount(room.topTableSeats),
  }
}

/**
 * KB-6 "Plan": the top table first (when it has seats), then round tables 1..N in order
 * (C1, C2). Grid-generated from `RoomConfig`, not fixed — a room with `{ 4, 8, 8 }` produces
 * 5 slots and `{ 26, 8, 8 }` produces 27 (C1, C7), the top table counted in both.
 */
export function floorplanFromRoom(room: RoomConfig): TableSlot[] {
  const { roundTables, seatsEach, topTableSeats } = normaliseRoom(room)

  const slots: TableSlot[] = []

  if (topTableSeats > 0) {
    slots.push({ id: 'top', kind: 'top', number: null, label: 'Top table', capacity: topTableSeats })
  }

  for (let number = 1; number <= roundTables; number++) {
    slots.push({
      id: `round-${number}`,
      kind: 'round',
      number,
      label: `Table ${number}`,
      capacity: seatsEach,
    })
  }

  return slots
}

export type Occupancy = 'empty' | 'partial' | 'full'

/**
 * `occupantCount === 0` is tested first, then `>= capacity` — that order, not the reverse, is
 * what makes a zero-capacity table read as empty rather than full.
 */
export function occupancyOf(occupantCount: number, capacity: number): Occupancy {
  if (occupantCount === 0) return 'empty'
  if (occupantCount >= capacity) return 'full'
  return 'partial'
}

/**
 * What is at one table. TT-11 produces none of this — it renders what it is handed, from
 * `NOTHING_SEATED` today and from a real `SeatingView` once TT-12 to TT-14 land.
 */
export type TableOccupants = {
  /**
   * The guests at this table, in the order given. TT-13 owns seat order.
   *
   * `readonly`: every empty table (any id absent from `byTableId`) shares the single
   * `EMPTY_TABLE` object below via `occupantsAt`. TT-11 never mutates it, but TT-12 and TT-13
   * will hold thousands of these, and one `occupants.guests.push(...)` on any of them would
   * silently poison every empty table in the app at once. `readonly` closes that off at the
   * type level, at no runtime cost.
   */
  guests: readonly Guest[]
  /** How many of those are pinned. TT-12 owns pinning. */
  pinnedCount: number
  /** Whether any violation names this table. TT-14 owns violations. */
  inViolation: boolean
}

export type SeatingView = {
  /** Keyed by TableSlot.id. A missing entry is an empty, unpinned, clean table. */
  byTableId: Readonly<Record<string, TableOccupants>>
}

const EMPTY_TABLE: TableOccupants = { guests: [], pinnedCount: 0, inViolation: false }

/**
 * What TT-11 supplies today: nothing is seated, because nothing can be yet. TT-12 (pinning),
 * TT-13 (the seating model) and TT-14 (violations) are what will eventually populate a real
 * `SeatingView` — this constant is what TT-11 renders in the meantime, not a stub to delete.
 */
export const NOTHING_SEATED: SeatingView = { byTableId: {} }

/**
 * The entry for a slot, or the empty-table value. Never undefined — `noUncheckedIndexedAccess`
 * types the lookup as possibly missing, and this is what resolves it, in one place, so no
 * caller repeats the `?? EMPTY_TABLE` fallback.
 */
export function occupantsAt(seating: SeatingView, id: string): TableOccupants {
  return seating.byTableId[id] ?? EMPTY_TABLE
}

/**
 * C5's four counted figures beyond the scenario label. `unseatedCount` is derived from a
 * `Set` of seated guest ids rather than by subtracting a sum of per-table counts — a guest
 * who ends up listed at two tables (a bug elsewhere, but not this function's to assume away)
 * must not push the figure negative. `pinnedCount` is a straight sum: a pin belongs to one
 * table only, so no such double-count risk applies there.
 */
export function planTotals(
  guests: Guest[],
  seating: SeatingView,
): { guestCount: number; pinnedCount: number; unseatedCount: number } {
  const seatedIds = new Set<string>()
  let pinnedCount = 0

  for (const occupants of Object.values(seating.byTableId)) {
    pinnedCount += occupants.pinnedCount
    for (const guest of occupants.guests) {
      seatedIds.add(guest.id)
    }
  }

  return {
    guestCount: guests.length,
    pinnedCount,
    unseatedCount: guests.filter((guest) => !seatedIds.has(guest.id)).length,
  }
}
