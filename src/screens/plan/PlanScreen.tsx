import { useEffect, useId, useMemo, useRef, useState } from 'react'
import { flushSync } from 'react-dom'
import { useTopTableStore } from '../../store/store'
import { useNavigation } from '../../shell/navigation'
import { totalSeats } from '../../domain/capacity'
import { pinnedTableFor } from '../../domain/pins'
import { normaliseRoom, seatPins, tablesInRoom } from '../../domain/seating'
import { allocate } from '../../domain/allocate'
import { evaluateRegistered, registeredSeatGuard } from '../../domain/rules/registry'
import { tablesWithHardViolation } from '../../domain/rules/engine'
import { scorePlan } from '../../domain/rules/score'
import { isTopTableIncomplete } from '../setup/roomCompleteness'
import { seatingViewFrom, planTotals } from './floorplan'
import { PlanHeader } from './PlanHeader'
import { FloorplanGrid } from './FloorplanGrid'
import { PlanEmpty } from './PlanEmpty'
import { UnseatedRail } from './UnseatedRail'
import { ViolationsPanel } from './ViolationsPanel'
import { TableDetailPanel } from './TableDetailPanel'
import { ScoreBreakdownPanel } from './ScoreBreakdownPanel'
import { ClearControls } from './ClearControls'
import { Button } from '../../ui'
import { NO_FILTERS, filterUnseated } from './unseatedFilter'
import type { UnseatedFilters } from './unseatedFilter'
import styles from './PlanScreen.module.css'

/**
 * TT-11, TT-12, TT-13, KB-6 "Plan". Owns every store read and write for this screen; PlanHeader,
 * FloorplanGrid, UnseatedRail and PlanEmpty stay presentational. The plan itself is always
 * derived — from the room, the guests and the pins, plus the solver once `allocated` is true —
 * and never stored (docs/state.md).
 *
 * `allocated`/`setAllocated` arrive as props rather than local state: `App`'s `CurrentScreen`
 * unmounts this component on every tab switch, so state kept here was losing the allocation the
 * moment someone left for Guests and came back. The flag now lives in `App`, above that unmount,
 * and survives it; re-allocating is deterministic, so remounting and recomputing from the same
 * room, guests and pins reproduces the same plan. KB-6's three columns — rail, floorplan,
 * violations — all render now (TT-14), and the third column swaps to a selected table's own
 * detail (TT-15) rather than always showing the violations panel.
 *
 * `selectedTableId` is local view state, unlike `allocated`: nothing requires a table selection
 * to survive a tab switch, so it resets on every remount rather than being hoisted to `App`.
 *
 * `filters` (TT-38) is local view state for the same reason and sits beside it: a trip to
 * Guests and back clears the unseated rail's search and filters along with the scroll
 * position, and that is accepted — `allocated` was lifted because losing it destroyed real
 * work, whereas a search string is cheap to retype. It is never written to `src/store/`
 * (docs/state.md).
 *
 * `showFloorplan` is `hasSeats && !topTableIncomplete` (fix to TT-3): a room short of the
 * top-table minimum renders `PlanEmpty` the same as an unconfigured one, just with different
 * copy — `hasSeats` alone used to be the whole gate, and nine tables of eight with no top
 * table rendered a floorplan.
 */
type PlanScreenProps = {
  allocated: boolean
  setAllocated: (allocated: boolean) => void
}

