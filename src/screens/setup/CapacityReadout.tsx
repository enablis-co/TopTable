import { capacityFor } from '../../domain/capacity'
import type { RoomConfig } from '../../domain/types'
import { tabularClass } from '../../ui'
import styles from './CapacityReadout.module.css'

type CapacityReadoutProps = {
  room: RoomConfig
  guestCount: number
}

/** Every number here updates as the room or the guest list changes, so every one of them
 *  gets the tabular-figure class (KB-5) — otherwise the readout jitters as you type. */
function Num({ value }: { value: number }) {
  return <span className={tabularClass}>{value}</span>
}

/**
 * The most-read component in the product (KB-6). It has no `aria-live` of its own — the
 * wrapper in `SetupScreen` covers this and `SuggestionLine` together, so one keystroke
 * announces both sentences once rather than each fragment re-announcing itself. It never
 * carries `role="alert"`, in the short state or any other: short is a warning, not an error.
 *
 * The short state's left border is the shape half of KB-5's "colour never carries meaning
 * alone" — the `data-state` attribute is the other half, so the state is checkable without
 * reading colour at all.
 */
export function CapacityReadout({ room, guestCount }: CapacityReadoutProps) {
  const capacity = capacityFor(room, guestCount)
  const { totalSeats, state, spare, shortfall } = capacity

  const seatWord = totalSeats === 1 ? 'seat' : 'seats'
  const guestWord = guestCount === 1 ? 'guest' : 'guests'

  const hasTables = room.roundTables > 0
  const hasTopTable = room.topTableSeats > 0
  const hasBreakdown = hasTables || hasTopTable

  return (
    <div className={styles.readout} data-state={state}>
      <p className={styles.line}>
        <Num value={totalSeats} /> {seatWord} for <Num value={guestCount} /> {guestWord}.
        {state === 'slack' && (
          <>
            {' '}
            <Num value={spare} /> spare.
          </>
        )}
        {state === 'exact' && ' Exactly enough.'}
        {state === 'short' && (
          <>
            {' '}
            <Num value={shortfall} /> short.
          </>
        )}
      </p>
      {hasBreakdown && (
        <p className={styles.breakdown}>
          {hasTables && (
            <>
              <Num value={room.roundTables} /> × <Num value={room.seatsEach} />
            </>
          )}
          {hasTables && hasTopTable && ', plus '}
          {hasTopTable && (
            <>
              a top table of <Num value={room.topTableSeats} />
            </>
          )}
        </p>
      )}
    </div>
  )
}
