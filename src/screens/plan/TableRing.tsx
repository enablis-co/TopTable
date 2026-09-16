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
  tableSize: number
}

/**
 * TT-35, TT-44, KB-5/KB-6 "Lit canvas". The seat ring's decorative body for a round table's
 * face: the dashed fallback ring, the table body, the inner selection arc and the pinned
 * marker. Purely visual — `aria-hidden`, since nothing here is a control. The chairs
 * themselves are `TableRingSeats`, a separate component rendered as a *later* sibling of the
 * face button (see `PlanTable.tsx`'s own comment on why the two are split and ordered that
 * way) rather than a set of children in this one drawing.
 *
 * Colour comes entirely from the `--ring-*` custom properties the ancestor's
 * data-occupancy/data-violation state sets (PlanTable.module.css); this file has no state of its
 * own and reads only its own props.
 */
export function TableRing({ seats, pinned, tableSize }: TableRingProps) {
  const showChairs = chairsVisibleAt(seats, tableSize)
  const { dash, gap } = seatRingDash(seats)
  const selectionArc = selectionArcEndpoints()

  return (
    <svg className={styles.svg} viewBox={`0 0 ${RING.viewBox} ${RING.viewBox}`} aria-hidden="true">
      {/* Review, TT-44: this circle briefly rendered unconditionally, to give the selected and
          violation states something to paint once chairs replaced the seat dashes — but it sits
          at the exact radius the chairs' own centres do, and its stroke is a constant CSS width
          (non-scaling-stroke) while a chair shrinks with the table, so at the scale floor the
          band was wider than the whole chair, painting straight through an empty chair's hollow
          centre and making it read as filled. Back to `!showChairs` only — the selected state
          now carries on the chairs' own stroke width instead (see --ring-chair-stroke-width in
          TableRing.module.css), and violation already carries on both the body's dashed
          --ring-body-* stroke (unaffected by chairs) and the chairs' own --ring-chair-stroke
          colour. */}
      {!showChairs && (
        <circle
          className={styles.ring}
          cx={RING.centre}
          cy={RING.centre}
          r={RING.ringRadius}
          fill="none"
          strokeDasharray={`${dash} ${gap}`}
        />
      )}
      <circle className={styles.body} cx={RING.centre} cy={RING.centre} r={RING.bodyRadius} />
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
        className={styles.selection}
        d={`M ${selectionArc.startX} ${selectionArc.startY} A ${RING.selectionRadius} ${RING.selectionRadius} 0 0 1 ${selectionArc.endX} ${selectionArc.endY}`}
        fill="none"
      />
      {pinned && (
        <circle
          className={styles.pin}
          cx={RING.centre + RING.pinOffset}
          cy={RING.centre - RING.pinOffset}
          r={RING.pinRadius}
        />
      )}
    </svg>
  )
}

type TableRingSeatsProps = {
  seats: number
  /** Index `i` is the id of the guest in seat `i`, or `null` when that seat is empty — never
   * "the first k seats", since a seating rule can leave a gap earlier than a guest seated later
   * at the same table. */
  seatGuestIds: readonly (string | null)[]
  /** The same per-seat shape as `seatGuestIds`, but the guest itself rather than just its id —
   * `chairLabel` needs a name to build "Seat 3, Danny Whitaker". Kept alongside `seatGuestIds`
   * rather than replacing it: the `data-guest-id` attribute PlanTable.test.tsx asserts stays
   * exactly what it was. */
  guestsBySeat: readonly (Guest | null)[]
  tableSize: number
  /** The table's own visible label ("Table 7"), so this group's own name distinguishes it from
   * every other table's identical set of seat numbers. */
  tableLabel: string
  /** Which seat index currently carries the table's one tab stop — roving tabindex, so a table
   * with any number of seats still adds exactly one to the page's tab order. Owned by
   * `PlanTable`, not this file, so it survives this component's own re-renders. */
  activeSeatIndex: number
  onSeatFocus: (seatIndex: number, element: Element) => void
  onSeatBlur: () => void
  onSeatKeyDown: (event: KeyboardEvent<SVGCircleElement>) => void
  onSeatHover: (seatIndex: number, element: Element) => void
  onSeatHoverEnd: (seatIndex: number) => void
  /** Forwards a click on any chair to the same action a click on the face button would take
   * (place the selected guest, or select the table) — see `PlanTable.tsx`'s own comment on why
   * a chair needs this now that it sits above the button. */
  onSeatClick: () => void
  /** The guest whose summary is open, if any — an occupied chair carries `aria-describedby`
   * naming the summary card only when it is the one open (never every chair, and never one
   * naming a card that isn't showing that guest). `summaryId` absent means no summary wiring at
   * all — every chair renders with no `aria-describedby`. */
  summaryGuestId: string | null
  summaryId?: string
}

