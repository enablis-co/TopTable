import { Button, cx, tabularClass } from '../../ui'
import type { TableSlot } from '../../domain/seating'
import { occupancyOf, type TableOccupants } from './floorplan'
import styles from './PlanTable.module.css'

type PlanTableProps = {
  slot: TableSlot
  occupants: TableOccupants
  /** Present only while a guest is selected on the rail (TT-12) — see the face branch below. */
  placing?: { guestName: string; onPlace: () => void }
  onRelease?: (guestId: string) => void
}

/**
 * TT-11, TT-12, KB-5, KB-6. One table, top or round. `data-occupancy`, `data-pinned` and
 * `data-violation` are three independent marks — a table can be full, pinned and in violation
 * all at once. `data-pinned`/`data-violation` are `undefined`, never `false`, when the state
 * does not hold: React stringifies `false` to the literal text `"false"`, which a bare
 * `[data-pinned]` selector would still match.
 *
 * A `<li>`, not a button — `src/ui/brand.test.ts` forbids a raw one outside the
 * shared-component module or the shell. The face inside it only becomes interactive while
 * `placing` is set (a guest is selected and this table is offered as a destination); the
 * guest names inside must themselves be interactive to release a pin, and one control cannot
 * nest inside another, so the table itself stays a plain element the rest of the time.
 *
 * The bare visible number gets a `tt-visually-hidden` "Table " prefix, not an `aria-label`,
 * which would displace the visible text as the accessible name (WCAG 2.5.3). While `placing`,
 * that prefix is replaced by "Place {guest} at Table " rather than sitting beside it — two
 * copies of "Table" would read as "…at Table Table 7" — and the top table (whose own label
 * already supplies the word) drops the prefix's own "Table " entirely.
 *
 * Name-from-content trims each child element's own text before joining it to its siblings, so
 * a space sitting only at the boundary between two elements (rather than inside one of their
 * own text runs) is silently dropped — the face and release buttons below each carry an
 * explicit `{' '}` between such siblings for exactly that reason.
 */
export function PlanTable({ slot, occupants, placing, onRelease }: PlanTableProps) {
  const occupancy = occupancyOf(occupants.guests.length, slot.capacity)
  const isPinned = occupants.pinnedCount > 0
  const isViolating = occupants.inViolation

  const faceContent = (
    <>
      <p className={styles.heading}>
        {slot.kind === 'round' && !placing && <span className="tt-visually-hidden">Table </span>}
        {slot.kind === 'top' ? slot.label : slot.number}
        {isPinned && <span className="tt-visually-hidden">, pinned</span>}
        {isViolating && <span className="tt-visually-hidden">, in violation</span>}
      </p>{' '}
      <p className={styles.occupancy}>
        <span className={tabularClass}>{occupants.guests.length}</span> of{' '}
        <span className={tabularClass}>{slot.capacity}</span> seats
      </p>
    </>
  )

  return (
    <li
      className={cx(styles.table, slot.kind === 'top' ? styles.top : styles.round)}
      data-occupancy={occupancy}
      data-pinned={isPinned ? 'true' : undefined}
      data-violation={isViolating ? 'true' : undefined}
    >
      {placing ? (
        <Button variant="quiet" className={styles.face} onClick={placing.onPlace}>
          <span className="tt-visually-hidden">
            Place {placing.guestName} at {slot.kind === 'round' ? 'Table ' : ''}
          </span>{' '}
          {faceContent}
        </Button>
      ) : (
        <div className={styles.face}>{faceContent}</div>
      )}
      <ul className={styles.guests}>
        {occupants.guests.map((guest) =>
          onRelease ? (
            <li key={guest.id}>
              <Button variant="quiet" className={styles.release} onClick={() => onRelease(guest.id)}>
                <span className="tt-visually-hidden">Release</span> {guest.name}{' '}
                <span className="tt-visually-hidden">from {slot.label}</span>
              </Button>
            </li>
          ) : (
            <li key={guest.id}>{guest.name}</li>
          ),
        )}
      </ul>
    </li>
  )
}
