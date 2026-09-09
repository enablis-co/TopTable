import type { Guest, RoomConfig } from '../../domain/types'

/** TT-11's pure view model for the Plan screen: pure, but screen-local, not a domain module. */

export type TableKind = 'top' | 'round'

export type TableSlot = {
  id: string
  kind: TableKind
  number: number | null
  label: string
  capacity: number
}

/** Coerces a possibly-degenerate room number to a finite, non-negative integer. */
function normaliseCount(value: number): number {
  return Number.isFinite(value) ? Math.max(0, Math.trunc(value)) : 0
}

/**
 * The same coercion applied to all three fields, shared by every reader of `RoomConfig` so the
 * gate, the header and the generator can never disagree about the same stored room.
 */
export function normaliseRoom(room: RoomConfig): RoomConfig {
  return {
    roundTables: normaliseCount(room.roundTables),
    seatsEach: normaliseCount(room.seatsEach),
    topTableSeats: normaliseCount(room.topTableSeats),
  }
}

/** KB-6 "Plan": the top table first (when it has seats), then round tables 1..N, grid-generated from `RoomConfig` rather than fixed. */
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

/** How many `minmax(112px, 200px)` tracks fit across this app's content width at the 112px floor. */
export const MAX_ROUND_TABLE_COLUMNS = 11

/**
 * The column count is a function of table count, not `auto-fit`/`auto-fill`: those respond
 * only to container width, so every real track keeps growing back to the same fixed ceiling
 * regardless of how many tables exist.
 */
export function roundTableColumns(roundTableCount: number): number {
  return Math.max(1, Math.min(roundTableCount, MAX_ROUND_TABLE_COLUMNS))
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

export type TableOccupants = {
  /**
   * `readonly`: every empty table shares the single `EMPTY_TABLE` object below, so a mutating
   * call on one would silently poison every empty table in the app at once.
   */
  guests: readonly Guest[]
  pinnedCount: number
  inViolation: boolean
}

export type SeatingView = {
  /** Keyed by TableSlot.id. A missing entry is an empty, unpinned, clean table. */
  byTableId: Readonly<Record<string, TableOccupants>>
}

const EMPTY_TABLE: TableOccupants = { guests: [], pinnedCount: 0, inViolation: false }

/** Nothing is seated yet — TT-12, TT-13 and TT-14 will populate a real `SeatingView`. Not a stub to delete. */
export const NOTHING_SEATED: SeatingView = { byTableId: {} }

/** The entry for a slot, or the empty-table value — never undefined, so callers don't each need their own `?? EMPTY_TABLE` fallback. */
export function occupantsAt(seating: SeatingView, id: string): TableOccupants {
  return seating.byTableId[id] ?? EMPTY_TABLE
}

/**
 * `unseatedCount` comes from a `Set` of seated guest ids, not a sum of per-table counts, so a
 * guest double-listed at two tables can't push it negative.
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
