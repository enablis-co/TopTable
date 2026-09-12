import { roundTableColumns } from './floorplan'
import { RING } from './ringGeometry'

/**
 * TT-38. View geometry for the round-table grid — not `src/domain/`, which knows nothing about
 * pixels. Picks the column count and table size that fit a measured box on both axes, in place
 * of the CSS `auto-fit` grid that only ever wrapped by width and scrolled by height.
 */

// Derived from RING, not a literal 61 — floorplanFit.test.ts pins this against RING.bodyRadius
// directly, so a future change to the ring's own geometry can't silently move the floor with it.
export const MIN_TABLE_SIZE = Math.ceil((22 * RING.viewBox) / RING.bodyRadius)

export const MAX_TABLE_SIZE = 200

export type FloorplanFit = {
  columns: number
  rows: number
  size: number
  showsFillCount: boolean
}

type FitInput = {
  width: number
  height: number
  count: number
  gap: number
}

/**
 * `width <= 0 || height <= 0` is the unmeasured path: jsdom has no `ResizeObserver` and
 * `getBoundingClientRect` always reads zero there, so this is what `floorplanStyles.test.ts` and
 * every other existing render test exercise, unchanged from the grid's old `auto-fit` behaviour.
 */
export function fitFloorplan({ width, height, count, gap }: FitInput): FloorplanFit {
  if (count <= 0) {
    return { columns: 1, rows: 0, size: MAX_TABLE_SIZE, showsFillCount: true }
  }

  if (width <= 0 || height <= 0) {
    const columns = roundTableColumns(count)
    return { columns, rows: Math.ceil(count / columns), size: MAX_TABLE_SIZE, showsFillCount: true }
  }

  let bestColumns = 1
  let bestSize = -Infinity

  for (let columns = 1; columns <= count; columns += 1) {
    const rows = Math.ceil(count / columns)
    const byWidth = (width - (columns - 1) * gap) / columns
    const byHeight = (height - (rows - 1) * gap) / rows
    const size = Math.min(byWidth, byHeight, MAX_TABLE_SIZE)

    // Strictly greater, not >=, so the first (fewest-columns) candidate wins a tie — determinism
    // the ticket's own test plan requires (fitFloorplan.test.ts: "same input twice, same output").
    if (size > bestSize) {
      bestSize = size
      bestColumns = columns
    }
  }

  // Computed from the unclamped size, before the floor below replaces it — reversed, the floor
  // would erase the fact that the fit wanted something smaller (D4).
  const showsFillCount = bestSize > MIN_TABLE_SIZE
  const size = Math.max(bestSize, MIN_TABLE_SIZE)

  // bestColumns was chosen to maximise the *unclamped* size — once that size is raised to the
  // floor, bestColumns can be too many for the width to hold at the floor's larger size, and the
  // grid overflows sideways as well as (correctly) needing a vertical scroll. Re-deriving the
  // column count for the floor, rather than keeping the one optimal for a smaller table, is what
  // keeps `columns * size + (columns - 1) * gap <= width` — floorplanFit.test.ts asserts that
  // invariant directly.
  const columns =
    size === bestSize ? bestColumns : Math.min(count, Math.max(1, Math.floor((width + gap) / (size + gap))))
  const rows = Math.ceil(count / columns)

  return { columns, rows, size, showsFillCount }
}
