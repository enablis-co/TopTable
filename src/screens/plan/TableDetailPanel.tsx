import type { Ref } from 'react'
import type { Seat, SeatedTable } from '../../domain/seating'
import type { Guest } from '../../domain/types'
import { Button, Panel, cx, tabularClass } from '../../ui'
import { allergyCounts, dietaryCounts, type NeedCount } from './tableNeeds'
import styles from './TableDetailPanel.module.css'

type TableDetailPanelProps = {
  table: SeatedTable
  onRelease: (guestId: string) => void
  onDismiss: () => void
  /** TT-15: PlanScreen's fallback focus target when a release leaves no rail row to land on
   * (the solver immediately re-seats the guest elsewhere rather than leaving them unseated). */
  dismissButtonRef?: Ref<HTMLButtonElement>
}

type Row = {
  key: string
  /** 1-based; null for an overflow row, which carries no seat of its own (C4, C5). */
  seatNumber: number | null
  seat: Seat | null
  /** True only for an overflow row — a hand pin that outran the table's capacity. */
  overCapacity: boolean
}

/**
 * One row per seat, in seat order, so the row count always equals capacity (C4, C5) — an empty
 * seat renders as `seat: null` rather than being skipped. Overflow rows follow, carrying no seat
 * number of their own (§4.4).
 */
function rowsFor(table: SeatedTable): Row[] {
  const seatRows: Row[] = table.seats.map((seat, index) => ({
    key: `seat-${index}`,
    seatNumber: index + 1,
    seat,
    overCapacity: false,
  }))
  const overflowRows: Row[] = table.overflow.map((seat, index) => ({
    key: `overflow-${index}`,
    seatNumber: null,
    seat,
    overCapacity: true,
  }))
  return [...seatRows, ...overflowRows]
}

function guestsAt(table: SeatedTable): Guest[] {
  const seated = table.seats.flatMap((seat) => (seat ? [seat.guest] : []))
  const overflow = table.overflow.map((seat) => seat.guest)
  return [...seated, ...overflow]
}

function DismissButton({ onDismiss, dismissButtonRef }: { onDismiss: () => void; dismissButtonRef?: Ref<HTMLButtonElement> }) {
  return (
    <Button variant="quiet" className={styles.dismiss} onClick={onDismiss} ref={dismissButtonRef}>
      <span aria-hidden="true">×</span> <span className="tt-visually-hidden">Close table detail</span>
    </Button>
  )
}

/** "Nuts × 1 · Vegan × 2" (KB-6) — allergy counts, then dietary counts, middot-separated. */
function NeedsLine({ needs }: { needs: NeedCount[] }) {
  if (needs.length === 0) {
    return <p className={styles.needs}>No allergies or dietary needs</p>
  }

  return (
    <p className={styles.needs}>
      {needs.map((need, index) => (
        <span key={`${index}-${need.term}`}>
          {index > 0 ? ' · ' : null}
          {need.term} × <span className={tabularClass}>{need.count}</span>
        </span>
      ))}
    </p>
  )
}

function SeatRow({ row, tableLabel, onRelease }: { row: Row; tableLabel: string; onRelease: (guestId: string) => void }) {
  const guest = row.seat?.guest ?? null
  const pinned = row.seat?.pinned ?? false

  return (
    <li className={styles.row}>
      <span className={styles.left}>
        {row.seatNumber !== null && (
          <span className={cx(styles.seatNumber, tabularClass)}>{row.seatNumber}</span>
        )}
        {guest === null ? (
          <span className={styles.empty}>Empty</span>
        ) : pinned ? (
          <Button variant="quiet" className={styles.release} onClick={() => onRelease(guest.id)}>
            <span className="tt-visually-hidden">Release</span> {guest.name}{' '}
            <span className="tt-visually-hidden">from {tableLabel}</span>
            {row.overCapacity && <span className="tt-visually-hidden">, over capacity</span>}
          </Button>
        ) : (
          <span className={styles.name}>
            {guest.name}
            {row.overCapacity && <span className="tt-visually-hidden">, over capacity</span>}
          </span>
        )}
      </span>
      {guest !== null &&
        (pinned ? (
          <span aria-hidden="true" className={styles.pinnedDot} />
        ) : (
          <span className={styles.auto}>auto</span>
        ))}
    </li>
  )
}

/**
 * TT-15, KB-6 "Table detail". Replaces the violations panel while a table is selected (C1, C9).
 * Reads a `SeatedTable` directly, never `SeatingView` — `floorplan.ts`'s `seatingViewFrom`
 * flattens the seat array and throws the seat index away, so it cannot answer "which seat" (C4).
 *
 * The pinned occupant's release control keeps the exact accessible name the floorplan's own
 * release control carried before TT-15 (`PlanScreen.test.tsx` and `planAllocation.test.tsx`
 * match it by regex): a `tt-visually-hidden` "Release" prefix, the visible name, and a
 * `tt-visually-hidden` "from {label}" suffix, each side of an explicit `{' '}` boundary — name-
 * from-content trims each child's own text before joining it to its siblings, so a space only at
 * an element boundary would otherwise be silently dropped. An unpinned occupant reads "auto"
 * (C6); a pinned one additionally carries a decorative, `aria-hidden` filled dot alongside the
 * button — KB-5's own "a pinned guest [gets] a filled dot" convention, the same shape
 * `PlanTable.module.css`'s `.top[data-pinned]::after` already uses — which changes nothing about
 * the button's own accessible name.
 *
 * "Unpinned or cleared" (TT-15's fourth AC) ships as Release only: the store holds pins, not seat
 * assignments (docs/state.md), so a solver-seated guest holds no stored fact a "clear" action
 * could drop. See the plan's own note on this.
 */
export function TableDetailPanel({ table, onRelease, onDismiss, dismissButtonRef }: TableDetailPanelProps) {
  const rows = rowsFor(table)
  const occupantCount = table.seats.filter((seat) => seat !== null).length + table.overflow.length
  const guests = guestsAt(table)
  const needs = [...allergyCounts(guests), ...dietaryCounts(guests)]

  return (
    <Panel title={table.label} actions={<DismissButton onDismiss={onDismiss} dismissButtonRef={dismissButtonRef} />}>
      <p className={styles.occupancy}>
        <span className={tabularClass}>{occupantCount}</span> of{' '}
        <span className={tabularClass}>{table.capacity}</span> seats
      </p>
      <ol className={styles.seats}>
        {rows.map((row) => (
          <SeatRow key={row.key} row={row} tableLabel={table.label} onRelease={onRelease} />
        ))}
      </ol>
      <NeedsLine needs={needs} />
    </Panel>
  )
}
