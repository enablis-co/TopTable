import { describe, expect, it } from 'vitest'
import {
  RING,
  seatRingDash,
  chairPositions,
  chairRadius,
  chairDiameterPx,
  chairsVisibleAt,
  SELECTED_SELECTION_STROKE_WIDTH,
  SELECTION_ARC,
  selectionArcEndpoints,
  TOP_ROW,
  topRowPositions,
  topRowChairRadius,
  topRowChairDiameterPx,
  topRowChairsVisibleAt,
} from './ringGeometry'
import { MAX_TABLE_SIZE, MIN_TABLE_SIZE } from './floorplanFit'

/**
 * TT-35. `seatRingDash` is pure geometry — no rendering, no store — so it is exercised directly
 * with numeric fixtures rather than through a rendered `<TableRing>`, the same way
 * `src/domain/capacity.ts` is tested apart from any screen that reads it.
 */

describe('seatRingDash — 8 seats, at the review\'s revised ring radius (42.5, not the handoff\'s literal 43 — TT-15: keeps the selected ring\'s stroke inside the viewBox)', () => {
  it('gives a dash of 7 and a gap of approximately 26.4', () => {
    const { dash, gap } = seatRingDash(8)
    expect(dash).toBe(7)
    expect(gap).toBeCloseTo(26.4, 1)
  })
})

describe('seatRingDash — a table with no seats to mark', () => {
  it('returns zero for both dash and gap at zero seats', () => {
    expect(seatRingDash(0)).toEqual({ dash: 0, gap: 0 })
  })

  it('returns zero for both dash and gap at a negative seat count, rather than throwing', () => {
    expect(seatRingDash(-3)).toEqual({ dash: 0, gap: 0 })
  })
})

describe('seatRingDash — a seat count dense enough to outrun the fixed dash length', () => {
  it('clamps the gap at 0 instead of returning a negative dasharray', () => {
    const { dash, gap } = seatRingDash(100)
    expect(gap).toBe(0)
    expect(gap).toBeGreaterThanOrEqual(0)
    // The dash itself stays fixed; only the gap yields.
    expect(dash).toBe(7)
  })
})

describe('seatRingDash — deterministic (KB-2, engineering-standards.md: same input, same output)', () => {
  it('returns the identical value for the same input called twice', () => {
    expect(seatRingDash(8)).toEqual(seatRingDash(8))
    expect(seatRingDash(12)).toEqual(seatRingDash(12))
  })
})

describe('RING — shared geometry constants the SVG and its stylesheet both read', () => {
  it('is frozen, so no caller can mutate the shared geometry', () => {
    expect(Object.isFrozen(RING)).toBe(true)
  })

  it('sizes the viewBox to hold the ring plus its stroke, centred at half that size', () => {
    expect(RING.viewBox).toBe(94)
    expect(RING.centre).toBe(47)
    expect(RING.centre * 2).toBe(RING.viewBox)
  })

  it('matches the handoff\'s published body radius; the ring radius is the review\'s revised 42.5, not the handoff\'s literal 43 (TT-15 — see the constraint below)', () => {
    expect(RING.bodyRadius).toBe(34)
    expect(RING.ringRadius).toBe(42.5)
  })

  it('places the pin inside the body radius, not straddling its edge', () => {
    // The pin is offset by pinOffset on both x and y from centre (TT-35's SVG places it at
    // (cx + pinOffset, cy − pinOffset)), so its centre sits pinOffset × √2 from the table's
    // centre along the diagonal — a plain `pinOffset < bodyRadius` only checks one axis and
    // would pass a pinOffset that straddles the edge badly once the diagonal is accounted
    // for. The whole pin, not just its centre, has to clear the body edge.
    const diagonalOffset = RING.pinOffset * Math.SQRT2
    expect(diagonalOffset + RING.pinRadius).toBeLessThan(RING.bodyRadius)
    expect(RING.pinRadius).toBe(3.6)
  })

  /**
   * Review, TT-15. The ring's outer edge is `ringRadius + strokeWidth / 2`; it has to stay at or
   * inside the viewBox's own half-extent (`centre`, since the box is square and centred), or the
   * SVG's own viewport clips it — a hairline flat spot on the ring wherever a dash falls at 3, 6,
   * 9 or 12 o'clock. The handoff's worked example (ringRadius 43, stroke 7) leaves headroom for
   * an *unselected* ring (43 + 3.5 = 46.5 < 47), but TT-15's own "seat ring stroke-width 7 → 9"
   * on a selected table pushes the outer edge to 47.5 — past the 47-unit half-extent — which is
   * exactly the clipping this test exists to catch before it ships again. The 7px and 9px here
   * are asserted independently of PlanTable.module.css's own declarations (this file stays pure
   * geometry, no CSS reads) — they are the two stroke widths that file is required to produce;
   * `floorplanStyles.test.ts` and `tableRingStyles.test.ts` guard that it actually does.
   */
  describe('the ring\'s outer edge stays inside the viewBox at every stroke width it draws', () => {
    const UNSELECTED_STROKE_WIDTH = 7
    const SELECTED_STROKE_WIDTH = 9

    it('fits at the default, unselected 7px stroke', () => {
      const outerRadius = RING.ringRadius + UNSELECTED_STROKE_WIDTH / 2
      expect(outerRadius).toBeLessThanOrEqual(RING.centre)
    })

    it('fits at the widened, selected 9px stroke — the case the handoff\'s own 43 missed', () => {
      const outerRadius = RING.ringRadius + SELECTED_STROKE_WIDTH / 2
      expect(outerRadius).toBeLessThanOrEqual(RING.centre)
    })
  })
})

