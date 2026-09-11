import { describe, expect, it } from 'vitest'
import { RING, seatRingDash } from './ringGeometry'

/**
 * TT-35. `seatRingDash` is pure geometry — no rendering, no store — so it is exercised directly
 * with numeric fixtures rather than through a rendered `<TableRing>`, the same way
 * `src/domain/capacity.ts` is tested apart from any screen that reads it.
 */

describe('seatRingDash — the handoff\'s own worked example (8 seats at ring radius 43)', () => {
  it('gives a dash of 7 and a gap of approximately 26.8', () => {
    const { dash, gap } = seatRingDash(8)
    expect(dash).toBe(7)
    expect(gap).toBeCloseTo(26.8, 1)
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

  it('matches the handoff\'s published radii and stroke weight', () => {
    expect(RING.bodyRadius).toBe(34)
    expect(RING.ringRadius).toBe(43)
    expect(RING.strokeWidth).toBe(7)
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
})
