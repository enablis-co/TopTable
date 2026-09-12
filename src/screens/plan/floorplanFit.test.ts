import { describe, expect, it } from 'vitest'
import { fitFloorplan, MIN_TABLE_SIZE, MAX_TABLE_SIZE } from './floorplanFit'
import { RING } from './ringGeometry'
import { roundTableColumns } from './floorplan'

/**
 * TT-38 delta plan, §D4/§D6 — "The floorplan fits the height it is given rather than
 * scrolling, by scaling its tables down" (D1) and the floor at a 22px rendered radius (D2/D3).
 * Written from the plan's contract for `fitFloorplan` without opening floorplanFit.ts: the
 * function signature, the unmeasured-path fallback, the per-column scan and the
 * showsFillCount-before-flooring order are all given there, not inferred from the file.
 *
 * `fitFloorplan` is pure and deterministic, so every case here is exact arithmetic rather than
 * a rendered measurement — the one part of D1-D6 that is testable at all, per R1.
 */

// D2: MIN_TABLE_SIZE must be derived from the ring's own geometry, not a hand-typed literal —
// the plan states this explicitly ("not a literal"). Recomputing the same formula from RING
// here is what would catch a future change to RING silently drifting the floor away from 22px.
const EXPECTED_MIN_TABLE_SIZE = Math.ceil((22 * RING.viewBox) / RING.bodyRadius)

describe('fitFloorplan — the floor is derived from the ring geometry, not a literal', () => {
  it('MIN_TABLE_SIZE equals ceil(22 * RING.viewBox / RING.bodyRadius)', () => {
    expect(MIN_TABLE_SIZE).toBe(EXPECTED_MIN_TABLE_SIZE)
  })

  it('MAX_TABLE_SIZE is 200', () => {
    expect(MAX_TABLE_SIZE).toBe(200)
  })
})

describe('fitFloorplan — the unmeasured path keeps the existing suite green (jsdom has no layout)', () => {
  it('width 0 returns the max table size, the fill count shown, and the same column count the fixed grid already uses', () => {
    const result = fitFloorplan({ width: 0, height: 500, count: 9, gap: 16 })

    expect(result.size).toBe(MAX_TABLE_SIZE)
    expect(result.showsFillCount).toBe(true)
    expect(result.columns).toBe(roundTableColumns(9))
    expect(result.rows).toBe(Math.ceil(9 / roundTableColumns(9)))
  })

  it('height 0 returns the same unmeasured fallback, at a count that also exercises the column cap', () => {
    const result = fitFloorplan({ width: 500, height: 0, count: 26, gap: 16 })

    expect(result.size).toBe(MAX_TABLE_SIZE)
    expect(result.showsFillCount).toBe(true)
    expect(result.columns).toBe(roundTableColumns(26))
    expect(result.rows).toBe(Math.ceil(26 / roundTableColumns(26)))
  })

  it('a negative width is also unmeasured, not just exactly zero', () => {
    const result = fitFloorplan({ width: -10, height: 500, count: 5, gap: 16 })

    expect(result.size).toBe(MAX_TABLE_SIZE)
    expect(result.showsFillCount).toBe(true)
    expect(result.columns).toBe(roundTableColumns(5))
  })
})

describe('fitFloorplan — count 0 or below has nothing to lay out', () => {
  it('count 0 returns columns 1, rows 0, even with a real measured box', () => {
    const result = fitFloorplan({ width: 500, height: 500, count: 0, gap: 16 })

    expect(result.columns).toBe(1)
    expect(result.rows).toBe(0)
  })
})

describe('fitFloorplan — a wide, short box picks more columns than a narrow, tall one for the same count', () => {
  it('8 tables in 3000×200 fit 8-across; the same 8 tables in 200×3000 fit 1-across', () => {
    const wide = fitFloorplan({ width: 3000, height: 200, count: 8, gap: 8 })
    const narrow = fitFloorplan({ width: 200, height: 3000, count: 8, gap: 8 })

    expect(wide.columns).toBeGreaterThan(narrow.columns)
    expect(wide.columns).toBe(8)
    expect(wide.rows).toBe(1)
    expect(narrow.columns).toBe(1)
    expect(narrow.rows).toBe(8)
  })
})

describe('fitFloorplan — 26 tables in a short window come back at or above the floor, never below', () => {
  it('a comfortably wide but short box never returns a size under MIN_TABLE_SIZE', () => {
    const result = fitFloorplan({ width: 2000, height: 150, count: 26, gap: 8 })

    expect(result.size).toBeGreaterThanOrEqual(MIN_TABLE_SIZE)
  })

  it('a box too short to hold 26 tables even at the floor still returns exactly the floor, not smaller (D5)', () => {
    const result = fitFloorplan({ width: 2000, height: 10, count: 26, gap: 8 })

    expect(result.size).toBe(MIN_TABLE_SIZE)
    expect(result.showsFillCount).toBe(false)
  })
})

