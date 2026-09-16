import { useCallback, useLayoutEffect, useMemo, useRef } from 'react'
import type { Ref } from 'react'
import { Button, Combobox, Select, Tag, capitalizeFirst, cx, tabularClass } from '../../ui'
import { OTHER_ROLES, PROTOCOL_ROLES } from '../../domain/types'
import type { Guest, Role, Side } from '../../domain/types'
import { NO_FILTERS, isFiltered } from './unseatedFilter'
import type { NeedsFilter, UnseatedFilters } from './unseatedFilter'
import { suggestionsFrom } from './unseatedSuggestions'
import styles from './UnseatedRail.module.css'

const ROLES: Role[] = [...OTHER_ROLES, ...PROTOCOL_ROLES]
const SIDES: Side[] = ['bride', 'groom', 'both']

type UnseatedRailProps = {
  /** Already filtered by `PlanScreen` — this component renders exactly the rows it is given. */
  guests: readonly Guest[]
  /** The unfiltered total, for the header count and the shown/hidden line. */
  totalCount: number
  filters: UnseatedFilters
  onFiltersChange: (filters: UnseatedFilters) => void
  /**
   * TT-38 delta. The unseated guests surviving the three non-query filters (side, role,
   * needs) but not the search text — `PlanScreen`'s own filter with `query` reset to `''`.
   * Suggesting a guest the active filters would exclude, or one already seated, would land
   * the search on "No one matches those filters": a defect dressed as a feature. Optional,
   * defaulting to no suggestions, so a caller that has not yet been given a pool degrades to
   * a plain search rather than failing to typecheck.
   */
  suggestionPool?: readonly Guest[]
  selectedGuestId: string | null
  onSelect: (guestId: string) => void
  headingRef: Ref<HTMLHeadingElement>
  /**
   * TT-36. Which guest's hover summary, if any, is currently open — drives `aria-describedby` on
   * the one row it describes, never on every row (an id referencing a card that isn't showing
   * that guest would be a broken relationship, not a helpful one). `summaryId` is the rendered
   * `GuestHoverCard`'s own id; `onGuestHover`/`onGuestHoverEnd` open and close it. All four are
   * optional so a caller that hasn't wired the summary up degrades to the rail as it stood before
   * this ticket, with no hover or focus behaviour added.
   */
  summaryGuestId?: string | null
  summaryId?: string
  onGuestHover?: (guestId: string, element: HTMLElement) => void
  onGuestHoverEnd?: (guestId: string) => void
}

