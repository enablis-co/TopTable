import { Button, cx, tabularClass } from '../../ui'
import type { TableSlot } from '../../domain/seating'
import { occupancyOf, type TableOccupants } from './floorplan'
import { MAX_TABLE_SIZE } from './floorplanFit'
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
  /** TT-38. False once `fitFloorplan` has shrunk this table to its floor — the fill count is
   * hidden, never unmounted, since it is half of this table's accessible name. Defaults true, so
   * every existing caller (the top table included) keeps rendering it. */
  showFillCount?: boolean
  /** TT-44. The table's rendered CSS pixel size, for `TableRing`'s chair-vs-dash-ring floor
   * (C7). Defaults to `MAX_TABLE_SIZE`, matching how `showFillCount` already defaults to `true`,
   * so the top table and every existing test caller keep chairs. */
  tableSize?: number
}

/**
 * TT-11, TT-12, TT-15, KB-5, KB-6. One table, top or round. `data-occupancy`, `data-pinned`,
 * `data-violation` and `data-selected` are four independent marks — a table can be full, pinned,
 * in violation and selected all at once. Each is `undefined`, never `false`, when the state does
 * not hold: React stringifies `false` to the literal text `"false"`, which a bare
 * `[data-pinned]`-style selector would still match. `data-selected` drives the ring's own stroke
 * width (PlanTable.module.css); `aria-pressed` on the face button below is the same fact read by
 * anything that isn't looking at pixels — `UnseatedRail.tsx`'s own row button sets this repo's
 * precedent for exactly this "many items, one selected" shape.
 *
 * A `<li>`, not a button itself — `src/ui/brand.test.ts` forbids a raw one outside the
 * shared-component module or the shell. The face inside it is always a `Button`: TT-15 makes a
 * table clickable at rest (to select it for the table detail panel), not only while a guest is
 * selected on the rail (to place them) — `placing`, when present, takes priority over `onSelect`
 * for the very same click, so the two purposes never compete for one gesture.
 *
 * Review, TT-15: that priority means no table can be *selected* — and so its detail panel, and
 * the release control that panel is now the only home for, cannot be *opened* — while a guest is
 * selected on the rail. Kept rather than reversed: C15 requires placing-by-click to keep working
 * unchanged, and reversing the priority would make the common "guest selected, click a table"
 * gesture sometimes open a panel instead of placing the guest, depending on whether that table
 * happens to already be selected. It is not a dead end — Escape, or clicking the selected guest's
 * own row again, clears the rail selection and hands the click back to `onSelect`
 * (`PlanScreen.tsx`'s Escape handler and `handleSelect`'s own toggle) — but it is a real, if
 * temporary, gap, and `PlanTable.test.tsx` documents it deliberately rather than leaving the next
 * reader to rediscover it.
 *
 * Guest names and the pin-release control that used to live in this file's own `.guests` list
 * (TT-35's documented deviation) now live in `TableDetailPanel` instead (TT-15) — this file
 * renders no guest content at all any more.
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
export function PlanTable({
  slot,
  occupants,
  placing,
  onSelect,
  selected,
  showFillCount = true,
  tableSize = MAX_TABLE_SIZE,
}: PlanTableProps) {
  const occupancy = occupancyOf(occupants.guests.length, slot.capacity)
  const isPinned = occupants.pinnedCount > 0
  const isViolating = occupants.inViolation
  // TT-44 (C5): length from `slot.capacity`, not `occupants.seats.length`, so the shared
  // `EMPTY_TABLE` (whose `seats` is always `[]`) still renders a full ring of empty chairs.
  const occupiedSeats = Array.from(
    { length: slot.capacity },
    (_, i) => occupants.seats[i]?.guest.id ?? null,
  )

  const faceContent = (
    <>
      {slot.kind === 'round' && (
        <TableRing
          seats={slot.capacity}
          pinned={isPinned}
          occupiedSeats={occupiedSeats}
          tableSize={tableSize}
        />
      )}
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
      {/* Visually hidden below the floor, never unmounted — this is still half of the
          accessible name PlanTable.test.tsx and floorplan.test.ts match on (TT-38). */}
      <p className={cx(styles.occupancy, !showFillCount && 'tt-visually-hidden')}>
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
        aria-pressed={selected}
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
