import { Button, cx, tabularClass } from '../../ui'
import type { TableSlot } from '../../domain/seating'
import { occupancyOf, type TableOccupants } from './floorplan'
import { TableRing } from './TableRing'
import styles from './PlanTable.module.css'

type PlanTableProps = {
  slot: TableSlot
  occupants: TableOccupants
  /** Present only while a guest is selected on the rail (TT-12) — see the face branch below. */
  placing?: { guestName: string; onPlace: () => void }
  /** Absent only when the caller offers no selection at all — every real caller passes one. */
  onSelect?: () => void
  /** TT-15. Drives `data-selected` below; the ring's own stroke widens from it (PlanTable.module.css). */
  selected?: boolean
}

/**
 * TT-11, TT-12, TT-15, KB-5, KB-6. One table, top or round. `data-occupancy`, `data-pinned`,
 * `data-violation` and `data-selected` are four independent marks — a table can be full, pinned,
 * in violation and selected all at once. Each is `undefined`, never `false`, when the state does
 * not hold: React stringifies `false` to the literal text `"false"`, which a bare
 * `[data-pinned]`-style selector would still match.
 *
 * A `<li>`, not a button itself — `src/ui/brand.test.ts` forbids a raw one outside the
 * shared-component module or the shell. The face inside it is always a `Button`: TT-15 makes a
 * table clickable at rest (to select it for the table detail panel), not only while a guest is
 * selected on the rail (to place them) — `placing`, when present, takes priority over `onSelect`
 * for the very same click, so the two purposes never compete for one gesture. Guest names and the
 * pin-release control that used to live in this file's own `.guests` list (TT-35's documented
 * deviation) now live in `TableDetailPanel` instead (TT-15) — this file renders no guest content
 * at all any more.
 *
 * The bare visible number gets a `tt-visually-hidden` "Table " prefix, not an `aria-label`,
 * which would displace the visible text as the accessible name (WCAG 2.5.3). While `placing`,
 * that prefix is replaced by "Place {guest} at Table " rather than sitting beside it — two
 * copies of "Table" would read as "…at Table Table 7" — and the top table (whose own label
 * already supplies the word) drops the prefix's own "Table " entirely. At rest (neither placing
 * nor yet clicked), the accessible name is simply the visible content — selecting is not
 * announced with a verb of its own, matching how the table read before it was clickable.
 *
 * Name-from-content trims each child element's own text before joining it to its siblings, so
 * a space sitting only at the boundary between two elements (rather than inside one of their
 * own text runs) is silently dropped — the face below carries an explicit `{' '}` between such
 * siblings for exactly that reason.
 *
 * TT-35: `TableRing` (round tables only) renders first inside the face, before `.heading`. It
 * needs no `{' '}` boundary of its own — it is `aria-hidden` and carries no text, so it is
 * invisible to name-from-content entirely, unlike every other sibling in this file. The top
 * table's own middot separator (below) is the same: a real `aria-hidden` element, not a CSS
 * `::after` — generated content participates in Chrome's accessible-name computation but not
 * jsdom's, which would make the two disagree silently.
 */
export function PlanTable({ slot, occupants, placing, onSelect, selected }: PlanTableProps) {
  const occupancy = occupancyOf(occupants.guests.length, slot.capacity)
  const isPinned = occupants.pinnedCount > 0
  const isViolating = occupants.inViolation

  const faceContent = (
    <>
      {slot.kind === 'round' && <TableRing seats={slot.capacity} pinned={isPinned} />}
      <p className={styles.heading}>
        {slot.kind === 'round' && !placing && <span className="tt-visually-hidden">Table </span>}
        {slot.kind === 'top' ? slot.label : slot.number}
        {isPinned && <span className="tt-visually-hidden">, pinned</span>}
        {isViolating && <span className="tt-visually-hidden">, in violation</span>}
      </p>{' '}
      {slot.kind === 'top' && (
        <>
          <span aria-hidden="true">·</span>{' '}
        </>
      )}
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
      data-selected={selected ? 'true' : undefined}
    >
      <Button
        variant="quiet"
        className={styles.face}
        onClick={placing ? placing.onPlace : onSelect}
      >
        {placing && (
          <>
            <span className="tt-visually-hidden">
              Place {placing.guestName} at {slot.kind === 'round' ? 'Table ' : ''}
            </span>{' '}
          </>
        )}
        {faceContent}
      </Button>
    </li>
  )
}
