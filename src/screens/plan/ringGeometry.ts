/**
 * TT-35, KB-5/KB-6 "Lit canvas". Pure geometry for a round table's seat ring — the SVG dash
 * pattern that turns a plain circle into a ring of individual seat marks. No React, no store:
 * a value in, a value out, so TableRing.tsx and this module's own test both read from the one
 * true computation rather than each keeping their own copy of the arithmetic.
 */

/**
 * Shared SVG geometry for every round table's ring. Frozen: nothing computes its own copy.
 *
 * `ringRadius` is 42.5, not the handoff's literal 43 (review, TT-15): a selected table widens
 * its ring's stroke to 9px (PlanTable.module.css's `--ring-stroke-width` on
 * `.table[data-selected='true']`), so the ring's outer edge sits at `ringRadius + 9 / 2`. At the
 * handoff's 43 that is 47.5 against a 94-unit viewBox whose half-extent is 47 — the outer 0.5
 * units are clipped, landing as a hairline flat spot wherever a dash falls at 3, 6, 9 or 12
 * o'clock. 42.5 puts the widest ring's outer edge exactly on the viewBox edge (42.5 + 4.5 = 47)
 * with no headroom to spare; `ringGeometry.test.ts` encodes this so a future change to either
 * number can't silently reopen the clip.
 */
export const RING = Object.freeze({
  /** The <svg> is square; viewBox is "0 0 94 94". */
  viewBox: 94,
  centre: 47,
  bodyRadius: 34,
  ringRadius: 42.5,
  /** Pin centre offset from (centre, centre): (cx + pinOffset, cy − pinOffset). */
  pinOffset: 19,
  pinRadius: 3.6,
  /**
   * Review, TT-44 (third pass). "Selected" needs a single, large-enough mark to read at a
   * glance on a full table at the scale floor — the chairs' own stroke (TableRing.module.css's
   * `--ring-chair-stroke-width`) is too little ink spread across eight ~6px dots, and a ring
   * sharing the chairs' own radius is the collision already fixed once (a non-scaling stroke
   * painting through an empty chair's hole). `selectionRadius` sits well inside `bodyRadius`
   * instead — structurally unable to reach the chairs at any seat count or table size, since it
   * never leaves the body's own footprint. `ringGeometry.test.ts` checks the margin on both
   * sides directly rather than trusting that "well inside" holds by eye.
   *
   * Review, TT-44 (fourth pass): this radius still crosses two things that live inside the
   * body — the pin (fixed at `pinOffset`/`pinOffset`, radial distance `pinOffset × √2 ≈ 26.87`,
   * almost exactly this radius) and the fill-count text (`.round .occupancy` sits `14` units
   * below centre, well inside `28`). A full circle at this radius passes through both. Only an
   * *arc* of it is drawn now — see `SELECTION_ARC` below — confined to the part of the circle
   * that is nowhere near either.
   */
  selectionRadius: 28,
})

/** TT-44 (fourth pass, review). The selected-state ring's stroke width, in CSS px — exported
 * so the margin proofs below and `PlanTable.module.css`'s own literal read the same number,
 * rather than two hand-copies that can drift apart silently (the same failure mode the
 * `--ring-*` set-equality guard, `tableRingStyles.test.ts`, exists to catch for custom
 * properties — this binds the *value* the same way). */
export const SELECTED_SELECTION_STROKE_WIDTH = 3

/**
 * TT-44 (fourth pass, review). The selected-state ring collided with two things a full circle
 * at `RING.selectionRadius` inevitably passes through: the pin (fixed at "1:30", angle −45° in
 * this file's own convention — 0° is 3 o'clock, angle increases clockwise, matching
 * `chairPositions`) and the fill-count text (`.round .occupancy`, a horizontal band roughly
 * level with 4-5 and 7-8 o'clock at this radius). Both live in the same radial band the ring
 * itself sits in, so no *radius* choice dodges them — only an angular one does. This arc stays
 * in the upper third of the circle, well clear of both:
 *
 * - the pin's own angular half-width around −45° is `atan(pinRadius / (pinOffset × √2))
 *   ≈ 7.65°`, i.e. roughly −52.65° to −37.35° — `endDeg` stops 5.65° short of that at −60°.
 * - the fill-count text's own crossing angles (where a horizontal line at its height meets the
 *   circle) are `±30°` and `±150°` — both positive (the text sits *below* centre); this arc
 *   stays entirely negative (−150° to −60°), the opposite half of the circle.
 * - the heading number's own crossing angles are close to 0°/±180° (it sits almost exactly
 *   level with centre); this arc's closest approach, at −60°, is still `28 × sin(60°) ≈ 24`
 *   units above it.
 *
 * `ringGeometry.test.ts` asserts each of these margins from the actual pin and text geometry,
 * rather than trusting the numbers above to stay true by eye.
 */
export const SELECTION_ARC = Object.freeze({
  startDeg: -150,
  endDeg: -60,
})

export type SelectionArc = {
  startX: number
  startY: number
  endX: number
  endY: number
}