/**
 * TT-44. Chairs replace the dash pattern with one drawn chair per seat, numbered as a clock
 * face from twelve o'clock clockwise. `chairPositions`, `chairRadius` and `chairsVisibleAt` are
 * pure geometry, exercised the same way as `seatRingDash` and `RING` above — numeric fixtures,
 * no rendering.
 */

describe('chairPositions — seat 1 (index 0) at twelve o\'clock, then clockwise (C2)', () => {
  it('seat index 0 sits at twelve o\'clock: cx is the centre, cy is above it', () => {
    const [first] = chairPositions(8)
    expect(first?.cx).toBeCloseTo(RING.centre, 5)
    expect(first?.cy).toBeLessThan(RING.centre)
  })

  it('four seats land at twelve, three, six and nine o\'clock, in that order — the case that catches a sign error, since an anticlockwise ring would look plausible on screen', () => {
    const [twelve, three, six, nine] = chairPositions(4)
    if (!twelve || !three || !six || !nine) {
      throw new Error('expected four chair positions')
    }

    expect(twelve.cx).toBeCloseTo(RING.centre, 5)
    expect(twelve.cy).toBeLessThan(RING.centre)

    expect(three.cx).toBeGreaterThan(RING.centre)
    expect(three.cy).toBeCloseTo(RING.centre, 5)

    expect(six.cx).toBeCloseTo(RING.centre, 5)
    expect(six.cy).toBeGreaterThan(RING.centre)

    expect(nine.cx).toBeLessThan(RING.centre)
    expect(nine.cy).toBeCloseTo(RING.centre, 5)
  })
})

describe('chairPositions — one chair per seat, however many (C1)', () => {
  it.each([1, 6, 8, 10, 26])('returns exactly %i position(s) for %i seat(s)', (n) => {
    expect(chairPositions(n)).toHaveLength(n)
  })

  it('returns an empty array for zero seats, and for a negative count, rather than throwing', () => {
    expect(() => chairPositions(0)).not.toThrow()
    expect(() => chairPositions(-3)).not.toThrow()
    expect(chairPositions(0)).toEqual([])
    expect(chairPositions(-3)).toEqual([])
  })

  it('seat indices run 0..n-1, each exactly once', () => {
    const indices = chairPositions(10)
      .map((chair) => chair.seatIndex)
      .sort((a, b) => a - b)
    expect(indices).toEqual([0, 1, 2, 3, 4, 5, 6, 7, 8, 9])
  })
})

