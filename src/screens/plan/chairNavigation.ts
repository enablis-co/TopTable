import type { Guest } from '../../domain/types'
import type { SeatedGuest } from './floorplan'

/**
 * TT-36, KB-4. Pure arithmetic and naming for a chair as a navigable, addressable thing — no
 * DOM, so it is testable directly. Backs the roving-tabindex contract C10-C14 settle: exactly
 * one tab stop per table, arrows moving between chairs, each table remembering the chair it was
 * left on.
 */

/** The first occupied seat, or 0 when the table has none — a fresh table's roving tab stop
 * starts somewhere real rather than always on an empty seat 1. */
export function initialSeatIndex(seats: readonly (SeatedGuest | null)[]): number {
  const occupied = seats.findIndex((seat) => seat !== null)
  return occupied === -1 ? 0 : occupied
}

/**
 * `ArrowLeft`/`ArrowUp` move to the previous chair, `ArrowRight`/`ArrowDown` to the next, `Home`
 * to the first, `End` to the last — wrapping at both ends (C11). Any other key returns `null` so
 * the caller knows not to `preventDefault` it — a chair is one of several focusable things on the
 * page and every key that isn't its own has to keep doing whatever it already does (Tab moving
 * focus, for one).
 */
export function nextSeatIndex(current: number, count: number, key: string): number | null {
  if (count <= 0) return null

  switch (key) {
    case 'ArrowLeft':
    case 'ArrowUp':
      return (current - 1 + count) % count
    case 'ArrowRight':
    case 'ArrowDown':
      return (current + 1) % count
    case 'Home':
      return 0
    case 'End':
      return count - 1
    default:
      return null
  }
}

/**
 * "Seat 3, Danny Whitaker" or "Seat 3, empty" (C13) — 1-based, matching both the table detail
 * panel's own rows and KB-4's printed seat positions (C14).
 */
export function chairLabel(seatIndex: number, guest: Guest | null): string {
  return `Seat ${seatIndex + 1}, ${guest ? guest.name : 'empty'}`
}
