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
})

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
