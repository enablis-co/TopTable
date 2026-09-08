/**
 * TT-3: room-level capacity, the three seat numbers from KB-1 turned into slack/exact/short
 * and a suggestion for making them match exactly. Pure and total: no rendering, no store, no
 * repairing of bad input. Per-table capacity — KB-2's "a table must not be seated above its
 * capacity" — is TT-14's rule and deliberately does not live here.
 */

import type { RoomConfig } from './types'

/** How a room's seats compare to its guest count. */
export type CapacityState = 'slack' | 'exact' | 'short'

/**
 * KB-1: seats may exceed guests (fine) or fall short of them (a warning the screen renders,
 * never a block). The room-level picture only — nothing here is per-table.
 */
export type Capacity = {
  totalSeats: number
  guestCount: number
  state: CapacityState
  /** seats − guests when positive, otherwise 0 */
  spare: number
  /** guests − seats when positive, otherwise 0 */
  shortfall: number
}

/**
 * KB-1: total seats is roundTables * seatsEach + topTableSeats, straight. No clamping — the
 * setup screen sanitises what it writes to the store, and a domain function that quietly
 * repaired bad input would hide that bug instead of surfacing it.
 */
export function totalSeats(room: RoomConfig): number {
  return room.roundTables * room.seatsEach + room.topTableSeats
}

/**
 * TT-3: the slack/exact/short picture for one guest count. A zeroed room with zero guests
 * comes back `'exact'` deliberately: 0 seats does equal 0 guests, the screen never renders
 * that case, and special-casing it here would be inventing a rule nobody specified.
 */
export function capacityFor(room: RoomConfig, guestCount: number): Capacity {
  const seats = totalSeats(room)
  const diff = seats - guestCount

  return {
    totalSeats: seats,
    guestCount,
    state: diff > 0 ? 'slack' : diff < 0 ? 'short' : 'exact',
    spare: diff > 0 ? diff : 0,
    shortfall: diff < 0 ? -diff : 0,
  }
}

/**
 * TT-3: a round-table count that would make the room seat a guest count exactly, holding
 * seatsEach and topTableSeats as configured.
 */
export type RoomSuggestion = {
  /** The suggested round-table count. Always >= 1, always differs from room.roundTables. */
  roundTables: number
  /** Seats the suggested room would have. Equals the guest count by construction. */
  totalSeats: number
  /** Whether the suggestion is below or above the configured count. Chooses the verb. */
  direction: 'fewer' | 'more'
}

/** Finite, whole and not negative — what every number feeding `suggestExactRoom` must be. */
function isWholeNonNegative(value: number): boolean {
  return Number.isInteger(value) && value >= 0
}

/**
 * TT-3: holding seatsEach and topTableSeats as configured, is there a round-table count
 * n >= 1 that seats `guestCount` exactly? Total, not partial — bad input (negative,
 * fractional, non-finite) comes back `null` rather than a throw, because this feeds
 * suggestion copy on a screen, not a validator that owns the error.
 *
 * `remainder > 0` rather than `>= 0` is deliberate: n = 0 solves the arithmetic whenever the
 * top table alone seats everyone, but "remove every round table" is not advice worth showing.
 */
export function suggestExactRoom(room: RoomConfig, guestCount: number): RoomSuggestion | null {
  const { seatsEach, topTableSeats, roundTables } = room

  if (
    !isWholeNonNegative(seatsEach) ||
    !isWholeNonNegative(topTableSeats) ||
    !isWholeNonNegative(roundTables) ||
    !isWholeNonNegative(guestCount)
  ) {
    return null
  }

  if (seatsEach < 1) {
    return null
  }

  const remainder = guestCount - topTableSeats
  if (remainder <= 0 || remainder % seatsEach !== 0) {
    return null
  }

  const n = remainder / seatsEach
  if (n === roundTables) {
    return null
  }

  return {
    roundTables: n,
    // Computed from the formula, not copied from guestCount, so the two figures in the UI
    // copy come from their own source rather than one standing in for the other.
    totalSeats: n * seatsEach + topTableSeats,
    direction: n < roundTables ? 'fewer' : 'more',
  }
}
