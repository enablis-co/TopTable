import { useLayoutEffect, useRef, useState } from 'react'
import { Button, cx } from '../../ui'
import { useTopTableStore } from '../../store/store'
import { useNavigation } from '../../shell/navigation'
import { suggestExactRoom, totalSeats } from '../../domain/capacity'
import type { ScenarioId } from '../../domain/scenarios'
import type { Guest } from '../../domain/types'
import { RoomForm } from './RoomForm'
import { CapacityReadout } from './CapacityReadout'
import { StatusStrip } from './StatusStrip'
import { SuggestionLine } from './SuggestionLine'
import { hasTypedRoom, isTopTableIncomplete } from './roomCompleteness'
import { ScenarioChip } from './ScenarioChip'
import { ScenarioPicker } from './ScenarioPicker'
import styles from './SetupScreen.module.css'

/**
 * KB-6, Setup. Owns every store read and write for this screen — RoomForm, CapacityReadout,
 * StatusStrip and SuggestionLine are all presentational, so this is the only file here that
 * touches `useTopTableStore` or `useNavigation`.
 *
 * Three conditions govern the screen, and they are not the same condition:
 *
 * - `hasGuests || roomIncomplete` gates the capacity readout. Guests give it seats to compare
 *   against; a room short of the top-table minimum (fix to TT-3, product-owner ruling) has
 *   nothing to compare either way, so that state shows regardless of guest count — KB-1's
 *   manual-setup journey checks the room before a guest list necessarily exists.
 * - `hasGuests && !roomIncomplete` gates the suggestion line alone. It proposes a round-table
 *   count for today's guest count, which is meaningless with no guests to aim at, and equally
 *   meaningless advice while the top table itself is still invalid.
 * - `hasGuests || isConfigured` gates the rail (the status strip, and the grid column it
 *   sits in). The rail's "Seats — {n} configured" figure is not a comparison, it is what the
 *   user just typed, so KB-1's "or set the room up by hand" journey step has something to
 *   show for it even before a single guest exists.
 *
 * True first visit is `!hasGuests && !isConfigured`: no rail at all, and the aria-live region
 * (below) carries only its one line of empty-state text — KB-6's first-visit wireframe, still
 * matched exactly. A room that has been started but is short of the top-table minimum is a
 * different state again, and is never silent about it.
 */
