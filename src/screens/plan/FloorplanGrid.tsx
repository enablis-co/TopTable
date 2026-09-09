import type { CSSProperties } from 'react'
import type { RoomConfig } from '../../domain/types'
import { floorplanFromRoom, occupantsAt, roundTableColumns, type SeatingView } from './floorplan'
import { PlanTable } from './PlanTable'
import styles from './FloorplanGrid.module.css'

type FloorplanGridProps = {
  room: RoomConfig
  seating: SeatingView
}

/** The one CSS custom property this component sets — see the comment on the `<ul>` below. */
type GridStyle = CSSProperties & { '--floorplan-columns': number }

/**
 * TT-11, C1, C2, KB-6 "Plan". The top table and the round-table grid, top table first (C2) and on
 * its own row above.
 *
 * Human decision, 2026-09-09, two changes:
 *
 * 1. The top table is rendered in a **separate** `<ul>` from the round tables, not the single
 *    shared list this component started with. That split is load-bearing, not cosmetic: the
 *    round-table grid's column count has to be able to shrink to fewer than every generated
 *    track once there are fewer round tables than fit a row (see point 2), and a
 *    `grid-column: 1 / -1` sibling — the top table's old positioning — spans every one of those
 *    tracks by definition, which would have defeated that collapsing entirely had it stayed in
 *    the same grid. Pulling the top table out sidesteps the question rather than fighting it.
 *
 * 2. The round-table grid's column count is `roundTableColumns(roundSlots.length)` — a plain
 *    number, set as the `--floorplan-columns` custom property below — not `auto-fit`/`auto-fill`.
 *    `roundTableColumns` (in `./floorplan`) and this file's own stylesheet both carry the full
 *    argument for why: in short, `auto-fit`/`auto-fill` respond to *container width*, and at any
 *    choice of floor and ceiling, converge every real track back to the ceiling regardless of how
 *    many tables exist — measured, not assumed, across all three of KB-3's scenarios. Making size
 *    respond to *table count* needs the count itself to choose the number of columns.
 *
 * Two sibling `<ul>`s rather than one shared list is still valid for A9 ("tables are `<li>`
 * elements, not buttons"): a bare `<li>` outside any list container does not carry the
 * "listitem" role, so the top table gets a one-item list of its own (`.topRow`) rather than
 * losing that role. No test in this ticket's suite asserts a single shared list — `PlanTable.test.tsx`
 * and `PlanScreen.test.tsx` both locate tables via `[data-occupancy]`, which does not care how many
 * `<ul>`s own them — and C2's "before every round table in DOM order" holds precisely because the
 * top table's `<ul>` is written first.
 */
export function FloorplanGrid({ room, seating }: FloorplanGridProps) {
  const slots = floorplanFromRoom(room)
  const topSlot = slots.find((slot) => slot.kind === 'top')
  const roundSlots = slots.filter((slot) => slot.kind === 'round')

  // A plain number, no unit — FloorplanGrid.module.css's `.grid` rule is the only place that
  // knows this is a column count, and the only place the 112px/200px track bounds live.
  const gridStyle: GridStyle = { '--floorplan-columns': roundTableColumns(roundSlots.length) }

  return (
    <div className={styles.floorplan}>
      {topSlot && (
        <ul className={styles.topRow}>
          <PlanTable slot={topSlot} occupants={occupantsAt(seating, topSlot.id)} />
        </ul>
      )}
      {roundSlots.length > 0 && (
        <ul className={styles.grid} style={gridStyle}>
          {roundSlots.map((slot) => (
            <PlanTable key={slot.id} slot={slot} occupants={occupantsAt(seating, slot.id)} />
          ))}
        </ul>
      )}
    </div>
  )
}
