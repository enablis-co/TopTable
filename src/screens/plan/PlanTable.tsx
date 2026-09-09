import { cx, tabularClass } from '../../ui'
import { occupancyOf, type TableOccupants, type TableSlot } from './floorplan'
import styles from './PlanTable.module.css'

type PlanTableProps = {
  slot: TableSlot
  occupants: TableOccupants
}

/**
 * TT-11, C2, C3, C4. One table, top or round. `data-occupancy`, `data-pinned` and
 * `data-violation` are three independent marks, not one exclusive state (A1) — KB-6's legend
 * draws a pinned dot on a table that is also part of the numbered grid, and KB-5 gives pin
 * and violation their own separate shapes, so a table can be full, pinned and in violation
 * with all three surviving at once. The stylesheet is what makes that composition safe; see
 * its own header comment.
 *
 * `data-pinned` and `data-violation` are `undefined`, never `false`, when the state does not
 * hold. React stringifies a `false` attribute value to the literal text `"false"`, and a bare
 * `[data-pinned]` selector matches that string — so a falsy prop would both render a spurious
 * attribute and make it selectable as if true. Passing `undefined` omits the attribute
 * entirely.
 *
 * A `<li>`, not a button element (A9): TT-11 has no click behaviour — TT-15 introduces it —
 * and `src/ui/brand.test.ts` forbids a raw one outside the shared-component module or the
 * shell.
 *
 * The visible number is bare (a lone digit, to fit a small table at scale), so a
 * `tt-visually-hidden` "Table " prefix carries the context a sighted reader gets from the
 * grid position alone (A10). The top table's own label already reads as a full name ("Top
 * table") and gets no such prefix — repeating "Table" in front of it would be less clear, not
 * more. `tt-visually-hidden` rather than `aria-label` throughout, deliberately: an
 * `aria-label` would displace the visible text as the accessible name (WCAG 2.5.3).
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
