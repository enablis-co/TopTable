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
  tableSize: number
}

/**
 * TT-35, TT-44, KB-5/KB-6 "Lit canvas". The seat ring or its chairs, the table body and the
 * pinned marker for a round table's face — purely visual. `aria-hidden` and `focusable="false"`:
 * it carries no text of its own and contributes nothing to the accessible name. The visible
 * number and "n of m seats" pair stay exactly where they were, as PlanTable.tsx's own
 * paragraphs — see the long comment at the top of that file for why that is what keeps the
 * table's accessible name intact.
 *
 * A chair is a plain `<circle>`: no text, no `aria-label`, no `aria-labelledby`, not a button —
 * `PlanTable.test.tsx`'s one-button and unchanged-accessible-name assertions are the guard.
 *
 * Colour comes entirely from the `--ring-*`/`--ring-chair-*` custom properties the ancestor's
 * data-occupancy/data-violation state sets (PlanTable.module.css); this file has no state of its
 * own and reads only its own props.
 */
export function TableRing({ seats, pinned, seatGuestIds, tableSize }: TableRingProps) {
  const showChairs = chairsVisibleAt(seats, tableSize)
  const { dash, gap } = seatRingDash(seats)
  const chairSize = chairRadius(seats)
  const selectionArc = selectionArcEndpoints()

  return (
    <svg
      className={styles.svg}
      viewBox={`0 0 ${RING.viewBox} ${RING.viewBox}`}
      aria-hidden="true"
      focusable="false"
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
      {showChairs &&
        chairPositions(seats).map((chair) => {
          const guestId = seatGuestIds[chair.seatIndex] ?? null
          return (
            <circle
              key={chair.seatIndex}
              className={guestId !== null ? styles.chairOccupied : styles.chairEmpty}
              cx={chair.cx}
              cy={chair.cy}
              r={chairSize}
              data-seat-index={chair.seatIndex}
              data-guest-id={guestId ?? undefined}
            />
          )
        })}
    </svg>
  )
}
