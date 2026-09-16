import { describe, expect, it } from 'vitest'
import { RING, seatRingDash, chairPositions, chairRadius, chairsVisibleAt } from './ringGeometry'
import { MIN_TABLE_SIZE } from './floorplanFit'

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

  it.each([4, 8, 12, 20, 30])(
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

  it('is false for a degenerate zero or negative seat count, whatever the rendered size, rather than throwing', () => {
    expect(() => chairsVisibleAt(0, MIN_TABLE_SIZE)).not.toThrow()
    expect(() => chairsVisibleAt(-3, MIN_TABLE_SIZE)).not.toThrow()
    expect(chairsVisibleAt(0, MIN_TABLE_SIZE)).toBe(false)
    expect(chairsVisibleAt(-3, MIN_TABLE_SIZE)).toBe(false)
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
