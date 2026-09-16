import type { KeyboardEvent } from 'react'
import type { Guest } from '../../domain/types'
import { chairLabel } from './chairNavigation'
import {
  RING,
  chairPositions,
  chairRadius,
  chairsVisibleAt,
  seatRingDash,
  selectionArcEndpoints,
} from './ringGeometry'
import styles from './TableRing.module.css'

type TableRingProps = {
  seats: number
  pinned: boolean
  /** TT-44 (C5, C6). Index `i` is the id of the guest in seat `i`, or `null` when that seat is
   * empty — never "the first k seats", since a seating rule can leave a gap earlier than a
   * guest seated later at the same table. */
  seatGuestIds: readonly (string | null)[]
  /** TT-36. The same per-seat shape as `seatGuestIds`, but the guest itself rather than just its
   * id — `chairLabel` needs a name to build "Seat 3, Danny Whitaker" (C13), and this file has no
   * other way to look one up. Kept alongside `seatGuestIds` rather than replacing it: the
   * `data-guest-id` attribute PlanTable.test.tsx asserts stays exactly what it was. */
  guestsBySeat: readonly (Guest | null)[]
  tableSize: number
  /** TT-36 (C10, C12). Which seat index currently carries the table's one tab stop — roving
   * tabindex, so a table with any number of seats still adds exactly one to the page's tab
   * order. Owned by `PlanTable`, not this file, so it survives this component's own re-renders. */
  activeSeatIndex: number
  onSeatFocus: (seatIndex: number, element: Element) => void
  onSeatBlur: () => void
  onSeatKeyDown: (event: KeyboardEvent<SVGCircleElement>) => void
  onSeatHover: (seatIndex: number, element: Element) => void
  onSeatHoverEnd: (seatIndex: number) => void
  /** TT-36. The guest whose summary is open, if any — an occupied chair carries
   * `aria-describedby` naming the summary card only when it is the one open (never every chair,
   * and never one naming a card that isn't showing that guest). `summaryId` absent means no
   * summary wiring at all — every chair renders with no `aria-describedby`. */
  summaryGuestId: string | null
  summaryId?: string
}

/**
 * TT-35, TT-36, TT-44, KB-5/KB-6 "Lit canvas". The seat ring or its chairs, the table body and
 * the pinned marker for a round table's face.
 *
 * TT-36: the `<svg>` is no longer `aria-hidden` — an occupied chair is now a real, focusable,
 * named control (C8, C13), and a focusable element inside an `aria-hidden` subtree is an ARIA
 * violation, not a workaround. It carries `role="group"`/`aria-label="Seats"` instead. Every
 * other mark this file draws (the dashed fallback ring, the body, the inner selection arc, the
 * pin) is purely decorative and stays `aria-hidden`, individually, now that the ancestor no
 * longer hides them for free.
 *
 * A chair is a `<circle role="button">`: `PlanTable.test.tsx`'s one-button-per-table assertions
 * are `querySelectorAll('button')`, a **tag** selector, so an ARIA-button `<circle>` never counts
 * against them — only the visible number and `Table `/`Place …` copy on the face button itself
 * are that button's name (see PlanTable.tsx's governing-trap comment).
 *
 * Colour comes entirely from the `--ring-*`/`--ring-chair-*` custom properties the ancestor's
 * data-occupancy/data-violation state sets (PlanTable.module.css); this file has no state of its
 * own and reads only its own props.
 */
