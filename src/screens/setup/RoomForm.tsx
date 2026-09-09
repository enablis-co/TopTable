import type { RoomConfig } from '../../domain/types'
import { TextField } from '../../ui'
import { displayRoomNumber, parseRoomNumber } from './roomInput'
import styles from './RoomForm.module.css'

type RoomFormProps = {
  eventName: string
  room: RoomConfig
  onEventNameChange: (name: string) => void
  onRoomChange: (patch: Partial<RoomConfig>) => void
}

/**
 * Presentational: every value and callback comes from the caller, so this has no store
 * access of its own. TT-4 has wrapped this with the scenario cards, the "or set it up
 * yourself" divider and the loaded/Custom chip — nothing here anticipates them.
 */
export function RoomForm({ eventName, room, onEventNameChange, onRoomChange }: RoomFormProps) {
  return (
    <div className={styles.form}>
      <TextField
        label="Event name"
        value={eventName}
        onChange={(e) => {
          onEventNameChange(e.target.value)
        }}
      />
      <div className={styles.numbers}>
        <TextField
          label="Round tables"
          type="number"
          inputMode="numeric"
          min={0}
          value={displayRoomNumber(room.roundTables)}
          onChange={(e) => {
            onRoomChange({ roundTables: parseRoomNumber(e.target.value) })
          }}
        />
        <TextField
          label="Seats each"
          type="number"
          inputMode="numeric"
          min={0}
          value={displayRoomNumber(room.seatsEach)}
          onChange={(e) => {
            onRoomChange({ seatsEach: parseRoomNumber(e.target.value) })
          }}
        />
        <TextField
          label="Top table seats"
          type="number"
          inputMode="numeric"
          min={0}
          value={displayRoomNumber(room.topTableSeats)}
          onChange={(e) => {
            onRoomChange({ topTableSeats: parseRoomNumber(e.target.value) })
          }}
        />
      </div>
    </div>
  )
}
