import type { KeyboardEvent } from 'react'
import type { Guest } from '../../domain/types'
import { chairLabel } from './chairNavigation'
import { TOP_ROW, topRowChairRadius, topRowChairsVisibleAt, topRowPositions } from './ringGeometry'
import chairStyles from './TableRing.module.css'
import styles from './TopTableRow.module.css'

type TopTableRowProps = {
  seats: number
  /** Index `i` is the id of the guest in seat `i`, or `null` when empty — same contract as
   * `TableRingSeats`'s `seatGuestIds`. */
  seatGuestIds: readonly (string | null)[]
  /** Mirrors `TableRingSeats`'s own `guestsBySeat` — the guest itself, for `chairLabel`. */
  guestsBySeat: readonly (Guest | null)[]
  /** The table's own visible label, so this group's own name distinguishes it from a round
   * table's identically-numbered seats. */
  tableLabel: string
  activeSeatIndex: number
  onSeatFocus: (seatIndex: number, element: Element) => void
  onSeatBlur: () => void
  onSeatKeyDown: (event: KeyboardEvent<SVGCircleElement>) => void
  onSeatHover: (seatIndex: number, element: Element) => void
  onSeatHoverEnd: (seatIndex: number) => void
  /** Forwards a click on any chair to the same action a click on the face button would take —
   * see `TableRingSeats`'s own comment for why a round table's chairs need this, and this file's
   * own doc comment for why the top table gets it too even though it never had the hit-testing
   * problem that made it mandatory there. */
  onSeatClick: () => void
  summaryGuestId: string | null
  summaryId?: string
}

/**
 * TT-44 (amendment), TT-36, KB-4/KB-6. One chair per top-table seat, drawn as a single row along
 * the edge away from the room rather than a round table's clock face — KB-4 fixes the eight
 * protocol roles left to right, printed and agreed with the venue and the photographer, and a
 * ring would contradict that order.
 *
 * TT-36: an occupied chair is a real, focusable, named control now (the same change `TableRing`
 * makes for a round table, in its own `TableRingSeats`). Unlike a round table, this row sits
 * entirely in the `<li>`'s own padding, above the pill, and never overlaps the face button at
 * all — so, unlike a round table's chairs, it needs no reordering relative to the button to
 * receive a pointer; a real mouse already lands on a chair here without any help.
 *
 * `onSeatClick` still forwards a click to the same action the face button would take, even
 * though nothing here forces it the way the round table's own hit-testing does. Leaving it
 * unwired made an identical gesture — click a seat to place a guest, the screen's own stated
 * instruction — do nothing on this table while it worked on every round one, an inconsistency
 * this ticket introduced by making round chairs clickable at all, not a pre-existing gap.
 *
 * Each chair is `role="img"`, not `role="button"` — it has no activation path (Enter and Space do
 * nothing, and `PlanTable.tsx`'s own key handler swallows Space so it can't fall through to a
 * page scroll), so a role implying press-ability would name a control that doesn't exist. It is
 * a fact to read: `aria-label` names the seat and its guest, and while a summary is open for its
 * own guest, `aria-describedby` points at it.
 *
 * Reuses `TableRing.module.css`'s `.chairOccupied`/`.chairEmpty` directly, not a second,
 * similar-looking pair — "same shape language, same stroke treatment" means the same CSS
 * classes, reading the same `--ring-chair-*` custom properties the base `.table` rule and
 * `.table[data-selected='true']` already declare, so this row gets the same selected widening a
 * round table's chairs do for free, with no CSS of its own to duplicate or drift.
 *
 * A sibling of the table's own face button, not a child of it: a round table's ring has to sit
 * inside `.round .face`'s own grid, sharing that layout with the visible number (TT-15). This
 * row sits entirely above the pill, in the `<li>`'s own padding (`TopTableRow.module.css`), so
 * there is no layout reason to nest it inside the button — and staying outside means the
 * button's accessible name is untouched by construction, not by careful `aria-hidden` bookkeeping.
 */
export function TopTableRow({
  seats,
  seatGuestIds,
  guestsBySeat,
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
}: TopTableRowProps) {
  // The top table never scales the way a round table does (fitFloorplan only sizes round
  // tables) — TOP_ROW.viewBoxWidth is this row's one true rendered width, not merely its
  // viewBox, so it doubles as the "renderedWidth" a round table would pass separately.
  if (!topRowChairsVisibleAt(seats, TOP_ROW.viewBoxWidth)) return null

  const radius = topRowChairRadius(seats)

  return (
    <svg
      className={styles.svg}
      viewBox={`0 0 ${TOP_ROW.viewBoxWidth} ${TOP_ROW.viewBoxHeight}`}
      role="group"
      aria-label={`Seats at ${tableLabel}`}
    >
      {topRowPositions(seats).map((chair) => {
        const guestId = seatGuestIds[chair.seatIndex] ?? null
        const guest = guestsBySeat[chair.seatIndex] ?? null
        return (
          <circle
            key={chair.seatIndex}
            className={guestId !== null ? chairStyles.chairOccupied : chairStyles.chairEmpty}
            cx={chair.cx}
            cy={chair.cy}
            r={radius}
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