/**
 * TT-36, KB-5/KB-6 "Lit canvas". A round table's chairs, drawn in their own `<svg>` — a sibling
 * of `TableRing` above, not its child, and rendered as a *later* sibling of the face button in
 * `PlanTable.tsx`. `.table`'s own `container-type` makes it a stacking context and `.round .face`
 * is itself `position: relative`, so the face button, `TableRing`'s own `<svg>` and this one are
 * three positioned, `z-index: auto` siblings ordered by where each sits in the document — the
 * later one wins the pointer for anywhere the two overlap. Splitting the ring this way keeps
 * `TableRing`'s own decorative body exactly where it always painted (under the button, so the
 * visible number and fill count stay on top of it) while putting *only* the chairs above the
 * button, where a real mouse actually has to land on one to hover or focus it. Review: the first
 * version of this file kept the chairs alongside `TableRing`'s own decorative marks, before the
 * button — every chair carried `pointer-events: auto` already, but paint order decides which
 * element receives a pointer event at a shared point, and the button, being the later sibling,
 * always won; a real browser's hover chain never included a chair, whatever the CSS pointer-events
 * declared on it.
 *
 * Each chair is `role="img"`, not `role="button"`: it has no activation of its own — Enter and
 * Space do nothing to it (`PlanTable.tsx`'s own key handler swallows Space so it can't fall
 * through to a page scroll) — so a role implying it can be pressed would be a name for a control
 * that isn't there. It is a fact to read, addressed by `aria-label` and, while a summary is open
 * for its own guest, `aria-describedby`. A *click* still reaches `onSeatClick`, forwarding to
 * whatever the face button would have done for the same click — a mouse gesture landing on a
 * chair by construction (see above), not a second way to activate it.
 */
export function TableRingSeats({
  seats,
  seatGuestIds,
  guestsBySeat,
  tableSize,
  tableLabel,
  activeSeatIndex,
  onSeatFocus,
  onSeatBlur,
  onSeatKeyDown,
  onSeatHover,
  onSeatHoverEnd,
  onSeatClick,
  summaryGuestId,
  summaryId,
}: TableRingSeatsProps) {
  const showChairs = chairsVisibleAt(seats, tableSize)
  if (!showChairs) return null

  const chairSize = chairRadius(seats)

  return (
    <svg
      className={styles.svg}
      viewBox={`0 0 ${RING.viewBox} ${RING.viewBox}`}
      role="group"
      aria-label={`Seats at ${tableLabel}`}
    >
      {chairPositions(seats).map((chair) => {
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
            role="img"
            aria-label={chairLabel(chair.seatIndex, guest)}
            aria-describedby={guestId !== null && summaryId && guestId === summaryGuestId ? summaryId : undefined}
            tabIndex={chair.seatIndex === activeSeatIndex ? 0 : -1}
            onFocus={(event) => onSeatFocus(chair.seatIndex, event.currentTarget)}
            onBlur={onSeatBlur}
            onKeyDown={onSeatKeyDown}
            onMouseEnter={(event) => onSeatHover(chair.seatIndex, event.currentTarget)}
            onMouseLeave={() => onSeatHoverEnd(chair.seatIndex)}
            onClick={onSeatClick}
          />
        )
      })}
    </svg>
  )
}