describe('chairPositions/chairRadius — every chair sits on the ring, evenly spaced and never overlapping', () => {
  it.each([4, 8, 12, 20, 30])('every chair centre for %i seats is exactly RING.ringRadius from the table centre', (n) => {
    for (const chair of chairPositions(n)) {
      const distance = Math.hypot(chair.cx - RING.centre, chair.cy - RING.centre)
      expect(distance).toBeCloseTo(RING.ringRadius, 3)
    }
  })

  // Review, TT-44: 89 is the exact seat count at which the old, floored `chairRadius` (clamped
  // to a constant 1.5 above ~68 seats, rather than shrinking further) first exceeded the true
  // gap between adjacent centres — the floor stayed put while the real chord kept shrinking, and
  // the two crossed. 60/89/120/200 cover well either side of that crossing; 30 and below already
  // passed under the old code and stay here as the low-end anchor.
  it.each([4, 8, 12, 20, 30, 60, 89, 120, 200])(
    'adjacent chairs for %i seats never overlap: centre-to-centre distance exceeds twice the chair radius',
    (n) => {
      const positions = chairPositions(n)
      const radius = chairRadius(n)
      for (let i = 0; i < positions.length; i++) {
        const a = positions[i]
        const b = positions[(i + 1) % positions.length]
        if (!a || !b) {
          throw new Error('expected a full ring of chairs')
        }
        const distance = Math.hypot(a.cx - b.cx, a.cy - b.cy)
        expect(distance).toBeGreaterThan(2 * radius)
      }
    },
  )

  it.each([1, 4, 8, 12, 20, 30])(
    "a chair's outer edge stays within the viewBox for %i seats — the same property RING's own stroke is tuned against",
    (n) => {
      expect(RING.ringRadius + chairRadius(n)).toBeLessThanOrEqual(RING.centre)
    },
  )
})

describe('chairRadius — a table with no seats to draw a chair for', () => {
  it('is zero for zero seats, and for a negative seat count, rather than throwing', () => {
    expect(() => chairRadius(0)).not.toThrow()
    expect(() => chairRadius(-5)).not.toThrow()
    expect(chairRadius(0)).toBe(0)
    expect(chairRadius(-5)).toBe(0)
  })
})

describe('chairsVisibleAt — chairs survive the scale floor, or drop cleanly rather than blur (C7)', () => {
  it('8 seats stay visible at MIN_TABLE_SIZE, imported from floorplanFit.ts rather than a literal 61 so a change to the floor cannot silently desync', () => {
    expect(chairsVisibleAt(8, MIN_TABLE_SIZE)).toBe(true)
  })

  it('80 seats drop cleanly at MIN_TABLE_SIZE, rather than blurring into a ring', () => {
    expect(chairsVisibleAt(80, MIN_TABLE_SIZE)).toBe(false)
  })

  /**
   * Review, TT-44: under the old, floored `chairRadius`, the rendered chair diameter stopped
   * shrinking with `seats` once `seats` passed roughly 68 (the radius pinned at its 1.5 floor),
   * so `chairsVisibleAt` reduced to a pure function of `renderedSize` past that point — density
   * alone could never drop a table's chairs at the top of the scale, and a 200-seat table at
   * `MAX_TABLE_SIZE` would still draw 200 overlapping circles. `chairRadius` no longer has that
   * floor, so a seat count dense enough drops the chairs even at the largest table size the
   * floorplan ever renders.
   */
  it('a seat count dense enough drops the chairs even at MAX_TABLE_SIZE — density alone, not merely a small render, triggers the drop', () => {
    expect(chairsVisibleAt(200, MAX_TABLE_SIZE)).toBe(false)
    // Contrast: a merely large table (not degenerately dense) still shows chairs at that same
    // size, so the drop above is really about `seats`, not a blanket cutoff on `renderedSize`.
    expect(chairsVisibleAt(100, MAX_TABLE_SIZE)).toBe(true)
  })

  it('is false for a degenerate zero or negative seat count, whatever the rendered size, rather than throwing', () => {
    expect(() => chairsVisibleAt(0, MIN_TABLE_SIZE)).not.toThrow()
    expect(() => chairsVisibleAt(-3, MIN_TABLE_SIZE)).not.toThrow()
    expect(chairsVisibleAt(0, MIN_TABLE_SIZE)).toBe(false)
    expect(chairsVisibleAt(-3, MIN_TABLE_SIZE)).toBe(false)
  })
})

