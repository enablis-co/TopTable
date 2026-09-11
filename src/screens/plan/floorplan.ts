import type { Guest } from '../../domain/types'
import type { SeatingPlan } from '../../domain/seating'

/**
 * TT-11's view model for the Plan screen, now fed by TT-13's domain plan through
 * `seatingViewFrom` below. The table geometry itself (`TableSlot`, `tablesInRoom`,
 * `normaliseRoom`) and the seating model moved to `src/domain/seating.ts`, which this screen
 * only ever reads from — nothing here re-derives a table address or a seat.
 */

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

/** A seated guest, alongside whether their own seat is a pin PlanTable can offer to release. */
export type SeatedGuest = {
  guest: Guest
  pinned: boolean
}

export type TableOccupants = {
  /**
   * `readonly`: every empty table shares the single `EMPTY_TABLE` object below, so a mutating
   * call on one would silently poison every empty table in the app at once.
   */
  guests: readonly SeatedGuest[]
  pinnedCount: number
  inViolation: boolean
}

export type SeatingView = {
  /** Keyed by TableSlot.id. A missing entry is an empty, unpinned, clean table. */
  byTableId: Readonly<Record<string, TableOccupants>>
}

const EMPTY_TABLE: TableOccupants = { guests: [], pinnedCount: 0, inViolation: false }

/**
 * The empty SeatingView: every table clean and unpinned. Nothing in the running app builds
 * this any more — `seatingViewFrom` below is what a real screen reads from — but
 * `PlanHeader.test.tsx` still renders against it directly, seven times.
 */
export const NOTHING_SEATED: SeatingView = { byTableId: {} }

/** The entry for a slot, or the empty-table value — never undefined, so callers don't each need their own `?? EMPTY_TABLE` fallback. */
export function occupantsAt(seating: SeatingView, id: string): TableOccupants {
  return seating.byTableId[id] ?? EMPTY_TABLE
}

/**
 * TT-13's domain plan projected onto this screen's render contract. A table with nothing
 * seated at it — no filled seat, no overflow — gets no entry at all, keeping the shared
 * `EMPTY_TABLE` value meaningful rather than allocating an equivalent object per empty table.
 * The one exception is a table `hardViolationTableIds` names: it keeps its entry even when
 * empty, or a violating-but-unseated table would fall back to `EMPTY_TABLE` and lose its mark.
 * Neither of TT-14's two hard rules can implicate an empty table today, so this is latent rather
 * than live, but TT-17 onward can.
 *
 * `hardViolationTableIds` is a `ReadonlySet<string>`, never the engine's `RuleReport` itself —
 * this file has no way to classify severity of its own, so `src/domain/rules/engine.ts` stays
 * the one place that decides which violations are hard (TT-14).
 */
export function seatingViewFrom(
  plan: SeatingPlan,
  hardViolationTableIds: ReadonlySet<string> = new Set(),
): SeatingView {
  const byTableId: Record<string, TableOccupants> = {}

  for (const table of plan.tables) {
    const seated: SeatedGuest[] = []
    const overflow: SeatedGuest[] = []
    let pinnedCount = 0

    for (const seat of table.seats) {
      if (!seat) continue
      seated.push({ guest: seat.guest, pinned: seat.pinned })
      if (seat.pinned) pinnedCount += 1
    }
    // Overflow renders after the seated occupants, so a hand pin that overfilled a table still
    // reads as "9 of 8 seats" (PlanTable's occupancyOf) rather than losing the ninth guest.
    for (const seat of table.overflow) {
      overflow.push({ guest: seat.guest, pinned: seat.pinned })
      if (seat.pinned) pinnedCount += 1
    }

    const inViolation = hardViolationTableIds.has(table.id)
    if (seated.length === 0 && overflow.length === 0 && !inViolation) continue

    byTableId[table.id] = { guests: [...seated, ...overflow], pinnedCount, inViolation }
  }

  return { byTableId }
}

/** guestCount is the guest list's own length; pinnedCount sums the per-table figures. */
export function planTotals(
  guests: Guest[],
  seating: SeatingView,
): { guestCount: number; pinnedCount: number } {
  let pinnedCount = 0

  for (const occupants of Object.values(seating.byTableId)) {
    pinnedCount += occupants.pinnedCount
  }

  return {
    guestCount: guests.length,
    pinnedCount,
  }
}
