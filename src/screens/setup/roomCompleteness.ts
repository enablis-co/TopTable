/**
 * Product-owner ruling (fix to TT-3): a top table is always required, at a minimum of
 * `MIN_TOP_TABLE_SEATS`. Validated, not clamped — a room below the minimum is reported, never
 * silently corrected, matching `roomInput.ts`'s own "parse, don't repair" stance.
 *
 * Deliberately not in src/domain/: docs/state.md's "storage is not a trusted input" means a
 * room persisted before this rule existed must still load, so the model stays tolerant of a
 * zero (or one-seat) top table and this check lives at the input boundary instead. Setup
 * surfaces it (CapacityReadout) and Plan gates on it (PlanScreen/PlanEmpty); neither the store
 * nor the domain enforces it.
 */

import type { RoomConfig } from '../../domain/types'

export const MIN_TOP_TABLE_SEATS = 2

/**
 * True once any of the room's three fields has been typed. The all-zero room is not this — it
 * is KB-6's blank first-visit state, not a started-but-unfinished one. Shared with
 * SetupScreen's own "importing over existing data asks first" check (TT-4) so the same
 * predicate is never written twice.
 */
export function hasTypedRoom(room: RoomConfig): boolean {
  return room.roundTables > 0 || room.seatsEach > 0 || room.topTableSeats > 0
}

/**
 * A room that has been started but whose top table has not reached the minimum. The blank
 * `{0,0,0}` first-visit room is exempt on purpose — KB-6 draws it empty, and it is empty
 * rather than incomplete.
 */
export function isTopTableIncomplete(room: RoomConfig): boolean {
  return hasTypedRoom(room) && room.topTableSeats < MIN_TOP_TABLE_SEATS
}
