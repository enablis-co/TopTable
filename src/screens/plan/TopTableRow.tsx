import { TOP_ROW, topRowChairRadius, topRowChairsVisibleAt, topRowPositions } from './ringGeometry'
import chairStyles from './TableRing.module.css'
import styles from './TopTableRow.module.css'

type TopTableRowProps = {
  seats: number
  /** TT-44 (C3d). Index `i` is the id of the guest in seat `i`, or `null` when empty — same
   * contract as `TableRing`'s `seatGuestIds`. */
  seatGuestIds: readonly (string | null)[]
}

/**
 * TT-44 (amendment, C3-C3d), KB-4/KB-6. One chair per top-table seat, drawn as a single row
 * along the edge away from the room rather than a round table's clock face — KB-4 fixes the
 * eight protocol roles left to right, printed and agreed with the venue and the photographer,
 * and a ring would contradict that order. `aria-hidden`/`focusable="false"`, no text, not a
 * button: the same accessible-name guarantee `TableRing` makes for a round table, and for the
 * same reason — `PlanTable.test.tsx`'s one-button and unchanged-accessible-name assertions
 * cover this table too.
 *
 * Reuses `TableRing.module.css`'s `.chairOccupied`/`.chairEmpty` directly, not a second,
 * similar-looking pair — "same shape language, same stroke treatment" means the same CSS
 * classes, reading the same `--ring-chair-*` custom properties the base `.table` rule and
 * `.table[data-selected='true']` already declare, so this row gets the same selected widening a
 * round table's chairs do for free, with no CSS of its own to duplicate or drift.
 *
 * A sibling of the table's own `<Button>` (`PlanTable.tsx`), not a child of it: a round table's
 * ring has to sit inside `.round .face`'s own grid, sharing that layout with the visible number
 * (TT-15). This row sits entirely above the pill, in the `<li>`'s own padding
 * (`TopTableRow.module.css`), so there is no layout reason to nest it inside the button — and
 * staying outside means the button's accessible name is untouched by construction, not by
 * careful `aria-hidden` bookkeeping.
 *
 * The amended ticket is explicit that the top table's own bar stays a constant slate material
 * regardless of occupancy — chairs carry the per-seat state, not the bar itself — so this
 * component touches nothing about `.top .face`.
 */
export function TopTableRow({ seats, seatGuestIds }: TopTableRowProps) {
  // The top table never scales the way a round table does (fitFloorplan only sizes round
  // tables) — TOP_ROW.viewBoxWidth is this row's one true rendered width, not merely its
  // viewBox, so it doubles as the "renderedWidth" a round table would pass separately.
  if (!topRowChairsVisibleAt(seats, TOP_ROW.viewBoxWidth)) return null

  const radius = topRowChairRadius(seats)

  return (
    <svg
      className={styles.svg}
      viewBox={`0 0 ${TOP_ROW.viewBoxWidth} ${TOP_ROW.viewBoxHeight}`}
      aria-hidden="true"
      focusable="false"
    >
      {topRowPositions(seats).map((chair) => {
        const guestId = seatGuestIds[chair.seatIndex] ?? null
        return (
          <circle
            key={chair.seatIndex}
            className={guestId !== null ? chairStyles.chairOccupied : chairStyles.chairEmpty}
            cx={chair.cx}
            cy={chair.cy}
            r={radius}
            data-seat-index={chair.seatIndex}
            data-guest-id={guestId ?? undefined}
          />
        )
      })}
    </svg>
  )
}
