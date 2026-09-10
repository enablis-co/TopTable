import type { Ref } from 'react'
import { Button } from '../../ui'
import type { Guest } from '../../domain/types'
import styles from './UnseatedRail.module.css'

type UnseatedRailProps = {
  guests: Guest[]
  selectedGuestId: string | null
  onSelect: (guestId: string) => void
  headingRef: Ref<HTMLHeadingElement>
}

/**
 * TT-12, KB-6 "Plan". The "Unseated" column: every guest holding no pin, in guest-list order,
 * never truncated — the criterion is that any of them can be clicked. Presentational, writes
 * nothing; `PlanScreen` owns selection and the place/release handlers.
 *
 * Each row is a quiet `Button`, not a listbox option: `aria-pressed` marks the selected one
 * with a border (`.rail .row[aria-pressed='true']`), a shape rather than a colour swap, so
 * KB-5's "strip every colour out and the screen still reads" holds with no fill added.
 * `data-guest-id` lets `PlanScreen` find a specific row to move focus to after a gesture
 * unmounts the control the user just activated.
 *
 * `tabIndex={-1}` on the heading is not for tab order — it is `PlanScreen`'s focus target when
 * a placement empties this rail and there is no longer a row to land on.
 */
export function UnseatedRail({ guests, selectedGuestId, onSelect, headingRef }: UnseatedRailProps) {
  return (
    <div className={styles.rail}>
      <h2 tabIndex={-1} ref={headingRef}>
        Unseated
      </h2>
      <p className={styles.instruction}>Click a guest then a seat to place and pin them.</p>
      {guests.length === 0 ? (
        <p className={styles.empty}>Everyone has a seat.</p>
      ) : (
        <ul className={styles.list}>
          {guests.map((guest) => (
            <li key={guest.id}>
              <Button
                variant="quiet"
                className={styles.row}
                aria-pressed={guest.id === selectedGuestId}
                data-guest-id={guest.id}
                onClick={() => {
                  onSelect(guest.id)
                }}
              >
                {guest.name}
              </Button>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
