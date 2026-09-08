import { useTopTableStore } from './store/store'

/**
 * Scaffold proof of life, and no more than that.
 *
 * TT-2 has to stand the project up and show that state reaches local storage and comes
 * back after a refresh. The three real screens are TT-3 to TT-6, and the shell they hang
 * in — header, tabs, tokens, shared components — is TT-7. This file is replaced by that
 * work; do not extend it.
 */
export default function App() {
  const event = useTopTableStore((state) => state.event)
  const room = useTopTableStore((state) => state.room)
  const guestCount = useTopTableStore((state) => state.guests.length)
  const setEventName = useTopTableStore((state) => state.setEventName)
  const setRoom = useTopTableStore((state) => state.setRoom)
  const reset = useTopTableStore((state) => state.reset)

  return (
    <main style={{ padding: 24, maxWidth: 560 }}>
      <h1>Top Table</h1>
      <p>
        Scaffold only. The setup, guests and plan screens are TT-3 to TT-6, and the shell they
        sit in is TT-7. Change a value, reload the page, and it is still here.
      </p>

      <p>
        <label>
          Event name{' '}
          <input
            value={event.name}
            onChange={(e) => {
              setEventName(e.target.value)
            }}
          />
        </label>
      </p>

      <fieldset>
        <legend>Room</legend>
        {(['roundTables', 'seatsEach', 'topTableSeats'] as const).map((field) => (
          <p key={field}>
            <label>
              {field}{' '}
              <input
                type="number"
                min={0}
                value={room[field]}
                onChange={(e) => {
                  setRoom({ [field]: Number(e.target.value) })
                }}
              />
            </label>
          </p>
        ))}
      </fieldset>

      <p>Guests loaded: {guestCount}</p>

      <button type="button" onClick={reset}>
        Reset to first visit
      </button>
    </main>
  )
}