/**
 * Review, TT-44 (second pass). Selection used to widen a ring drawn at the chairs' own radius —
 * fine for the dashed fallback, but that ring's stroke is a constant CSS width
 * (non-scaling-stroke) while a chair shrinks with the table, so at MIN_TABLE_SIZE a 7-9px band
 * was wider than a whole 5.8px chair and painted straight through an empty chair's hollow,
 * making it read as filled. Selection now widens the chairs' own stroke instead
 * (`--ring-chair-stroke-width`, PlanTable.module.css) — these tests are what a browser pass
 * cannot see stay true: the widened stroke, in CSS pixels, is still smaller than the chair it is
 * drawn on, at the worst case KB-3's scenarios actually reach (8 seats, the scale floor).
 *
 * `1` and `2` below are not read from the CSS — they are re-declared here on purpose, the same
 * way `UNSELECTED_STROKE_WIDTH`/`SELECTED_STROKE_WIDTH` are above, so a change to either side
 * has to touch both files before the gate goes green again.
 */
describe("chairDiameterPx — the selected chair stroke stays narrower than the chair itself, even at the scale floor (review, TT-44)", () => {
  const CHAIR_STROKE_WIDTH = 1
  const SELECTED_CHAIR_STROKE_WIDTH = 2

  it('an 8-seat table at MIN_TABLE_SIZE — every KB-3 scenario, at the floor TT-38 stops shrinking at — leaves a hole under both stroke widths', () => {
    const diameter = chairDiameterPx(8, MIN_TABLE_SIZE)
    expect(diameter).toBeGreaterThan(SELECTED_CHAIR_STROKE_WIDTH)
    expect(diameter).toBeGreaterThan(CHAIR_STROKE_WIDTH)
  })

  it('the widened, selected stroke still leaves more than a sliver of hole at the floor — not just technically positive', () => {
    const diameter = chairDiameterPx(8, MIN_TABLE_SIZE)
    const hollow = diameter - SELECTED_CHAIR_STROKE_WIDTH
    expect(hollow).toBeGreaterThan(1)
  })

  it('grows with the table size, so a chair well above the floor has even more room to spare', () => {
    expect(chairDiameterPx(8, MAX_TABLE_SIZE)).toBeGreaterThan(chairDiameterPx(8, MIN_TABLE_SIZE))
  })
})

/**
 * Review, TT-44 (third pass). Widening the chairs' own stroke does not read at a glance on a
 * full table — too little ink, spread across eight tiny dots, against the lowest-contrast
 * stroke colour in the system. Selection now also widens a dedicated ring at
 * `RING.selectionRadius`, well inside the body rather than sharing the chairs' own radius —
 * these tests are the arithmetic proof that "well inside" actually holds, at the widest stroke
 * this ring is ever asked to draw and at the smallest table size it is ever drawn on, rather
 * than trusting a browser pass to notice if it doesn't.
 */
describe('RING.selectionRadius — the selected-state mark stays inside the body and nowhere near the chairs (review, TT-44 third pass)', () => {
  it('is strictly inside bodyRadius, with room to spare before any stroke is even added', () => {
    expect(RING.selectionRadius).toBeLessThan(RING.bodyRadius)
  })

  it("its outer edge, at the widest stroke it draws, stays inside the body at MIN_TABLE_SIZE — the smallest a non-scaling stroke's true, in-viewBox width is ever squeezed against", () => {
    const halfWidthInViewBoxUnits = (SELECTED_SELECTION_STROKE_WIDTH * RING.viewBox) / (2 * MIN_TABLE_SIZE)
    expect(RING.selectionRadius + halfWidthInViewBoxUnits).toBeLessThan(RING.bodyRadius)
  })

  it("bodyRadius, which selectionRadius sits inside, stays clear of the chairs' own inner edge at any seat count", () => {
    // The widest a chair ever draws is chairRadius's own cap, reached at any seat count small
    // enough not to be arc-limited — n=1 included — called directly rather than hand-copying
    // the number a third time (review, TT-44 fourth pass: this test used to assert
    // `RING.bodyRadius < RING.ringRadius - 4.5`, a bare literal that never actually named
    // `selectionRadius` or `chairRadius`).
    //
    // "at any seat count" rests on `chairRadius(1)` actually being the maximum over every
    // seat count — true (`min(4.5, arc / seats)` is non-increasing as `seats` grows, since
    // `arc / seats` only shrinks and `min` with a shrinking value can't rise), but that was
    // asserted nowhere (review, TT-44 fifth pass). Spot-checked here rather than reproved
    // algebraically.
    const widestChair = chairRadius(1)
    expect(chairRadius(50)).toBeLessThanOrEqual(widestChair)
    expect(RING.bodyRadius).toBeLessThan(RING.ringRadius - widestChair)
  })
})