describe('fitFloorplan — showsFillCount is decided before the floor is applied (A2)', () => {
  it('is false once the unclamped fit wants the floor or smaller, even though size itself is floored back up to it', () => {
    // Reversed, the floor would erase the fact that the fit wanted smaller — the plan's own
    // warning for exactly this ordering.
    const result = fitFloorplan({ width: 2000, height: 10, count: 26, gap: 8 })

    expect(result.size).toBe(MIN_TABLE_SIZE)
    expect(result.showsFillCount).toBe(false)
  })

  it('is false exactly at the floor, not only strictly below it (A2: "at or below", never "strictly below")', () => {
    // A single table (no column choice to make) sized so the width bound lands exactly on
    // MIN_TABLE_SIZE, with height left generous so it can never be the binding dimension.
    const result = fitFloorplan({ width: MIN_TABLE_SIZE, height: 1000, count: 1, gap: 8 })

    expect(result.size).toBe(MIN_TABLE_SIZE)
    expect(result.showsFillCount).toBe(false)
  })

  it('is true once the unclamped fit is comfortably above the floor', () => {
    const result = fitFloorplan({ width: 100, height: 1000, count: 1, gap: 8 })

    expect(result.size).toBe(100)
    expect(result.showsFillCount).toBe(true)
  })
})

describe('fitFloorplan — rows × size + gaps never exceeds the given height, unless the size is already at the floor (D5)', () => {
  function heightBudget(result: ReturnType<typeof fitFloorplan>, gap: number): number {
    return result.rows * result.size + Math.max(0, result.rows - 1) * gap
  }

  it('holds for a generously sized box (nine tables, "Adding up" scale)', () => {
    const gap = 16
    const result = fitFloorplan({ width: 1200, height: 900, count: 9, gap })

    expect(result.size).toBeGreaterThan(MIN_TABLE_SIZE)
    expect(heightBudget(result, gap)).toBeLessThanOrEqual(900)
  })

  it('is allowed to be exceeded only when the floor itself could not be honoured otherwise (D5, "a floor, not a guarantee")', () => {
    const gap = 8
    const result = fitFloorplan({ width: 2000, height: 10, count: 26, gap })

    expect(result.size).toBe(MIN_TABLE_SIZE)
    // The floor alone already overruns this height — proving the escape hatch above is
    // actually exercised here, not vacuously true.
    expect(heightBudget(result, gap)).toBeGreaterThan(10)
  })
})

describe('fitFloorplan — columns × size + gaps never exceeds the given width, unless columns is already 1', () => {
  function widthBudget(result: ReturnType<typeof fitFloorplan>, gap: number): number {
    return result.columns * result.size + Math.max(0, result.columns - 1) * gap
  }

  it('holds once the size has been clamped up to the floor (26 tables, 1180×756 — the column count picked for the unclamped size must not survive the clamp)', () => {
    const gap = 16
    const result = fitFloorplan({ width: 622, height: 140, count: 26, gap })

    expect(result.size).toBe(MIN_TABLE_SIZE)
    expect(widthBudget(result, gap)).toBeLessThanOrEqual(622)
  })

  it('holds for a generously sized box, well above the floor', () => {
    const gap = 16
    const result = fitFloorplan({ width: 1200, height: 900, count: 9, gap })

    expect(widthBudget(result, gap)).toBeLessThanOrEqual(1200)
  })

  it('giving the fit more height never produces a taller layout — more room should never force fewer, wider columns at the floor', () => {
    const gap = 16
    const shorter = fitFloorplan({ width: 622, height: 110, count: 26, gap })
    const taller = fitFloorplan({ width: 622, height: 140, count: 26, gap })

    function heightBudget(result: ReturnType<typeof fitFloorplan>): number {
      return result.rows * result.size + Math.max(0, result.rows - 1) * gap
    }

    expect(heightBudget(taller)).toBeLessThanOrEqual(heightBudget(shorter))
  })

  it('is exempt only at columns 1 — a box narrower than one floored table still returns something renderable', () => {
    const gap = 16
    const result = fitFloorplan({ width: 20, height: 20, count: 26, gap })

    expect(result.columns).toBe(1)
    expect(result.size).toBe(MIN_TABLE_SIZE)
  })
})

describe('fitFloorplan — determinism: the same input produces the same output twice', () => {
  it('two separate calls with equal, freshly-built input objects agree exactly', () => {
    const input = { width: 1180, height: 756, count: 26, gap: 16 }
    const first = fitFloorplan({ ...input })
    const second = fitFloorplan({ ...input })

    expect(second).toEqual(first)
  })
})
