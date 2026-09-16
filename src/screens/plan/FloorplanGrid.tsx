import type { CSSProperties } from 'react'
import type { RoomConfig } from '../../domain/types'
import { tablesInRoom } from '../../domain/seating'
import { occupantsAt, type SeatingView } from './floorplan'
import { fitFloorplan } from './floorplanFit'
import { useElementSize } from './useElementSize'
import { PlanTable } from './PlanTable'
import styles from './FloorplanGrid.module.css'

const GRID_GAP = 16 // var(--s-4); fitFloorplan takes it as a number, CSS keeps the token.

type FloorplanGridProps = {
  room: RoomConfig
  seating: SeatingView
  /** The selected guest's name (TT-12) — present only together with `onPlace`. */
  placingGuestName?: string
  onPlace?: (tableId: string) => void
  /** TT-15. Selects a table for the table detail panel; PlanTable itself gives this priority
   * under `placing` for the same click, never both at once. */
  onSelect?: (tableId: string) => void
  selectedTableId?: string | null
  /** TT-36. Threaded straight through to every `PlanTable` — see that file's own doc comment. */
  summaryGuestId?: string | null
  summaryId?: string
  onGuestHover?: (guestId: string, element: Element) => void
  onGuestHoverEnd?: (guestId: string) => void
  onGuestFocus?: (guestId: string, element: Element) => void
  onGuestBlur?: (guestId: string) => void
}

type GridStyle = CSSProperties & { '--floorplan-columns': number; '--table-size': string }

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
export function FloorplanGrid({
  room,
  seating,
  placingGuestName,
  onPlace,
  onSelect,
  selectedTableId,
  summaryGuestId,
  summaryId,
  onGuestHover,
  onGuestHoverEnd,
  onGuestFocus,
  onGuestBlur,
}: FloorplanGridProps) {
  const slots = tablesInRoom(room)
  const topSlot = slots.find((slot) => slot.kind === 'top')
  const roundSlots = slots.filter((slot) => slot.kind === 'round')

  const [gridScrollRef, gridScrollSize] = useElementSize<HTMLDivElement>()
  const fit = fitFloorplan({
    width: gridScrollSize.width,
    height: gridScrollSize.height,
    count: roundSlots.length,
    gap: GRID_GAP,
  })

  const gridStyle: GridStyle = {
    '--floorplan-columns': fit.columns,
    '--table-size': `${fit.size}px`,
  }

  return (
    <div className={styles.floorplan}>
      {topSlot && (
        <ul className={styles.topRow}>
          <PlanTable
            slot={topSlot}
            occupants={occupantsAt(seating, topSlot.id)}
            placing={placingFor(topSlot.id, placingGuestName, onPlace)}
            onSelect={() => onSelect?.(topSlot.id)}
            selected={topSlot.id === selectedTableId}
            summaryGuestId={summaryGuestId}
            summaryId={summaryId}
            onGuestHover={onGuestHover}
            onGuestHoverEnd={onGuestHoverEnd}
            onGuestFocus={onGuestFocus}
            onGuestBlur={onGuestBlur}
          />
        </ul>
      )}
      {roundSlots.length > 0 && (
        // tabIndex, role and aria-label live on this wrapper, not the <ul> it contains —
        // role="region" on the <ul> itself would replace its implicit list role, and the round
        // tables would stop being exposed as list items.
        <div
          className={styles.gridScroll}
          ref={gridScrollRef}
          tabIndex={0}
          role="region"
          aria-label="Round tables"
        >
          <ul className={styles.grid} style={gridStyle}>
            {roundSlots.map((slot) => (
              <PlanTable
                key={slot.id}
                slot={slot}
                occupants={occupantsAt(seating, slot.id)}
                placing={placingFor(slot.id, placingGuestName, onPlace)}
                onSelect={() => onSelect?.(slot.id)}
                selected={slot.id === selectedTableId}
                showFillCount={fit.showsFillCount}
                tableSize={fit.size}
                summaryGuestId={summaryGuestId}
                summaryId={summaryId}
                onGuestHover={onGuestHover}
                onGuestHoverEnd={onGuestHoverEnd}
                onGuestFocus={onGuestFocus}
                onGuestBlur={onGuestBlur}
              />
            ))}
          </ul>
        </div>
      )}
    </div>
  )
}