/**
 * Review, TT-44 (fourth pass). A full circle at `RING.selectionRadius` crosses both the pin
 * (fixed at "1:30") and the fill-count text (a horizontal band crossing near 4-5 and 7-8
 * o'clock at this radius) — the same collision class as the chairs, just missed the first time
 * because neither guard above checks anything but the chairs and the body. `SELECTION_ARC`
 * confines the drawn mark to the part of the circle nowhere near either; these are the margins
 * computed from the actual pin and text geometry, not eyeballed degrees.
 */
describe('SELECTION_ARC — the selected-state mark avoids the pin and the fill-count text, not just the chairs (review, TT-44 fourth pass)', () => {
  // RING.pinOffset applied to both x and y (TableRing.tsx: `cx + pinOffset, cy - pinOffset`)
  // puts the pin at exactly -45° in this file's own angle convention, always, regardless of
  // pinOffset's own value — computed here rather than assumed, so a future change to how the
  // pin is placed cannot silently invalidate it.
  const pinAngleDeg = (Math.atan2(-RING.pinOffset, RING.pinOffset) * 180) / Math.PI
  const pinDistance = Math.hypot(RING.pinOffset, RING.pinOffset)
  const pinHalfWidthDeg = (Math.asin(RING.pinRadius / pinDistance) * 180) / Math.PI

  it('the pin sits at -45°, confirming the angle the arc\'s own margin is computed against', () => {
    expect(pinAngleDeg).toBeCloseTo(-45, 5)
  })

  it("the arc's end stays clear of the pin's own angular span, with margin", () => {
    // Review, TT-44 (fifth pass): this used to add the half-width, landing on the pin's *far*
    // edge (-37.30°) and reporting 22.70° of clearance against the arc's real -60° end — the
    // test that was supposed to catch the collision could not, since even `endDeg = -45`
    // (dead on the pin's own centre) would have passed both assertions. The edge closest to
    // the arc's end (which is more negative than the pin) is the pin's *lower* edge, so it is
    // the angle minus the half-width.
    const pinNearEdgeDeg = pinAngleDeg - pinHalfWidthDeg
    expect(SELECTION_ARC.endDeg).toBeLessThan(pinNearEdgeDeg)
    // Not just clear — clear by more than a token amount, so a small future nudge to either
    // side can't reopen the collision by accident. The real margin is 7.30° (-52.70° to -60°);
    // 2° leaves headroom to tighten either number later without this assertion itself lying.
    expect(pinNearEdgeDeg - SELECTION_ARC.endDeg).toBeGreaterThan(2)
  })

  it('the arc never crosses into positive angles, where the fill-count text\'s own crossing points (asin(dy / selectionRadius), both positive) live', () => {
    // `.round .occupancy` sits at `top: 64.9%` (PlanTable.module.css), i.e. `14.9%` of the
    // viewBox below centre — re-declared here, the same way this file's other CSS-adjacent
    // constants are, so a change to either side has to touch both before the gate is green.
    const occupancyDyPercent = 64.9 - 50
    const occupancyDy = (occupancyDyPercent / 100) * RING.viewBox
    const occupancyCrossingDeg = (Math.asin(occupancyDy / RING.selectionRadius) * 180) / Math.PI

    expect(occupancyCrossingDeg).toBeGreaterThan(0)
    expect(SELECTION_ARC.startDeg).toBeLessThan(0)
    expect(SELECTION_ARC.endDeg).toBeLessThan(0)
    // Review, TT-44 (fifth pass): dropped a fourth assertion here that compared 30° against
    // -150° and could never fail — the three checks above already establish the two ranges
    // are on opposite sides of zero, which is the whole of what keeps them apart.
  })

  /**
   * Review, TT-44 (fifth pass). The heading's own line box (19.5px, `--t-heading`'s 15px/1.3)
   * is fixed in CSS px while the arc's extent scales with the table — the same mechanism that
   * caused the fill-count collision this whole pass exists to fix — so at `MIN_TABLE_SIZE` the
   * two boxes *do* overlap in height (confirmed separately, in the browser). That overlap is
   * harmless only because the heading's own glyphs are centred and narrow (the table's number,
   * one or two digits) while the arc's lowest point sits well off to the side — not because the
   * boxes never touch. The previous version of this test asserted the opposite (no height
   * overlap), using the heading's *centre offset* rather than its height, inflated by an
   * unexplained ×5 — asserting the box, not the ink, and wrong about the box too.
   */
  it("the arc's lowest point sits well clear of centre — away from where the heading's own centred, narrow digits are drawn, even though the two boxes overlap in height", () => {
    const startTheta = (SELECTION_ARC.startDeg * Math.PI) / 180
    const endTheta = (SELECTION_ARC.endDeg * Math.PI) / 180
    // The arc's foot is whichever end sits closest to the horizontal centreline — the smaller
    // |sin| — and that is not always the same end.
    const footTheta = Math.abs(Math.sin(startTheta)) < Math.abs(Math.sin(endTheta)) ? startTheta : endTheta
    const footX = RING.centre + RING.selectionRadius * Math.cos(footTheta)

    // A generous bound, not a tight one: a fifth of the viewBox's own width is far more than a
    // one- or two-digit table number, centred, could plausibly reach.
    expect(Math.abs(footX - RING.centre)).toBeGreaterThan(RING.viewBox * 0.2)
  })

  it('is a 90° arc, not a full circle', () => {
    expect(SELECTION_ARC.endDeg - SELECTION_ARC.startDeg).toBe(90)
  })
})