export function SetupScreen({
  allocated = false,
  clearAllocation = () => {},
}: {
  allocated?: boolean
  /** Called once an import completes (TT-37), so the flag it resets never outlives the guest
   * list it described. Optional with a no-op default: existing tests render `<SetupScreen />`
   * with no props and must keep compiling. */
  clearAllocation?: () => void
}) {
  const event = useTopTableStore((s) => s.event)
  const room = useTopTableStore((s) => s.room)
  const guests = useTopTableStore((s) => s.guests)
  const scenario = useTopTableStore((s) => s.scenario)
  const setEventName = useTopTableStore((s) => s.setEventName)
  const setRoom = useTopTableStore((s) => s.setRoom)
  const importScenario = useTopTableStore((s) => s.importScenario)
  const { goTo } = useNavigation()

  // Nothing on this screen reads a guest's contents, only the count.
  const guestCount = guests.length
  const hasGuests = guestCount > 0
  const isConfigured = totalSeats(room) > 0
  const showRail = hasGuests || isConfigured
  // Fix to TT-3: a top table is always required, at a minimum of 2 seats, once the room has
  // been started — see src/screens/setup/roomCompleteness.ts for what "started" means and why
  // this is not a src/domain/ concern.
  const roomIncomplete = isTopTableIncomplete(room)
  // TT-4's "importing over existing data asks first" asks a different question from
  // isConfigured, which needs a non-zero seat *total* to decide whether the rail has
  // anything worth showing. A half-typed room — {5, 0, 0} while the other two fields are
  // still empty — totals zero seats and is still a number the user typed, so an import
  // would destroy it. Reusing isConfigured here skipped the prompt for exactly that case.
  // Both are things a scenario import overwrites; the event name is not, so it does not count.
  const hasExistingData = hasGuests || hasTypedRoom(room)

  // TT-4: the picker collapses behind a chip once a scenario is loaded, and "Change
  // scenario" brings it back. Derived rather than stored — showCards is view state, not
  // product data (Assumed A12) — so it is correct even if persistence ever became async.
  const [revealed, setRevealed] = useState(false)
  const changeScenarioRef = useRef<HTMLButtonElement | null>(null)
  const focusChangeControl = useRef(false)
  const showCards = scenario === null || revealed

  const handleImport = (id: ScenarioId, guests: Guest[]) => {
    // Flag set before the store write, not after: if the zustand notification ever commits
    // on its own (a flushSync, a batching change), the layout effect below would run with
    // the flag still false and no further render would arrive to consume it — leaving it
    // armed to fire on the next unrelated render and yank focus mid-keystroke.
    focusChangeControl.current = true
    importScenario(id, guests)
    // TT-37 defect fix: importScenario replaces the guest list `allocated` describes, but
    // whether the room is allocated is a separate flag lifted to App — nothing else resets it.
    clearAllocation()
    setRevealed(false)
  }

  // Moves focus to "Change scenario" once an import completes (C33): the collapse removes
  // whatever the user was operating (the confirm prompt's Load button, or the card itself),
  // and focus falling to <body> is a defect against TT-7's focus-visible obligation. The
  // one-shot ref flag, set only by handleImport and cleared the first time it is read, is
  // what keeps this off every other render — including the reveal, where autoFocusFirstCard
  // moves focus instead (A14).
  useLayoutEffect(() => {
    if (!focusChangeControl.current) return
    focusChangeControl.current = false
    changeScenarioRef.current?.focus()
  })

  return (
    <div className={cx(styles.screen, showRail && styles.withRail)}>
      <h1 className="tt-visually-hidden">Setup</h1>
      <div className={styles.main}>
        {scenario !== null && (
          <div className={styles.chipRow}>
            <ScenarioChip scenario={scenario} />
            {!showCards && (
              <Button
                variant="quiet"
                ref={changeScenarioRef}
                onClick={() => {
                  setRevealed(true)
                }}
              >
                Change scenario
              </Button>
            )}
          </div>
        )}
        {showCards && (
          <ScenarioPicker
            hasExistingData={hasExistingData}
            currentGuestCount={guestCount}
            autoFocusFirstCard={revealed}
            onImport={handleImport}
          />
        )}
        <RoomForm
          eventName={event.name}
          room={room}
          onEventNameChange={setEventName}
          onRoomChange={setRoom}
        />
      </div>
      {showRail && (
        <StatusStrip
          guestCount={guestCount}
          totalSeats={totalSeats(room)}
          allocated={allocated}
          onGoToGuests={() => {
            goTo('guests')
          }}
        />
      )}
      {/*
        The one aria-live region on this screen, present from first paint rather than mounted
        only once there is something to say inside it — a region inserted and filled in the
        same commit is not reliably announced by a screen reader, and TT-4's import would
        otherwise walk straight into that gap. No aria-atomic: the default announces only the
        changed subtree, so a keystroke doesn't re-read both sentences every time. No
        role="alert" or role="status": short is a warning and the suggestion is advice,
        neither is an alert or a status message.

        It spans the full grid width (.liveRegion), because KB-6 draws the suggestion line
        running under the rail rather than confined beside it the way the readout box is —
        .readoutBounds pulls the box's own width back down to match the room form above it.
      */}
      <div aria-live="polite" className={styles.liveRegion}>
        {hasGuests || roomIncomplete ? (
          <>
            <div className={styles.readoutBounds}>
              <CapacityReadout room={room} guestCount={guestCount} />
            </div>
            {hasGuests && !roomIncomplete && (
              <SuggestionLine
                suggestion={suggestExactRoom(room, guestCount)}
                guestCount={guestCount}
              />
            )}
          </>
        ) : (
          <p className={styles.emptyCapacity}>No guests yet, so nothing to work out</p>
        )}
      </div>
    </div>
  )
}
