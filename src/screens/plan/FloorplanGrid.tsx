import type { CSSProperties } from 'react'
import type { RoomConfig } from '../../domain/types'
import { tablesInRoom } from '../../domain/seating'
import { occupantsAt, roundTableColumns, type SeatingView } from './floorplan'
import { PlanTable } from './PlanTable'
import styles from './FloorplanGrid.module.css'

type FloorplanGridProps = {
  room: RoomConfig
  seating: SeatingView
  /** The selected guest's name (TT-12) — present only together with `onPlace`. */
  placingGuestName?: string
  onPlace?: (tableId: string) => void
  onRelease?: (guestId: string) => void
}

type GridStyle = CSSProperties & { '--floorplan-columns': number }

/** A table offers itself as a placing destination only once both halves of "placing" exist. */
function placingFor(
  tableId: string,
  placingGuestName: string | undefined,
  onPlace: ((tableId: string) => void) | undefined,
) {
  if (placingGuestName === undefined || !onPlace) return undefined
  return { guestName: placingGuestName, onPlace: () => onPlace(tableId) }
}

/**
 * TT-11, KB-6 "Plan". Top table first, on its own row above the round-table grid, in its own
 * `<ul>` — a bare `<li>` outside a list loses the "listitem" role, and a `grid-column: 1 / -1`
 * sibling would span every generated track and stop the round grid shrinking below the full
 * column count.
 */
export function FloorplanGrid({ room, seating, placingGuestName, onPlace, onRelease }: FloorplanGridProps) {
  const slots = tablesInRoom(room)
  const topSlot = slots.find((slot) => slot.kind === 'top')
  const roundSlots = slots.filter((slot) => slot.kind === 'round')

  const gridStyle: GridStyle = { '--floorplan-columns': roundTableColumns(roundSlots.length) }

  return (
    <div className={styles.floorplan}>
      {topSlot && (
        <ul className={styles.topRow}>
          <PlanTable
            slot={topSlot}
            occupants={occupantsAt(seating, topSlot.id)}
            placing={placingFor(topSlot.id, placingGuestName, onPlace)}
            onRelease={onRelease}
          />
        </ul>
      )}
      {roundSlots.length > 0 && (
        // tabIndex, role and aria-label live on this wrapper, not the <ul> it contains —
        // role="region" on the <ul> itself would replace its implicit list role, and the round
        // tables would stop being exposed as list items.
        <div className={styles.gridScroll} tabIndex={0} role="region" aria-label="Round tables">
          <ul className={styles.grid} style={gridStyle}>
            {roundSlots.map((slot) => (
              <PlanTable
                key={slot.id}
                slot={slot}
                occupants={occupantsAt(seating, slot.id)}
                placing={placingFor(slot.id, placingGuestName, onPlace)}
                onRelease={onRelease}
              />
            ))}
          </ul>
        </div>
      )}
    </div>
  )
}