export function TableRing({
  seats,
  pinned,
  seatGuestIds,
  guestsBySeat,
  tableSize,
  activeSeatIndex,
  onSeatFocus,
  onSeatBlur,
  onSeatKeyDown,
  onSeatHover,
  onSeatHoverEnd,
  summaryGuestId,
  summaryId,
}: TableRingProps) {
  const showChairs = chairsVisibleAt(seats, tableSize)
  const { dash, gap } = seatRingDash(seats)
  const chairSize = chairRadius(seats)
  const selectionArc = selectionArcEndpoints()

  return (
    <svg
      className={styles.svg}
      viewBox={`0 0 ${RING.viewBox} ${RING.viewBox}`}
      // TT-36 (C19): no group at all once there are no chairs to be one — the dashed fallback
      // ring below is already individually aria-hidden, so this is not a second guard for the
      // same thing, only the accessible-tree shape the plan calls for.
      role={showChairs ? 'group' : undefined}
      aria-label={showChairs ? 'Seats' : undefined}
    >
      {/* Review, TT-44: this circle briefly rendered unconditionally, to give the selected and
          violation states something to paint once chairs replaced the seat dashes — but it sits
          at the exact radius the chairs' own centres do, and its stroke is a constant CSS width
          (non-scaling-stroke) while a chair shrinks with the table: at MIN_TABLE_SIZE the band
          (7-9px) was wider than the whole chair (5.8px), painting straight through an empty
          chair's hollow centre and making it read as filled. Back to `!showChairs` only — the
          selected state now carries on the chairs' own stroke width instead (see
          --ring-chair-stroke-width below), and violation already carries on both the body's
          dashed --ring-body-* stroke (unaffected by chairs) and the chairs' own --ring-chair-
          stroke colour. */}
      {!showChairs && (
        <circle
          aria-hidden="true"
          className={styles.ring}
          cx={RING.centre}
          cy={RING.centre}
          r={RING.ringRadius}
          fill="none"
          strokeDasharray={`${dash} ${gap}`}
        />
      )}
      <circle aria-hidden="true" className={styles.body} cx={RING.centre} cy={RING.centre} r={RING.bodyRadius} />
      {/* Review, TT-44 (third pass): "selected" needs a mark with real ink on a full table, at
          the scale floor — the chairs' own stroke (below) is too little of it, spread across
          eight tiny dots, and a shared-radius ring is the collision already fixed once. This
          sits well inside the body instead (`RING.selectionRadius`, `ringGeometry.ts`), so it
          can never reach the chairs regardless of seat count or table size. Always rendered,
          like `.body` — invisible by default (`--ring-selection-stroke-width: 0` on the base
          `.table` rule) and given a real width only by `.table[data-selected='true']`. Its
          colour still has to switch per state so it stays legible against whichever body fill
          is under it — full's slate needs white, everything else needs a dark tone — the same
          problem `--table-number-ink` already solves for the visible digits.
          Review, TT-44 (fourth pass): a full circle at this radius collides with both the pin
          and the fill-count text (see `RING.selectionRadius`'s own comment) — an *arc*
          (`SELECTION_ARC`), not a `<circle>`, confined to the part of the circle nowhere near
          either. */}
      <path
        aria-hidden="true"
        className={styles.selection}
        d={`M ${selectionArc.startX} ${selectionArc.startY} A ${RING.selectionRadius} ${RING.selectionRadius} 0 0 1 ${selectionArc.endX} ${selectionArc.endY}`}
        fill="none"
      />
      {pinned && (
        <circle
          aria-hidden="true"
          className={styles.pin}
          cx={RING.centre + RING.pinOffset}
          cy={RING.centre - RING.pinOffset}
          r={RING.pinRadius}
        />
      )}
      {showChairs &&
        chairPositions(seats).map((chair) => {
          const guestId = seatGuestIds[chair.seatIndex] ?? null
          const guest = guestsBySeat[chair.seatIndex] ?? null
          return (
            <circle
              key={chair.seatIndex}
              className={guestId !== null ? styles.chairOccupied : styles.chairEmpty}
              cx={chair.cx}
              cy={chair.cy}
              r={chairSize}
              data-seat-index={chair.seatIndex}
              data-guest-id={guestId ?? undefined}
              role="button"
              aria-label={chairLabel(chair.seatIndex, guest)}
              aria-describedby={guestId !== null && summaryId && guestId === summaryGuestId ? summaryId : undefined}
              tabIndex={chair.seatIndex === activeSeatIndex ? 0 : -1}
              onFocus={(event) => onSeatFocus(chair.seatIndex, event.currentTarget)}
              onBlur={onSeatBlur}
              onKeyDown={onSeatKeyDown}
              onMouseEnter={(event) => onSeatHover(chair.seatIndex, event.currentTarget)}
              onMouseLeave={() => onSeatHoverEnd(chair.seatIndex)}
            />
          )
        })}
    </svg>
  )
}