/** The arc's two endpoints, in the same (cx, cy) terms `chairPositions` uses — an SVG `<path>`
 * elliptical-arc command needs both explicitly, unlike a `<circle>`'s single radius. */
export function selectionArcEndpoints(): SelectionArc {
  const startTheta = (SELECTION_ARC.startDeg * Math.PI) / 180
  const endTheta = (SELECTION_ARC.endDeg * Math.PI) / 180

  return {
    startX: RING.centre + RING.selectionRadius * Math.cos(startTheta),
    startY: RING.centre + RING.selectionRadius * Math.sin(startTheta),
    endX: RING.centre + RING.selectionRadius * Math.cos(endTheta),
    endY: RING.centre + RING.selectionRadius * Math.sin(endTheta),
  }
}

export type SeatRingDash = {
  dash: number
  gap: number
}

/**
 * The dash length is fixed regardless of seat count — only the gap changes to fit more or fewer
 * seats onto the ring. It is not derived from the ring's stroke width (7px, declared once as
 * `--ring-stroke-width` on PlanTable.module.css's base `.table` rule — review, TT-15: a JS copy
 * of that value used to sit here too, driving an SVG presentation attribute the CSS `stroke-width`
 * always overrode, so changing it did nothing visible): the two happen to share a value in the
 * handoff's own worked example, but one is a line thickness and the other a dash length, and
 * coupling them would make an unrelated future change to one silently move the other.
 */
const SEAT_DASH_LENGTH = 7

/**
 * One dash per seat around the ring, at radius `RING.ringRadius`: a fixed-length dash and a gap
 * sized so that `seats` of them tile the ring's circumference exactly — period is
 * `2π × ringRadius / seats`, gap is what's left after the fixed dash.
 *
 * `seats <= 0` has nothing to mark and returns zeros rather than dividing by zero. A seat count
 * dense enough that the fixed dash alone would exceed its own share of the circumference (the
 * period) makes `period − dash` negative; clamped to 0 rather than handed to SVG as a negative
 * dasharray, which is invalid and would drop the ring's dashes entirely.
 */
export function seatRingDash(seats: number): SeatRingDash {
  if (seats <= 0) return { dash: 0, gap: 0 }

  const period = (2 * Math.PI * RING.ringRadius) / seats
  const gap = Math.max(0, period - SEAT_DASH_LENGTH)

  return { dash: SEAT_DASH_LENGTH, gap }
}

/**
 * TT-44, KB-6 "Plan". One drawn chair per seat, replacing the dash ring above at every seat
 * count `chairsVisibleAt` allows. `seatIndex` is 0-based; index 0 is twelve o'clock and the
 * angle advances clockwise (SVG's y-down frame turns an increasing angle clockwise on screen).
 */
export type Chair = {
  seatIndex: number
  cx: number
  cy: number
}

export function chairPositions(seats: number): Chair[] {
  if (seats <= 0) return []

  return Array.from({ length: seats }, (_, seatIndex) => {
    const theta = -Math.PI / 2 + seatIndex * ((2 * Math.PI) / seats)
    return {
      seatIndex,
      cx: RING.centre + RING.ringRadius * Math.cos(theta),
      cy: RING.centre + RING.ringRadius * Math.sin(theta),
    }
  })
}

/**
 * The `4.5` cap is not arbitrary: `RING.ringRadius + 4.5 === RING.centre`, so a chair's outer
 * edge lands exactly on the viewBox edge — the same budget `ringRadius` itself was tuned
 * against (see the comment on `RING` above).
 *
 * `0.38` of the inter-centre arc-length is what keeps adjacent chairs from touching. The true
 * collision distance between two neighbours is the *chord*, `2 · ringRadius · sin(π / seats)`,
 * which `sin(x) < x` makes strictly tighter than this arc-length figure — but `0.76` of the
 * arc-length (twice `0.38`, since two radii meet at the midpoint) stays under that chord for
 * every seat count this file is ever asked to draw, `ringGeometry.test.ts` checks well past it.
 *
 * There is deliberately no separate floor on the result below the `4.5` cap (review, TT-44): a
 * floor that stays constant while `seats` keeps growing is exactly what let chairs overlap
 * above 88 seats before this fix — the radius stayed pinned at the floor while the true chord
 * between centres kept shrinking, and the two crossed. `chairRadius` has to shrink continuously
 * with `seats` for the non-overlap property to hold; `chairsVisibleAt` below is what decides
 * when the result is too small to be worth drawing at all.
 */
export function chairRadius(seats: number): number {
  if (seats <= 0) return 0

  const arc = (0.38 * (2 * Math.PI * RING.ringRadius)) / seats
  return Math.min(4.5, arc)
}

/**
 * A chair's rendered diameter in CSS pixels, at a given seat count and the table's own rendered
 * size — `chairRadius` is in the SVG's own 94-unit viewBox, so it scales by `renderedSize / 94`
 * like everything else in the drawing, unlike a non-scaling stroke (review, TT-44 — see
 * `chairsVisibleAt` and `TableRing.module.css`'s `--ring-chair-stroke-width` comment). Exported
 * so a stroke width — which *is* a constant number of CSS pixels — can be checked against it
 * directly, rather than trusting a browser pass to notice the two have crossed.
 */