/**
 * TT-12, TT-35, TT-38, KB-6 "Plan". The bottom strip: a header row ("Unseated", the total or
 * the shown/hidden count), a search-and-filter row, then the scrolling list of every guest
 * that survives search and the three filters, in guest-list order. The full total in the
 * header (unfiltered) is what makes the rail honest at any filter setting — nothing is ever
 * truncated by count, only by the filters the person chose. Presentational, writes nothing;
 * `PlanScreen` owns selection, the filter state and the place/release handlers.
 *
 * Each row is a quiet `Button`, not a listbox option: `aria-pressed` marks the selected one
 * with a border (`.rail .row[aria-pressed='true']`), a shape rather than a colour swap, so
 * KB-5's "strip every colour out and the screen still reads" holds with no fill added.
 * `data-guest-id` lets `PlanScreen` find a specific row to move focus to after a gesture
 * unmounts the control the user just activated. The Clear filters button deliberately does
 * not carry `data-guest-id` — `PlanScreen`'s `railButtons()` queries that attribute inside
 * `railRef` to manage focus after a placement, and a button carrying it would be treated as
 * a guest row.
 *
 * `tabIndex={-1}` on the heading is not for tab order — it is `PlanScreen`'s focus target when
 * a placement empties this rail and there is no longer a row to land on. The guest total sits
 * beside the heading, not inside it, so the heading's own accessible name stays exactly
 * "Unseated" (UnseatedRail.test.tsx asserts this by name).
 *
 * The header and the search/filter row sit outside the scrolling list, so they stay visible
 * while the list scrolls as a structural fact — no `position: sticky`, which jsdom
 * cannot see and which is fragile inside a flex column. `UnseatedRail.module.css` bounds the
 * list's own height; this component only ever renders it, never measures it.
 *
 * Three body states, not two: `totalCount === 0` ("Everyone has a seat.", no controls at all —
 * there is nothing yet to search or filter); `guests.length === 0` with a totalCount above
 * zero ("No one matches those filters.", controls still shown so the person can change them);
 * otherwise the list. These are genuinely different states — an empty rail because everyone
 * is seated is not the same fact as a filter combination nobody satisfies — so they are never
 * collapsed into one line.
 *
 * TT-35 scope carried forward: this is click-to-place, never drag — TT-23 is where dragging a
 * guest onto a table belongs, and it is out of the MVP (KB-1). No `draggable`, no drag-hover
 * state, no grab cursor, and the hint keeps its click wording rather than the handoff's drag
 * copy.
 *
 * TT-38, C11 — a browser-only finding (jsdom does no layout, so nothing in the suite can see
 * this): `PlanScreen`'s `handlePlace` moves focus to the first remaining row after a placement
 * (that call is out of scope to edit here), and every browser scrolls a scrollable
 * ancestor to bring a newly focused element into view by default. Once the list scrolls
 * (TT-38's own change), that first row is routinely off-screen, so a placement was silently
 * scrolling the list back to the top — exactly the reset C11 rules out. Fixed here, not by
 * fighting the browser's focus algorithm (which would also cost real keyboard users the
 * "scroll the focused row into view" behaviour while tabbing), but by restoring the list's own
 * scroll position on the one `focusin` that immediately follows a same-filter drop in guest
 * count — the signature of a placement, never of ordinary Tab navigation or of a filter
 * narrowing the list.
 *
 * Review: the `<ul>` below is one arm of a three-way conditional (the empty-rail and
 * no-matches states render a `<p>` instead), so it unmounts and a fresh node mounts every time
 * the rail crosses in or out of those states. A `useEffect` bound to a ref only ever runs
 * against whichever node existed when it last ran, so the listeners have to live on a callback
 * ref instead — it fires on every mount and unmount of the element itself, not just the
 * component's, and re-binds to whichever `<ul>` is actually current. UnseatedRail.test.tsx
 * guards this by filtering the list empty, clearing the filter and proving the restore still
 * fires on the node that replaces it.
 *
 * TT-38 delta: the search field is now `Combobox`, offering suggestions from `suggestionPool`
 * (names, then tags), and each row that carries a role other than `guest` marks it with a
 * `Tag` — sunken-on-surface, never coloured, KB-5's "colour never carries meaning alone" for
 * the twelve roles rather than for a subset of them.
 */
