import { useState } from 'react'
import type { KeyboardEvent } from 'react'
import { Button, cx, tabularClass } from '../../ui'
import type { TableSlot } from '../../domain/seating'
import { occupancyOf, type TableOccupants } from './floorplan'
import { MAX_TABLE_SIZE } from './floorplanFit'
import { initialSeatIndex, nextSeatIndex } from './chairNavigation'
import { TableRing } from './TableRing'
import { TopTableRow } from './TopTableRow'
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
  /** TT-36. Which guest's hover summary, if any, is currently open — see `UnseatedRail`'s own
   * copy of these same four props for the full rationale. All optional: a caller that hasn't
   * wired the summary up gets a table with no hover or focus behaviour on its chairs beyond the
   * roving tabindex itself. */
  summaryGuestId?: string | null
  summaryId?: string
  onGuestHover?: (guestId: string, element: Element) => void
  onGuestHoverEnd?: (guestId: string) => void
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
 * TT-35/TT-44 built `TableRing` and `TopTableRow` as children of the face, inside `faceContent`
 * below; TT-36 moved both out to be siblings of the face `Button` instead (see the comment where
 * they render). A focusable, named chair — which the floorplan half of TT-36 requires — is
 * invalid content for a button element and would join its accessible name via name-from-content;
 * staying outside the button is what keeps this file's whole "no aria-label displaces the
 * visible text" guarantee true regardless of what a chair itself carries. The top table's own
 * middot separator (below) stays a real `aria-hidden` element inside the button, not a CSS
 * `::after` — generated content participates in Chrome's accessible-name computation but not
 * jsdom's, which would make the two disagree silently.
 *
 * TT-36: `activeSeatIndex` is local state, seeded once from `initialSeatIndex` and never
 * re-derived — `FloorplanGrid` keys every table by `slot.id`, so this state survives this
 * component's own re-renders and is what makes C12 ("a table remembers the chair it was left
 * on") true. Arrow/Home/End on a chair move it (`nextSeatIndex`) and move DOM focus to match;
 * hovering or focusing an occupied chair also opens its guest's summary, exactly as a rail row
 * does (`onGuestHover`/`onGuestHoverEnd`).
 */
export function PlanTable({
  slot,
  occupants,
  placing,
  onSelect,
  selected,
  showFillCount = true,
  tableSize = MAX_TABLE_SIZE,
  summaryGuestId = null,
  summaryId,
  onGuestHover,
  onGuestHoverEnd,
}: PlanTableProps) {
  const occupancy = occupancyOf(occupants.guests.length, slot.capacity)
  const isPinned = occupants.pinnedCount > 0
  const isViolating = occupants.inViolation
  // TT-44 (C5): length from `slot.capacity`, not `occupants.seats.length`, so the shared
  // `EMPTY_TABLE` (whose `seats` is always `[]`) still renders a full ring of empty chairs.
  const guestsBySeat = Array.from({ length: slot.capacity }, (_, i) => occupants.seats[i]?.guest ?? null)
  const seatGuestIds = guestsBySeat.map((guest) => guest?.id ?? null)

  // TT-36 (C10, C12). Seeded once — see the file's own doc comment for why this never
  // re-derives on a later render. Clamped defensively against the table's *current* capacity: a
  // room edit that shrinks this table after the state was seeded must not leave the stored index
  // pointing past the last seat, which would leave no chair carrying `tabIndex={0}` at all (C10).
  const [activeSeatIndex, setActiveSeatIndex] = useState(() => initialSeatIndex(occupants.seats))
  const safeActiveSeatIndex = Math.min(activeSeatIndex, Math.max(0, slot.capacity - 1))

  function handleSeatFocus(seatIndex: number, element: Element) {
    setActiveSeatIndex(seatIndex)
    const guestId = seatGuestIds[seatIndex] ?? null
    if (guestId !== null) onGuestHover?.(guestId, element)
  }

  // The blurring chair is the one this render's own closure still calls "active" — focus moving
  // to a *different* chair inside this same table goes through `handleSeatKeyDown` below, which
  // updates `activeSeatIndex` and moves DOM focus in the same synchronous pass, so React has not
  // yet re-rendered (and rebound this handler) by the time the old chair's blur fires.
  function handleSeatBlur() {
    const guestId = seatGuestIds[safeActiveSeatIndex] ?? null
    if (guestId !== null) onGuestHoverEnd?.(guestId)
  }

  function handleSeatKeyDown(event: KeyboardEvent<SVGCircleElement>) {
    const next = nextSeatIndex(safeActiveSeatIndex, slot.capacity, event.key)
    if (next === null) return

    event.preventDefault()
    setActiveSeatIndex(next)
    const target = event.currentTarget.ownerSVGElement?.querySelector<SVGCircleElement>(
      `[data-seat-index="${next}"]`,
    )
    target?.focus()
  }

  function handleSeatHover(seatIndex: number, element: Element) {
    const guestId = seatGuestIds[seatIndex] ?? null
    if (guestId !== null) onGuestHover?.(guestId, element)
  }

  function handleSeatHoverEnd(seatIndex: number) {
    const guestId = seatGuestIds[seatIndex] ?? null
    if (guestId !== null) onGuestHoverEnd?.(guestId)
  }

  const faceContent = (
    <>
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
      {/* TT-44 (amendment, C3-C3d), TT-36 (structural move): the chair row/ring is a sibling of
          the face below, never a child of it — a focusable chair inside a button element is
          invalid HTML, and a named one would join the button's own accessible name via
          name-from-content (TT-36's governing trap; see PlanTable.test.tsx's rescoped aria-label
          assertions). Round
          and top tables each render their own shape here (TableRing's clock face, TopTableRow's
          single line) — the two differ enough that reusing one path for both would be the wrong
          kind of consistency. Rendered before the button, matching this pair's own DOM-tree-order
          paint rule: .table's container-type makes it a stacking context, so these
          position:absolute, z-index:auto siblings paint in tree order, under the button's own
          positioned heading/occupancy text (PlanTable.module.css). */}
      {slot.kind === 'top' && (
        <TopTableRow
          seats={slot.capacity}
          seatGuestIds={seatGuestIds}
          guestsBySeat={guestsBySeat}
          activeSeatIndex={safeActiveSeatIndex}
          onSeatFocus={handleSeatFocus}
          onSeatBlur={handleSeatBlur}
          onSeatKeyDown={handleSeatKeyDown}
          onSeatHover={handleSeatHover}
          onSeatHoverEnd={handleSeatHoverEnd}
          summaryGuestId={summaryGuestId}
          summaryId={summaryId}
        />
      )}
      {slot.kind === 'round' && (
        <TableRing
          seats={slot.capacity}
          pinned={isPinned}
          seatGuestIds={seatGuestIds}
          guestsBySeat={guestsBySeat}
          tableSize={tableSize}
          activeSeatIndex={safeActiveSeatIndex}
          onSeatFocus={handleSeatFocus}
          onSeatBlur={handleSeatBlur}
          onSeatKeyDown={handleSeatKeyDown}
          onSeatHover={handleSeatHover}
          onSeatHoverEnd={handleSeatHoverEnd}
          summaryGuestId={summaryGuestId}
          summaryId={summaryId}
        />
      )}
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
