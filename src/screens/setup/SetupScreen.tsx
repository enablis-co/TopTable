import { cx } from '../../ui'
import { useTopTableStore } from '../../store/store'
import { useNavigation } from '../../shell/navigation'
import { suggestExactRoom, totalSeats } from '../../domain/capacity'
import { RoomForm } from './RoomForm'
import { CapacityReadout } from './CapacityReadout'
import { StatusStrip } from './StatusStrip'
import { SuggestionLine } from './SuggestionLine'
import styles from './SetupScreen.module.css'

/**
 * KB-6, Setup. Owns every store read and write for this screen — RoomForm, CapacityReadout,
 * StatusStrip and SuggestionLine are all presentational, so this is the only file here that
 * touches `useTopTableStore` or `useNavigation`.
 *
 * Two conditions govern the screen, and they are not the same condition:
 *
 * - `hasGuests` gates the capacity readout and the suggestion line alone. Both compare seats
 *   to a guest list, and with no guests there is nothing to compare — TT-3's acceptance
 *   criteria are explicit about the readout, and the suggestion follows the same logic.
 * - `hasGuests || isConfigured` gates the rail (the status strip, and the grid column it
 *   sits in). The rail's "Seats — {n} configured" figure is not a comparison, it is what the
 *   user just typed, so KB-1's "or set the room up by hand" journey step has something to
 *   show for it even before a single guest exists.
 *
 * True first visit is `!hasGuests && !isConfigured`: no rail at all, and the aria-live region
 * (below) carries only its one line of empty-state text — KB-6's first-visit wireframe, still
 * matched exactly.
 */
export function SetupScreen() {
  const event = useTopTableStore((s) => s.event)
  const room = useTopTableStore((s) => s.room)
  const guests = useTopTableStore((s) => s.guests)
  const setEventName = useTopTableStore((s) => s.setEventName)
  const setRoom = useTopTableStore((s) => s.setRoom)
  const { goTo } = useNavigation()

  // Nothing on this screen reads a guest's contents, only the count.
  const guestCount = guests.length
  const hasGuests = guestCount > 0
  const isConfigured = totalSeats(room) > 0
  const showRail = hasGuests || isConfigured

  return (
    <div className={cx(styles.screen, showRail && styles.withRail)}>
      <h1 className="tt-visually-hidden">Setup</h1>
      <div className={styles.main}>
        {/*
          TT-4 lands here, above the form: the scenario cards, the "or set it up yourself"
          divider below them, and the loaded/Custom chip above the event name field. There
          is nothing to divide until TT-4 exists, so no divider is built in this ticket.
        */}
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
        {hasGuests ? (
          <>
            <div className={styles.readoutBounds}>
              <CapacityReadout room={room} guestCount={guestCount} />
            </div>
            <SuggestionLine
              suggestion={suggestExactRoom(room, guestCount)}
              guestCount={guestCount}
            />
          </>
        ) : (
          <p className={styles.emptyCapacity}>No guests yet, so nothing to work out</p>
        )}
      </div>
    </div>
  )
}
