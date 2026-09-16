import type { SeatingPlan } from '../../domain/seating'

/** One pinned guest, and the table their pin names. */
export type PinnedGuestRow = {
  guestId: string
  guestName: string
  tableId: string
  tableLabel: string
  /** The pin outran the table's capacity — this guest holds no seat of their own. */
  overCapacity: boolean
}

/**
 * TT-16. Walks `plan.tables` in plan order, each table's `seats` then its `overflow`, so the
 * order is deterministic without a sort. The predicate is `seat.pinned`, not membership of
 * `overflow` — a hand pin that overfilled a table lands there regardless of `pinned`, so
 * `overflow` alone is not "pinned". This is the same predicate `floorplan.ts`'s `seatingViewFrom`
 * already uses for `pinnedCount`, which is what keeps this list's length equal to the header's
 * own figure.
 */
export function pinnedGuestsIn(plan: SeatingPlan): PinnedGuestRow[] {
  const rows: PinnedGuestRow[] = []

  for (const table of plan.tables) {
    for (const seat of table.seats) {
      if (seat !== null && seat.pinned) {
        rows.push({
          guestId: seat.guest.id,
          guestName: seat.guest.name,
          tableId: table.id,
          tableLabel: table.label,
          overCapacity: false,
        })
      }
    }
    for (const seat of table.overflow) {
      if (seat.pinned) {
        rows.push({
          guestId: seat.guest.id,
          guestName: seat.guest.name,
          tableId: table.id,
          tableLabel: table.label,
          overCapacity: true,
        })
      }
    }
  }

  return rows
}