describe('selectionArcEndpoints — matches the angles SELECTION_ARC declares', () => {
  it('both endpoints sit exactly RING.selectionRadius from the table centre', () => {
    const { startX, startY, endX, endY } = selectionArcEndpoints()
    expect(Math.hypot(startX - RING.centre, startY - RING.centre)).toBeCloseTo(RING.selectionRadius, 5)
    expect(Math.hypot(endX - RING.centre, endY - RING.centre)).toBeCloseTo(RING.selectionRadius, 5)
  })

  it('is deterministic: called twice, gives the same two points', () => {
    expect(selectionArcEndpoints()).toEqual(selectionArcEndpoints())
  })
})

describe('chairPositions and chairsVisibleAt — deterministic (engineering-standards.md: same input, same output)', () => {
  it('chairPositions returns a deeply equal value for the same input called twice', () => {
    expect(chairPositions(8)).toEqual(chairPositions(8))
  })

  it('chairsVisibleAt returns the identical value for the same input called twice', () => {
    expect(chairsVisibleAt(8, MIN_TABLE_SIZE)).toEqual(chairsVisibleAt(8, MIN_TABLE_SIZE))
  })
})

/**
 * TT-44 (amendment, C3/C3a-C3d), KB-4. The top table's own row — a single line, not a ring, so
 * these are exercised the same way `chairPositions`/`chairRadius` are above: numeric fixtures,
 * no rendering.
 */
describe('topRowPositions — evenly spaced left to right, one chair per seat (C3, C3c)', () => {
  it.each([1, 6, 8, 10, 26])('returns exactly %i position(s) for %i seat(s)', (n) => {
    expect(topRowPositions(n)).toHaveLength(n)
  })

  it('returns an empty array for zero seats, and for a negative count, rather than throwing', () => {
    expect(() => topRowPositions(0)).not.toThrow()
    expect(() => topRowPositions(-3)).not.toThrow()
    expect(topRowPositions(0)).toEqual([])
    expect(topRowPositions(-3)).toEqual([])
  })

  it('seat indices run 0..n-1, each exactly once', () => {
    const indices = topRowPositions(8)
      .map((chair) => chair.seatIndex)
      .sort((a, b) => a - b)
    expect(indices).toEqual([0, 1, 2, 3, 4, 5, 6, 7])
  })

  it('every chair sits on the same horizontal line — cy is identical for every seat, at 6 and at 8 seats', () => {
    for (const n of [6, 8]) {
      const cys = new Set(topRowPositions(n).map((chair) => chair.cy))
      expect(cys.size).toBe(1)
    }
  })

  /**
   * C3b, and the amendment's own open question with the venue, not blocking: seat 1 (index 0)
   * is built at screen left, "as left to right from the room's side" — the stated default.
   * `column` in `topRowPositions` is the one line to flip if the answer comes back the other
   * way; this is the test that would catch a reversal, the same reason `chairPositions`'s own
   * four-o'clock test exists for a round table's clockwise order.
   */
  it("seat index 0 sits strictly left of every later seat, at both KB-4 top-table sizes (C3b)", () => {
    for (const n of [6, 8]) {
      const positions = topRowPositions(n)
      const first = positions[0]
      if (!first) {
        throw new Error('expected at least one chair position')
      }
      for (const chair of positions.slice(1)) {
        expect(first.cx).toBeLessThan(chair.cx)
      }
    }
  })

  it('seat index i+1 sits strictly to the right of seat index i — the row is monotonically increasing left to right, not merely spread out', () => {
    const positions = topRowPositions(8)
    for (let i = 1; i < positions.length; i++) {
      const previous = positions[i - 1]
      const current = positions[i]
      if (!previous || !current) {
        throw new Error('expected a full row of chairs')
      }
      expect(current.cx).toBeGreaterThan(previous.cx)
    }
  })

  it('a single seat sits centred in the row', () => {
    const [only] = topRowPositions(1)
    expect(only?.cx).toBeCloseTo(TOP_ROW.viewBoxWidth / 2, 5)
  })

  it.each([6, 8, 10, 26])('every chair for %i seats stays within the viewBox, clear of both edges', (n) => {
    const radius = topRowChairRadius(n)
    for (const chair of topRowPositions(n)) {
      expect(chair.cx - radius).toBeGreaterThanOrEqual(0)
      expect(chair.cx + radius).toBeLessThanOrEqual(TOP_ROW.viewBoxWidth)
    }
  })

  it('is deterministic: the same seat count produces a deeply equal row twice', () => {
    expect(topRowPositions(8)).toEqual(topRowPositions(8))
  })
})