export function UnseatedRail({
  guests,
  totalCount,
  filters,
  onFiltersChange,
  suggestionPool = [],
  selectedGuestId,
  onSelect,
  headingRef,
  summaryGuestId = null,
  summaryId,
  onGuestHover,
  onGuestHoverEnd,
}: UnseatedRailProps) {
  const filtered = isFiltered(filters)
  const hiddenCount = totalCount - guests.length
  const suggestions = useMemo(() => suggestionsFrom(suggestionPool), [suggestionPool])

  function setField<K extends keyof UnseatedFilters>(key: K, value: UnseatedFilters[K]) {
    onFiltersChange({ ...filters, [key]: value })
  }

  // See the component doc comment (TT-38, C11). `scrollTopRef` tracks the list's own scroll
  // position on every user- or browser-driven scroll; `restoreOnNextFocusRef` is armed only
  // when this render is a same-filter drop in guest count (a placement), and consumed by the
  // very next `focusin` inside the list — which is exactly the one `handlePlace`'s
  // subsequent `firstRemaining.focus()` call raises.
  const listNodeRef = useRef<HTMLUListElement | null>(null)
  const scrollTopRef = useRef(0)
  const restoreOnNextFocusRef = useRef(false)
  const previousGuestCountRef = useRef(guests.length)
  const previousFiltersRef = useRef(filters)

  useLayoutEffect(() => {
    restoreOnNextFocusRef.current = guests.length < previousGuestCountRef.current && filters === previousFiltersRef.current
    previousGuestCountRef.current = guests.length
    previousFiltersRef.current = filters
  })

  // Bodies close only over refs, never over props or state, so these two are stable for the
  // component's whole lifetime — `setListRef` below can depend on them without ever changing
  // identity itself.
  const handleListScroll = useCallback(() => {
    const list = listNodeRef.current
    if (list) scrollTopRef.current = list.scrollTop
  }, [])

  const handleListFocusIn = useCallback(() => {
    if (!restoreOnNextFocusRef.current) return
    restoreOnNextFocusRef.current = false
    const list = listNodeRef.current
    if (list) list.scrollTop = scrollTopRef.current
  }, [])

  const setListRef = useCallback(
    (node: HTMLUListElement | null) => {
      listNodeRef.current?.removeEventListener('scroll', handleListScroll)
      listNodeRef.current?.removeEventListener('focusin', handleListFocusIn)
      listNodeRef.current = node
      node?.addEventListener('scroll', handleListScroll)
      node?.addEventListener('focusin', handleListFocusIn)
    },
    [handleListScroll, handleListFocusIn],
  )

  return (
    <div className={styles.rail}>
      <div className={styles.header}>
        <h2 tabIndex={-1} ref={headingRef} className={styles.heading}>
          Unseated
        </h2>{' '}
        {filtered ? (
          <span className={styles.count}>
            <span className={tabularClass}>{guests.length}</span> shown ·{' '}
            <span className={tabularClass}>{hiddenCount}</span> hidden
          </span>
        ) : (
          <span className={cx(tabularClass, styles.count)}>{totalCount}</span>
        )}
        <p className={styles.instruction}>Click a guest then a seat to place and pin them.</p>
      </div>
      {totalCount > 0 ? (
        <div className={styles.controls}>
          <Combobox
            label="Search name or tag"
            labelHidden
            placeholder="Search name or tag"
            value={filters.query}
            onChange={(value) => {
              setField('query', value)
            }}
            suggestions={suggestions}
          />
          <Select
            label="Filter by side"
            labelHidden
            value={filters.side}
            onChange={(event) => {
              setField('side', event.target.value as Side | 'any')
            }}
          >
            <option value="any">Any side</option>
            {SIDES.map((side) => (
              <option key={side} value={side}>
                {capitalizeFirst(side)}
              </option>
            ))}
          </Select>
          <Select
            label="Filter by role"
            labelHidden
            value={filters.role}
            onChange={(event) => {
              setField('role', event.target.value as Role | 'any')
            }}
          >
            <option value="any">Any role</option>
            {ROLES.map((role) => (
              <option key={role} value={role}>
                {capitalizeFirst(role)}
              </option>
            ))}
          </Select>
          <Select
            label="Filter by need"
            labelHidden
            value={filters.needs}
            onChange={(event) => {
              setField('needs', event.target.value as NeedsFilter)
            }}
          >
            <option value="any">Any need</option>
            <option value="with">Has a need recorded</option>
            <option value="without">No need recorded</option>
          </Select>
          {filtered ? (
            <Button
              variant="quiet"
              onClick={() => {
                onFiltersChange(NO_FILTERS)
              }}
            >
              Clear filters
            </Button>
          ) : null}
        </div>
      ) : null}
      {totalCount === 0 ? (
        <p className={styles.empty}>Everyone has a seat.</p>
      ) : guests.length === 0 ? (
        <p className={styles.empty}>No one matches those filters.</p>
      ) : (
        <ul className={styles.list} ref={setListRef}>
          {guests.map((guest) => (
            <li key={guest.id}>
              <Button
                variant="quiet"
                className={styles.row}
                aria-pressed={guest.id === selectedGuestId}
                aria-describedby={summaryId && guest.id === summaryGuestId ? summaryId : undefined}
                data-guest-id={guest.id}
                onClick={() => {
                  onSelect(guest.id)
                }}
                onMouseEnter={(event) => {
                  onGuestHover?.(guest.id, event.currentTarget)
                }}
                onMouseLeave={() => {
                  onGuestHoverEnd?.(guest.id)
                }}
                onFocus={(event) => {
                  onGuestHover?.(guest.id, event.currentTarget)
                }}
                onBlur={() => {
                  onGuestHoverEnd?.(guest.id)
                }}
              >
                {guest.name}
                {guest.role !== 'guest' ? (
                  <>
                    {' '}
                    <Tag>{capitalizeFirst(guest.role)}</Tag>
                  </>
                ) : null}
              </Button>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
