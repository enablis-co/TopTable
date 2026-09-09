import type { CSSProperties } from 'react'
import type { RoomConfig } from '../../domain/types'
import { floorplanFromRoom, occupantsAt, roundTableColumns, type SeatingView } from './floorplan'
import { PlanTable } from './PlanTable'
import styles from './FloorplanGrid.module.css'

type FloorplanGridProps = {
  room: RoomConfig
  seating: SeatingView
}

/** The one CSS custom property this component sets — see the comment on the `<ul>` below. */
type GridStyle = CSSProperties & { '--floorplan-columns': number }

/**
 * TT-11, C1, C2, KB-6 "Plan". The top table and the round-table grid, top table first (C2) and on
 * its own row above.
 *
 * Human decision, 2026-09-09, two changes:
 *
 * 1. The top table is rendered in a **separate** `<ul>` from the round tables, not the single
 *    shared list this component started with. That split is load-bearing, not cosmetic: the
 *    round-table grid's column count has to be able to shrink to fewer than every generated
 *    track once there are fewer round tables than fit a row (see point 2), and a
 *    `grid-column: 1 / -1` sibling — the top table's old positioning — spans every one of those
 *    tracks by definition, which would have defeated that collapsing entirely had it stayed in
 *    the same grid. Pulling the top table out sidesteps the question rather than fighting it.
 *
 * 2. The round-table grid's column count is `roundTableColumns(roundSlots.length)` — a plain
 *    number, set as the `--floorplan-columns` custom property below — not `auto-fit`/`auto-fill`.
 *    `roundTableColumns` (in `./floorplan`) and this file's own stylesheet both carry the full
 *    argument for why: in short, `auto-fit`/`auto-fill` respond to *container width*, and at any
 *    choice of floor and ceiling, converge every real track back to the ceiling regardless of how
 *    many tables exist — measured, not assumed, across all three of KB-3's scenarios. Making size
 *    respond to *table count* needs the count itself to choose the number of columns.
 *
 * Two sibling `<ul>`s rather than one shared list is still valid for A9 ("tables are `<li>`
 * elements, not buttons"): a bare `<li>` outside any list container does not carry the
 * "listitem" role, so the top table gets a one-item list of its own (`.topRow`) rather than
 * losing that role. No test in this ticket's suite asserts a single shared list — `PlanTable.test.tsx`
 * and `PlanScreen.test.tsx` both locate tables via `[data-occupancy]`, which does not care how many
 * `<ul>`s own them — and C2's "before every round table in DOM order" holds precisely because the
 * top table's `<ul>` is written first.
 *
 * 3. Review, 2026-09-09: `.grid` sets `overflow-x: auto` (FloorplanGrid.module.css) but was never
 *    reachable by keyboard — `tabindex` was null and A9's `<li>` tables have no focusable
 *    descendant of their own — so a keyboard-only user could not scroll this list at all, and
 *    could not reach a table past the visible edge. Measured: at 1100px with 9 round tables (the
 *    case FloorplanGrid.module.css's own review comment already names), the grid carries 84px of
 *    horizontal overflow and the ninth table sits inside it. That is WCAG 2.1.1, and it is this
 *    file's own `overflow-x: auto` that created it, not something A9 left unfinished. The fix is
 *    `tabIndex`, `role="region"` and a real `aria-label` on the scrolling element itself: once
 *    it can hold focus, the browser's native "scroll the focused element" behaviour on arrow keys
 *    applies with no keydown handler, and it is announced as a named region rather than an
 *    anonymous one. Nothing here turns a table into a button — A9 is untouched.
 *
 *    Unconditional (`roundSlots.length > 0`, the same guard already below), not measured: whether
 *    this list actually overflows depends on viewport width, which is the exact kind of thing A6
 *    already ruled out measuring in JS. Table count is not a safe proxy for it either — this same
 *    9-table case is nowhere near `MAX_ROUND_TABLE_COLUMNS` (11) and still overflows at a plain
 *    laptop width, so "only make it focusable once the grid is near its column cap" would still
 *    leave a keyboard user stranded at smaller counts and viewports. A focus stop that
 *    occasionally scrolls nothing is the accepted, common-practice cost against that.
 *
 *    A second review, 2026-09-09, found that fix incomplete. `role="region"` had been put
 *    directly on the `<ul>`, replacing its *implicit* `list` role — and unlike `PillInput`'s and
 *    `ConflictPicker`'s `role="listbox"` (whose `option` children stay countable), a `region`
 *    gives its children nothing. So the round tables stopped being exposed as list items, and a
 *    screen reader user lost the item count — "list, 9 items" is the most useful thing this
 *    container can announce. "No test depends on that role" was not evidence it was harmless:
 *    `dom-accessibility-api` (what the suite's `getByRole` runs on) maps `li` to `listitem`
 *    unconditionally, with no check on what role its parent actually carries, so
 *    `queryAllByRole('listitem')` passes whether or not the parent still reads as a list to a
 *    real browser — the suite is blind to this, not indifferent.
 *
 *    The fix: `overflow-x: auto`, `tabIndex`, `role="region"` and the `aria-label` all moved onto
 *    a wrapper `<div>` (`.gridScroll` in FloorplanGrid.module.css) around the `<ul>`, which goes
 *    back to being a plain, unadorned list. A `<div>` has no implicit role of its own for
 *    `region` to replace, so nothing is lost by putting it there, and the `<ul>`/`<li>` pair
 *    keeps its `list`/`listitem` roles exactly as if no accessibility fix had touched it at all.
 *    See FloorplanGrid.module.css's own comment on `.gridScroll` for the layout half of this —
 *    moving `overflow-x: auto` up one level does not change what actually gets scrolled. Nothing
 *    here turns a table into a button, and nothing depends on `listitem` either way: point 2
 *    above is exactly why `PlanTable.test.tsx` and `PlanScreen.test.tsx` both locate tables via
 *    `[data-occupancy]` instead.
 */
export function FloorplanGrid({ room, seating }: FloorplanGridProps) {
  const slots = floorplanFromRoom(room)
  const topSlot = slots.find((slot) => slot.kind === 'top')
  const roundSlots = slots.filter((slot) => slot.kind === 'round')

  // A plain number, no unit — FloorplanGrid.module.css's `.grid` rule is the only place that
  // knows this is a column count, and the only place the 112px/200px track bounds live.
  const gridStyle: GridStyle = { '--floorplan-columns': roundTableColumns(roundSlots.length) }

  return (
    <div className={styles.floorplan}>
      {topSlot && (
        <ul className={styles.topRow}>
          <PlanTable slot={topSlot} occupants={occupantsAt(seating, topSlot.id)} />
        </ul>
      )}
      {roundSlots.length > 0 && (
        // tabIndex/role/aria-label live on this wrapper, not the <ul> below — see this file's
        // header comment, point 3 (as amended). This is the element `overflow-x: auto` makes
        // scrollable (FloorplanGrid.module.css's `.gridScroll`), so it is the element a keyboard
        // user has to be able to reach and operate. The <ul> stays a plain list so its <li>
        // tables keep their `listitem` role.
        <div className={styles.gridScroll} tabIndex={0} role="region" aria-label="Round tables">
          <ul className={styles.grid} style={gridStyle}>
            {roundSlots.map((slot) => (
              <PlanTable key={slot.id} slot={slot} occupants={occupantsAt(seating, slot.id)} />
            ))}
          </ul>
        </div>
      )}
    </div>
  )
}
