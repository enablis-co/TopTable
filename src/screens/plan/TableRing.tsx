import { RING, chairPositions, chairRadius, chairsVisibleAt, seatRingDash } from './ringGeometry'
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

  return (
    <svg
      className={styles.svg}
      viewBox={`0 0 ${RING.viewBox} ${RING.viewBox}`}
      aria-hidden="true"
      focusable="false"
    >
      {/* Review, TT-44: this circle used to render only when `!showChairs`. Every KB-3 scenario
          seats 8 a table, so chairs always render, and `--ring-stroke`/`--ring-stroke-width` —
          which carry the occupancy, violation AND selected states (PlanTable.module.css) — had
          nothing left to paint: selecting a table became invisible. Keeping this circle always
          drawn, solid rather than dashed once chairs take over the individual seat marks, gives
          those three states a ring to paint again in the gaps between chairs. */}
      <circle
        className={styles.ring}
        cx={RING.centre}
        cy={RING.centre}
        r={RING.ringRadius}
        fill="none"
        strokeDasharray={showChairs ? undefined : `${dash} ${gap}`}
      />
      <circle className={styles.body} cx={RING.centre} cy={RING.centre} r={RING.bodyRadius} />
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
