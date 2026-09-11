import type { Guest, Pin, RoomConfig } from '../../domain/types'

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

/** How many 112px-floor round-table columns this app's content width can hold at most. */
export const MAX_ROUND_TABLE_COLUMNS = 11

/**
 * Caps the table count at MAX_ROUND_TABLE_COLUMNS. FloorplanGrid.module.css feeds this into a
 * `max-width` on the grid, not a literal column count — `auto-fit` computes the live column
 * count from the container's actual width and wraps, so this only stops fewer-than-the-cap
 * tables growing past the per-table ceiling on a wide screen (TT-11 fix).
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

/**
 * The empty SeatingView: every table clean and unpinned. `seatingFromPins` is what a real
 * screen reads from now (TT-12); this remains as the fixture tests reach for when nothing is
 * seated at all.
 */
export const NOTHING_SEATED: SeatingView = { byTableId: {} }

/** The entry for a slot, or the empty-table value — never undefined, so callers don't each need their own `?? EMPTY_TABLE` fallback. */
export function occupantsAt(seating: SeatingView, id: string): TableOccupants {
  return seating.byTableId[id] ?? EMPTY_TABLE
}

/** guestId -> tableId, from the pins that resolve. Used by seatingFromPins to build its buckets. */
function liveTableByGuestId(slots: TableSlot[], pins: Pin[]): Map<string, string> {
  const validIds = new Set(slots.map((slot) => slot.id))
  const byGuestId = new Map<string, string>()
  for (const pin of pins) {
    if (validIds.has(pin.tableId)) {
      byGuestId.set(pin.guestId, pin.tableId)
    }
  }
  return byGuestId
}

/**
 * Iterates `guests`, not `pins`, so a table's guest order always follows the guest list
 * regardless of pin order — two routes to the same seating state render identically. A pin
 * naming a guest or table that does not resolve is ignored rather than repaired: storage is
 * not a trusted input, and shrinking the room can strand a pin on a table that no longer
 * exists. `pinnedCount` equals the bucket length and `inViolation` is always false — until
 * TT-13's auto-allocate exists every seated guest is a pinned one, and TT-14 owns violations.
 */
export function seatingFromPins(slots: TableSlot[], guests: Guest[], pins: Pin[]): SeatingView {
  const tableByGuestId = liveTableByGuestId(slots, pins)

  const buckets = new Map<string, Guest[]>()
  for (const guest of guests) {
    const tableId = tableByGuestId.get(guest.id)
    if (tableId === undefined) continue

    const bucket = buckets.get(tableId)
    if (bucket) {
      bucket.push(guest)
    } else {
      buckets.set(tableId, [guest])
    }
  }

  const byTableId: Record<string, TableOccupants> = {}
  for (const [tableId, tableGuests] of buckets) {
    byTableId[tableId] = { guests: tableGuests, pinnedCount: tableGuests.length, inViolation: false }
  }

  return { byTableId }
}

/**
 * The complement of a SeatingView's buckets: guests seated at no table, in guest-list order.
 * Reads the seating it is handed rather than re-resolving pins its own way, so this and
 * planTotals's own unseatedCount can never disagree about who counts as seated.
 */
export function unseatedGuests(guests: Guest[], seating: SeatingView): Guest[] {
  const seatedIds = new Set<string>()
  for (const occupants of Object.values(seating.byTableId)) {
    for (const guest of occupants.guests) {
      seatedIds.add(guest.id)
    }
  }
  return guests.filter((guest) => !seatedIds.has(guest.id))
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