describe('topRowChairRadius — adjacent chairs never overlap, at six and eight seats and well past them', () => {
  it.each([2, 6, 8, 10, 26, 60])('adjacent chairs for %i seats never overlap: centre-to-centre distance exceeds twice the chair radius', (n) => {
    const positions = topRowPositions(n)
    const radius = topRowChairRadius(n)
    for (let i = 1; i < positions.length; i++) {
      const previous = positions[i - 1]
      const current = positions[i]
      if (!previous || !current) {
        throw new Error('expected a full row of chairs')
      }
      expect(current.cx - previous.cx).toBeGreaterThan(2 * radius)
    }
  })

  it('is zero for zero seats, and for a negative seat count, rather than throwing', () => {
    expect(() => topRowChairRadius(0)).not.toThrow()
    expect(() => topRowChairRadius(-5)).not.toThrow()
    expect(topRowChairRadius(0)).toBe(0)
    expect(topRowChairRadius(-5)).toBe(0)
  })
})

describe('topRowChairsVisibleAt — the row survives the six- and eight-seat top table, or drops cleanly rather than blur (C7, C3c)', () => {
  it('an eight-seat top table (Celebrity scale, Small and cosy) stays visible at the row\'s own rendered width', () => {
    expect(topRowChairsVisibleAt(8, TOP_ROW.viewBoxWidth)).toBe(true)
  })

  it('a six-seat top table (Adding up) stays visible too', () => {
    expect(topRowChairsVisibleAt(6, TOP_ROW.viewBoxWidth)).toBe(true)
  })

  it('a seat count dense enough for this row\'s own fixed width drops cleanly, rather than blurring into overlapping shapes', () => {
    expect(topRowChairsVisibleAt(100, TOP_ROW.viewBoxWidth)).toBe(false)
  })

  it('is false for a degenerate zero or negative seat count, rather than throwing', () => {
    expect(() => topRowChairsVisibleAt(0, TOP_ROW.viewBoxWidth)).not.toThrow()
    expect(() => topRowChairsVisibleAt(-3, TOP_ROW.viewBoxWidth)).not.toThrow()
    expect(topRowChairsVisibleAt(0, TOP_ROW.viewBoxWidth)).toBe(false)
    expect(topRowChairsVisibleAt(-3, TOP_ROW.viewBoxWidth)).toBe(false)
  })

  it('is deterministic: the same input twice gives the same answer', () => {
    expect(topRowChairsVisibleAt(8, TOP_ROW.viewBoxWidth)).toEqual(topRowChairsVisibleAt(8, TOP_ROW.viewBoxWidth))
  })

  it('grows with the row\'s own rendered width, mirroring chairDiameterPx', () => {
    expect(topRowChairDiameterPx(8, TOP_ROW.viewBoxWidth * 2)).toBeGreaterThan(
      topRowChairDiameterPx(8, TOP_ROW.viewBoxWidth),
    )
  })
})