export function chairDiameterPx(seats: number, renderedSize: number): number {
  return (2 * chairRadius(seats) * renderedSize) / RING.viewBox
}

/** TT-44 (C7): the clean drop for a seat count dense enough that a chair would render as a blur. */
export function chairsVisibleAt(seats: number, renderedSize: number): boolean {
  if (seats <= 0) return false

  return chairDiameterPx(seats, renderedSize) >= 3
}

/**
 * TT-44 (amendment, C3/C3a-C3d), KB-4. The top table's seats are not drawn on a ring — KB-4
 * fixes them in a single left-to-right line (chief bridesmaid through best man), printed and
 * agreed with the venue and the photographer, and a clock face would contradict that order. This
 * is that row's own geometry, in its own small viewBox rather than `RING`'s square one: the top
 * table is a pill (KB-6 "Floorplan"), not a circle, and its chairs read as a strip above that
 * pill, not a ring around it.
 *
 * `viewBoxWidth` is 194, not a round number: it is `TopTableRow.tsx`'s actual rendered width,
 * derived from `PlanTable.module.css`'s fixed `.top` width (220px) minus the base `.table`
 * rule's padding and border on both sides (`(12 + 1) × 2 = 26`; `220 − 26 = 194`) — the top
 * table never scales the way a round table does, so its viewBox can be its one true rendered
 * width instead of an abstract unit needing a separate conversion. A future change to either
 * CSS number has to update this one too; there is no way to share the literal between a CSS
 * file and this one, the same trade `MIN_TABLE_SIZE` (`floorplanFit.ts`) already makes.
 */
export const TOP_ROW = Object.freeze({
  viewBoxWidth: 194,
  viewBoxHeight: 12,
  /** Chair centres all sit on this line, vertically centred in the strip. */
  chairY: 6,
  /** Clears the end chairs from the viewBox's left and right edges by more than a chair's own
   * radius at the cap below (4.5), so they are never clipped. */
  margin: 10,
})

export type TopRowChair = {
  seatIndex: number
  cx: number
  cy: number
}

/**
 * One chair per seat, evenly spaced left to right between the two margins — a single seat sits
 * centred. Seat index `i` is KB-4's own seat `i` (position `i + 1`; `src/domain/seating.ts`'s
 * `topTableRoleOrder` already returns roles in that same position order), so the drawn order
 * has to match the seat index exactly, with no reversal or centring trick that would shift it.
 *
 * `column` is deliberately its own line, equal to `seatIndex` and nothing more: seat 1 (index 0)
 * at screen left is the amended ticket's stated default — "built as left to right from the
 * room's side" — and an open, non-blocking question with the venue, not a settled fact. If the
 * answer comes back the other way, this is the one line to flip, to
 * `const column = seats - 1 - seatIndex`, rather than a direction re-derived from scratch
 * wherever the row is drawn.
 */
export function topRowPositions(seats: number): TopRowChair[] {
  if (seats <= 0) return []
  if (seats === 1) return [{ seatIndex: 0, cx: TOP_ROW.viewBoxWidth / 2, cy: TOP_ROW.chairY }]

  const span = TOP_ROW.viewBoxWidth - 2 * TOP_ROW.margin

  return Array.from({ length: seats }, (_, seatIndex) => {
    const column = seatIndex
    return {
      seatIndex,
      cx: TOP_ROW.margin + (column * span) / (seats - 1),
      cy: TOP_ROW.chairY,
    }
  })
}

/**
 * Mirrors `chairRadius`'s own reasoning, simplified: adjacent centres on a straight line are
 * exactly `spacing` apart, with no arc-versus-chord approximation to correct for, so `0.38` of
 * that spacing is all that is needed to keep two neighbours from touching, at every seat count,
 * exactly (`2 × 0.38 × spacing = 0.76 × spacing < spacing`). No floor below the `4.5` cap, for
 * the same reason `chairRadius` dropped its floor (review, TT-44): a constant floor stops
 * shrinking exactly where the true spacing keeps shrinking, and the two eventually cross.
 */
export function topRowChairRadius(seats: number): number {
  if (seats <= 0) return 0
  if (seats === 1) return Math.min(4.5, TOP_ROW.margin)

  const spacing = (TOP_ROW.viewBoxWidth - 2 * TOP_ROW.margin) / (seats - 1)
  return Math.min(4.5, 0.38 * spacing)
}

/** Mirrors `chairDiameterPx`, for the row's own viewBox width rather than a round table's
 * rendered size. */
export function topRowChairDiameterPx(seats: number, renderedWidth: number): number {
  return (2 * topRowChairRadius(seats) * renderedWidth) / TOP_ROW.viewBoxWidth
}

/** Mirrors `chairsVisibleAt` (C7): the row's own clean drop for a seat count dense enough that a
 * chair would render as a blur, rather than a round table's. */
export function topRowChairsVisibleAt(seats: number, renderedWidth: number): boolean {
  if (seats <= 0) return false

  return topRowChairDiameterPx(seats, renderedWidth) >= 3
}
