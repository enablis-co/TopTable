import type { Pin } from './types'

/**
 * Pin bookkeeping for the plan: who is placed at which table. Pure — no import beyond `Pin`,
 * no store, no rendering — and one pin per guest by construction, so nothing here needs a
 * `Set`, an object's keys, or any other order that could vary between runs.
 */

/**
 * Writes `guestId` -> `tableId`, replacing any pin that guest already held at that pin's own
 * array index rather than appending a second one — otherwise `pinnedTableFor`'s `find` would
 * keep returning a guest's *first* table instead of their latest.
 *
 * Validates nothing and never throws: it never sees the guest list, so it cannot check that
 * `guestId` or `tableId` resolve to anything real. The only caller reads the guest out of the
 * list first, and `pinnedTableFor` ignores a pin it cannot resolve.
 */
export function pinGuest(pins: Pin[], guestId: string, tableId: string): Pin[] {
  const index = pins.findIndex((pin) => pin.guestId === guestId)
  if (index === -1) {
    return [...pins, { guestId, tableId }]
  }
  return pins.map((pin, i) => (i === index ? { guestId, tableId } : pin))
}

/**
 * Drops the pin naming `guestId`. Returns `pins` by the same reference when none matches —
 * `removeGuest` (src/domain/guests.ts) calls through to this on its own early return, and
 * depends on that reference holding.
 */
export function unpinGuest(pins: Pin[], guestId: string): Pin[] {
  if (!pins.some((pin) => pin.guestId === guestId)) {
    return pins
  }
  return pins.filter((pin) => pin.guestId !== guestId)
}

/** The table `guestId` is pinned to, or `null` when they hold no pin. */
export function pinnedTableFor(pins: Pin[], guestId: string): string | null {
  return pins.find((pin) => pin.guestId === guestId)?.tableId ?? null
}
