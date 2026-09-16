import type { Ref } from 'react'
import type { Seat, SeatedTable } from '../../domain/seating'
import type { Guest } from '../../domain/types'
import { Button, Panel, cx, tabularClass } from '../../ui'
import { allergyCounts, dietaryCounts, type NeedCount } from './tableNeeds'
import { guestFactParts } from './guestFacts'
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

/** "Nuts × 1 · Vegan × 2" (KB-6) — the terms within one category, middot-separated. */
function NeedsRun({ counts }: { counts: NeedCount[] }) {
  return (
    <>
      {counts.map((need, index) => (
        <span key={need.term}>
          {index > 0 ? ' · ' : null}
          {need.term} × <span className={tabularClass}>{need.count}</span>
        </span>
      ))}
    </>
  )
}

/**
 * Review, TT-15 (C7, KB-2): an allergy and a dietary preference are recorded in separate fields
 * and, per KB-2's own "Allergies are not dietary preferences", "must not be handled the same
 * way" — one is a safety matter that flags the table for a kitchen brief, the other a catering
 * count that is "not a violation of anything". The original render (`[...allergyCounts(guests),
 * ...dietaryCounts(guests)]` into one flat run) handled them identically: a reader could not tell
 * a nut allergy from a vegan preference without already knowing which term was which. Two
 * labelled runs — "Allergies" and "Dietary", each 11px `--ink-muted`, the same weight the
 * handoff's own Needs block gives its label — make the distinction a word, so it survives
 * `grayscale(1)` (KB-5: colour never carries meaning alone) rather than relying on position or
 * shade. A category with nothing to report renders no row at all, rather than a label over an
 * empty run; both empty keeps the plan's existing words-only sentence.
 */
function NeedsBlock({ allergies, dietary }: { allergies: NeedCount[]; dietary: NeedCount[] }) {
  if (allergies.length === 0 && dietary.length === 0) {
    return (
      <div className={styles.needs}>
        <p className={styles.needsRow}>No allergies or dietary needs</p>
      </div>
    )
  }

  return (
    <div className={styles.needs}>
      {allergies.length > 0 && (
        <p className={styles.needsRow}>
          <span className={styles.needsLabel}>Allergies</span> <NeedsRun counts={allergies} />
        </p>
      )}
      {dietary.length > 0 && (
        <p className={styles.needsRow}>
          <span className={styles.needsLabel}>Dietary</span> <NeedsRun counts={dietary} />
        </p>
      )}
    </div>
  )
}

/**
 * TT-44, KB-6 "Table detail". The facts line is a sibling of the release button, never a child
 * of it — nesting it inside would join the button's accessible name and break the
 * `Release {name} from {label}` regex `PlanScreen.test.tsx` and `planAllocation.test.tsx` both
 * match on (C17).
 */
function SeatRow({ row, tableLabel, onRelease }: { row: Row; tableLabel: string; onRelease: (guestId: string) => void }) {
  const guest = row.seat?.guest ?? null
  const pinned = row.seat?.pinned ?? false
  const parts = guest ? guestFactParts(guest) : []

  return (
    <li className={styles.row}>
      <div className={styles.main}>
        <span className={styles.left}>
          {/* Review, TT-44: an overflow row carries no seat number, but always rendering this
              span — empty rather than omitted — reserves the same fixed width `.facts` below
              insets by, so the name (and the facts line under it) starts at the same left edge
              whether the row has a number or not. */}
          {row.seatNumber !== null ? (
            <span className={cx(styles.seatNumber, tabularClass)}>{row.seatNumber}</span>
          ) : (
            <span className={styles.seatNumber} aria-hidden="true" />
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
      </div>
      {guest !== null && parts.length > 0 && <p className={styles.facts}>{parts.join(' · ')}</p>}
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
  const allergies = allergyCounts(guests)
  const dietary = dietaryCounts(guests)

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
      <NeedsBlock allergies={allergies} dietary={dietary} />
    </Panel>
  )
}
