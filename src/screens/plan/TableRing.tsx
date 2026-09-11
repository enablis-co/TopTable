import { RING, seatRingDash } from './ringGeometry'
import styles from './TableRing.module.css'

type TableRingProps = {
  seats: number
  pinned: boolean
}

/**
 * TT-35, KB-5/KB-6 "Lit canvas". The seat ring, the table body and the pinned marker for a round
 * table's face — purely visual. `aria-hidden` and `focusable="false"`: it carries no text of its
 * own and contributes nothing to the accessible name. The visible number and "n of m seats" pair
 * stay exactly where they were, as PlanTable.tsx's own paragraphs — see the long comment at the
 * top of that file for why that is what keeps the table's accessible name intact.
 *
 * Colour comes entirely from the `--ring-*` custom properties the ancestor's
 * data-occupancy/data-violation state sets (PlanTable.module.css); this file has no state of its
 * own and reads only `seats` and `pinned`.
 */
export function TableRing({ seats, pinned }: TableRingProps) {
  const { dash, gap } = seatRingDash(seats)

  return (
    <svg
      className={styles.svg}
      viewBox={`0 0 ${RING.viewBox} ${RING.viewBox}`}
      aria-hidden="true"
      focusable="false"
    >
      <circle
        className={styles.ring}
        cx={RING.centre}
        cy={RING.centre}
        r={RING.ringRadius}
        fill="none"
        strokeDasharray={`${dash} ${gap}`}
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
    </svg>
  )
}