export function PlanScreen({ allocated, setAllocated }: PlanScreenProps) {
  const room = useTopTableStore((s) => s.room)
  const guests = useTopTableStore((s) => s.guests)
  const scenario = useTopTableStore((s) => s.scenario)
  const pins = useTopTableStore((s) => s.pins)
  const pinGuest = useTopTableStore((s) => s.pinGuest)
  const unpinGuest = useTopTableStore((s) => s.unpinGuest)
  const clearPins = useTopTableStore((s) => s.clearPins)
  const { goTo } = useNavigation()

  const [selectedGuestId, setSelectedGuestId] = useState<string | null>(null)
  const [selectedTableId, setSelectedTableId] = useState<string | null>(null)
  const [announcement, setAnnouncement] = useState('')
  const [filters, setFilters] = useState<UnseatedFilters>(NO_FILTERS)
  // TT-16. Local view state, matching selectedTableId's own reasoning above: nothing requires
  // the breakdown to survive a tab switch. At most one of selectedTableId and breakdownOpen is
  // ever set — enforced by handleSelectTable/handleToggleBreakdown below, not by render order —
  // so the third column never shows two of its three states at once.
  const [breakdownOpen, setBreakdownOpen] = useState(false)
  const breakdownPanelId = useId()
  const scoreToggleRef = useRef<HTMLButtonElement>(null)

  const railRef = useRef<HTMLDivElement>(null)
  const railHeadingRef = useRef<HTMLHeadingElement>(null)
  // TT-15's fallback focus target: set only when a release leaves no rail row to land on
  // (the solver immediately re-seats the guest elsewhere rather than leaving them unseated).
  const dismissButtonRef = useRef<HTMLButtonElement>(null)

  // Normalised first, matching FloorplanGrid's own generator — see normaliseRoom in ../../domain/seating.
  const normalisedRoom = normaliseRoom(room)
  const hasSeats = totalSeats(normalisedRoom) > 0
  // Checked on the normalised room for the same reason hasSeats is: a hand-edited or pre-rule
  // persisted room can carry a negative or fractional field, and this gate has to agree with
  // the table generator. See src/screens/setup/roomCompleteness.ts.
  const topTableIncomplete = isTopTableIncomplete(normalisedRoom)
  const showFloorplan = hasSeats && !topTableIncomplete
  const slots = tablesInRoom(room)
  // Hoisted once and passed to every solver call below — including handleAllocate's own,
  // separate run — so the rules a rendered seat obeys and the rules an announced figure was
  // computed from can never be two different guards (TT-14).
  const seatGuard = useMemo(() => registeredSeatGuard(), [])
  const plan = useMemo(
    () => (allocated ? allocate(room, guests, pins, { allowSeat: seatGuard }) : seatPins(room, guests, pins)),
    [allocated, room, guests, pins, seatGuard],
  )
  const report = useMemo(() => evaluateRegistered(plan), [plan])
  // TT-16. Derived from the same report the violations panel reads, so the score and the
  // violations list can never disagree about which plan they describe.
  const planScore = useMemo(() => scorePlan(report), [report])
  // TT-16 (review). A score going null clears the breakdown rather than leaving it open for a
  // later score to re-open unbidden. No control on this screen reaches that today — clear,
  // auto-allocate, place and release all change the seating, never the guest list, so
  // opportunities never drops to zero within one mount (planScoreColumn.test.tsx, "clearing the
  // allocation does not null the score…"). Kept for a future in-place guest edit, which would.
  // Adjusted during render, React's own pattern for reacting to a value changing between renders
  // without an effect: it re-renders once, before the browser paints, rather than committing the
  // stale screen and correcting it a tick later.
  if (planScore.score === null && breakdownOpen) {
    setBreakdownOpen(false)
  }
  const violatingTableIds = useMemo(() => tablesWithHardViolation(report), [report])
  const seating = useMemo(() => seatingViewFrom(plan, violatingTableIds), [plan, violatingTableIds])
  // TT-38. Filtered here, not inside UnseatedRail, so the component stays a pure renderer of
  // exactly the rows it is given — `totalCount` (plan.unseated.length) travels alongside it
  // for the header's shown/hidden line.
  const visibleUnseated = useMemo(() => filterUnseated(plan.unseated, filters), [plan.unseated, filters])
  // TT-38 delta. The combobox's suggestion pool: side/role/needs filters still apply (so a
  // suggestion is never a guest the active filters would hide) but the search text does not
  // (so typing doesn't narrow its own suggestion source out from under it).
  const suggestionPool = useMemo(
    () => filterUnseated(plan.unseated, { ...filters, query: '' }),
    [plan.unseated, filters],
  )
  const selectedGuest = guests.find((guest) => guest.id === selectedGuestId) ?? null
  // `?? null` guards a table that stopped existing after a room edit — the violations panel is
  // the fallback rather than a crash.
  const selectedTable = plan.tables.find((table) => table.id === selectedTableId) ?? null

  // Active only while a guest is selected — GuestRowMenu's own listen/cleanup pattern. Also
  // doubles as the escape hatch for PlanTable's own placing-over-selecting priority (review,
  // TT-15): while a guest is selected, clicking a table places rather than selects it, so this
  // is how a user reaches a table's detail panel (and the release control that lives only there)
  // without first placing the selected guest — the same way `handleSelect`'s own toggle below
  // does, by clicking the selected guest's row again.
  useEffect(() => {
    if (selectedGuestId === null) return

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        setSelectedGuestId(null)
        setAnnouncement('Selection cleared')
      }
    }

    document.addEventListener('keydown', handleKeyDown)
    return () => {
      document.removeEventListener('keydown', handleKeyDown)
    }
  }, [selectedGuestId])

  // The rail's own buttons, current as of the last commit. Reads railRef rather than closing
  // over unseated, so a caller wrapping its state updates in flushSync first is guaranteed
  // this sees the post-update DOM rather than the render that was current when it was called.
  function railButtons(): HTMLButtonElement[] {
    return Array.from(railRef.current?.querySelectorAll<HTMLButtonElement>('[data-guest-id]') ?? [])
  }

  function handleSelect(guestId: string) {
    setSelectedGuestId((current) => (current === guestId ? null : guestId))
  }

  // TT-15. Clicking the already-selected table again dismisses its detail panel, matching
  // handleSelect's own toggle above. TT-16: also closes the breakdown, so selecting a table
  // while it is open swaps the column to that table's detail rather than opening both.
  function handleSelectTable(tableId: string) {
    setSelectedTableId((current) => (current === tableId ? null : tableId))
    setBreakdownOpen(false)
  }

  // TT-16. Opens or closes the breakdown and, symmetrically with handleSelectTable above,
  // clears any open table detail — the third column holds at most one of the two. Focus is
  // left on the toggle in both directions: opening keeps it there by not moving it, and
  // handleDismissBreakdown below returns it explicitly.
  function handleToggleBreakdown() {
    setBreakdownOpen((current) => !current)
    setSelectedTableId(null)
  }

  // TT-16. The breakdown's own close control. Unlike handleRelease's fallback focus above, the
  // toggle is already mounted and stays mounted, so no flushSync is needed before focusing it.
  function handleDismissBreakdown() {
    setBreakdownOpen(false)
    scoreToggleRef.current?.focus()
  }

  function handlePlace(tableId: string) {
    if (selectedGuest === null) return

    const tableLabel = slots.find((slot) => slot.id === tableId)?.label ?? tableId
    const guestName = selectedGuest.name
    // flushSync, not an effect: the row being focused next unmounts as part of this same
    // update (the placed guest leaves the rail), so focus has to move only once the DOM
    // reflects that — synchronously, or the moment in between would drop focus to <body>.
    flushSync(() => {
      pinGuest(selectedGuest.id, tableId)
      setSelectedGuestId(null)
      setAnnouncement(`${guestName} placed at ${tableLabel}`)
    })
    const firstRemaining = railButtons()[0]
    if (firstRemaining) {
      firstRemaining.focus()
    } else {
      railHeadingRef.current?.focus()
    }
  }

  function handleRelease(guestId: string) {
    const guest = guests.find((candidate) => candidate.id === guestId)
    const tableId = pinnedTableFor(pins, guestId)
    const tableLabel = tableId === null ? null : slots.find((slot) => slot.id === tableId)?.label
    flushSync(() => {
      unpinGuest(guestId)
      setAnnouncement(`${guest?.name ?? 'Guest'} released from ${tableLabel ?? 'their table'}`)
    })
    const reappeared = railButtons().find((button) => button.dataset.guestId === guestId)
    if (reappeared) {
      reappeared.focus()
    } else {
      // `allocated` re-seats the just-unpinned guest immediately rather than leaving them on
      // the rail, so there is no row for them to land on — the table detail panel they were
      // released from is still open (releasing never changes `selectedTableId`), so its own
      // dismiss control is the nearest visible, focusable thing.
      dismissButtonRef.current?.focus()
    }
  }

  function handleAllocate() {
    // setAllocated(true) leaves this render's own `plan` pointed at the pre-click seating —
    // that closure doesn't update until the next render, and flushSync can't change that, only
    // when the DOM catches up. A second, throwaway solver run is what the announcement can
    // trust — passed the same seatGuard as the memoised plan above, or the two could seat a
    // guest differently; see the PlanScreen test asserting the announced figures match the plan
    // actually rendered.
    const justAllocated = allocate(room, guests, pins, { allowSeat: seatGuard })
    const seatedCount = guests.length - justAllocated.unseated.length
    setAllocated(true)
    setSelectedGuestId(null)
    setAnnouncement(`Allocated. ${seatedCount} seated, ${justAllocated.unseated.length} unseated.`)
  }

  // TT-37. "Clear the allocation" is setAllocated(false) and nothing else — PlanScreen:81-84
  // already falls back to seatPins (pinned guests only) once allocated is false, so there is no
  // seat-level write to make and nothing new to store. The throwaway seatPins run below is not a
  // duplicate: this render's `plan` closure still points at the allocated seating until the next
  // render lands — the same trap handleAllocate's own comment above documents — so the announced
  // figures have to come from a fresh run rather than from `plan`.
  function handleClearAllocation() {
    const cleared = seatPins(room, guests, pins)
    setAllocated(false)
    setSelectedGuestId(null)
    setAnnouncement(
      `Allocation cleared. ${guests.length - cleared.unseated.length} seated, ${cleared.unseated.length} unseated.`,
    )
  }

  function handleClearEverything() {
    const cleared = seatPins(room, guests, [])
    setAllocated(false)
    clearPins()
    setSelectedGuestId(null)
    setAnnouncement(
      `Allocation and pins cleared. ${guests.length - cleared.unseated.length} seated, ${cleared.unseated.length} unseated.`,
    )
  }

  return (
    <div className={styles.plan}>
      <h1 className="tt-visually-hidden">Plan</h1>
      {showFloorplan ? (
        <div className={styles.layout}>
          <div className={styles.canvas}>
            {/* Auto-allocate stays the screen's one primary action (handoff rule 2) but now
                sits at this row's right edge rather than above it — the button is still owned
                and handled entirely by this file; PlanHeader gains no new prop for it. */}
            <div className={styles.canvasHeader}>
              <PlanHeader
                scenario={scenario}
                room={room}
                guests={guests}
                seating={seating}
                unseatedCount={plan.unseated.length}
                score={{
                  value: planScore.score,
                  expanded: breakdownOpen,
                  panelId: breakdownPanelId,
                  onToggle: handleToggleBreakdown,
                  toggleRef: scoreToggleRef,
                }}
              />
              <Button variant="primary" className={styles.allocate} onClick={handleAllocate}>
                Auto-allocate
              </Button>
              <ClearControls
                pinnedCount={planTotals(guests, seating).pinnedCount}
                onClearAllocation={handleClearAllocation}
                onClearEverything={handleClearEverything}
              />
            </div>
            <div className={styles.floorplanArea}>
              <FloorplanGrid
                room={room}
                seating={seating}
                placingGuestName={selectedGuest?.name}
                onPlace={handlePlace}
                onSelect={handleSelectTable}
                selectedTableId={selectedTableId}
              />
            </div>
            <div ref={railRef}>
              <UnseatedRail
                guests={visibleUnseated}
                totalCount={plan.unseated.length}
                filters={filters}
                onFiltersChange={setFilters}
                suggestionPool={suggestionPool}
                selectedGuestId={selectedGuestId}
                onSelect={handleSelect}
                headingRef={railHeadingRef}
              />
            </div>
          </div>
          <div className={styles.violations}>
            {selectedTable ? (
              <TableDetailPanel
                table={selectedTable}
                onRelease={handleRelease}
                onDismiss={() => {
                  setSelectedTableId(null)
                }}
                dismissButtonRef={dismissButtonRef}
              />
            ) : breakdownOpen && planScore.score !== null ? (
              // TT-16. Guarded on a non-null score so the one render between a score going null
              // and the render-phase correction above clearing breakdownOpen falls back to the
              // violations panel rather than rendering an empty list.
              <ScoreBreakdownPanel
                id={breakdownPanelId}
                dimensions={planScore.dimensions}
                onDismiss={handleDismissBreakdown}
              />
            ) : (
              <ViolationsPanel report={report} />
            )}
          </div>
          <p role="status" className="tt-visually-hidden">
            {announcement}
          </p>
        </div>
      ) : (
        <PlanEmpty
          reason={hasSeats ? 'topTableIncomplete' : 'unconfigured'}
          onGoToSetup={() => {
            goTo('setup')
          }}
        />
      )}
    </div>
  )
}
