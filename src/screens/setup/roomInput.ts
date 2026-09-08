/**
 * Parsing and display for the room's three number fields. Isolated here so the "zero reads
 * as empty" rule and the "clamp to a non-negative integer" rule are each written once, and
 * RoomForm stays a plain wiring of TextField to the store.
 */

/** '' when the value is 0: zero is the unconfigured state and KB-6 draws the field empty. */
export function displayRoomNumber(value: number): string {
  return value === 0 ? '' : String(value)
}

/** Non-negative integer. '', a negative, a fraction and anything unparseable all resolve. */
export function parseRoomNumber(raw: string): number {
  const parsed = Number(raw)
  return Number.isFinite(parsed) ? Math.max(0, Math.trunc(parsed)) : 0
}
