import { cx, tabularClass } from '../../ui'
import { occupancyOf, type TableOccupants, type TableSlot } from './floorplan'
import styles from './PlanTable.module.css'

type PlanTableProps = {
  slot: TableSlot
  occupants: TableOccupants
}

/**
 * TT-11, KB-5, KB-6. One table, top or round. `data-occupancy`, `data-pinned` and
 * `data-violation` are three independent marks — a table can be full, pinned and in violation
 * all at once. `data-pinned`/`data-violation` are `undefined`, never `false`, when the state
 * does not hold: React stringifies `false` to the literal text `"false"`, which a bare
 * `[data-pinned]` selector would still match.
 *
 * A `<li>`, not a button — `src/ui/brand.test.ts` forbids a raw one outside the
 * shared-component module or the shell.
 *
 * The bare visible number gets a `tt-visually-hidden` "Table " prefix, not an `aria-label`,
 * which would displace the visible text as the accessible name (WCAG 2.5.3).
 */
export function PlanTable({ slot, occupants }: PlanTableProps) {
  const occupancy = occupancyOf(occupants.guests.length, slot.capacity)
  const isPinned = occupants.pinnedCount > 0
  const isViolating = occupants.inViolation

  return (
    <li
      className={cx(styles.table, slot.kind === 'top' ? styles.top : styles.round)}
      data-occupancy={occupancy}
      data-pinned={isPinned ? 'true' : undefined}
      data-violation={isViolating ? 'true' : undefined}
    >
      <p className={styles.heading}>
        {slot.kind === 'round' && <span className="tt-visually-hidden">Table </span>}
        {slot.kind === 'top' ? slot.label : slot.number}
        {isPinned && <span className="tt-visually-hidden">, pinned</span>}
        {isViolating && <span className="tt-visually-hidden">, in violation</span>}
      </p>
      <p className={styles.occupancy}>
        <span className={tabularClass}>{occupants.guests.length}</span> of{' '}
        <span className={tabularClass}>{slot.capacity}</span> seats
      </p>
      <ul className={styles.guests}>
        {occupants.guests.map((guest) => (
          <li key={guest.id}>{guest.name}</li>
        ))}
      </ul>
    </li>
  )
}
