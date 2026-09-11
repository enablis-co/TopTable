import type { Ref } from 'react'
import { Button, cx, tabularClass } from '../../ui'
import type { Guest } from '../../domain/types'
import styles from './UnseatedRail.module.css'

type UnseatedRailProps = {
  guests: readonly Guest[]
  selectedGuestId: string | null
  onSelect: (guestId: string) => void
  headingRef: Ref<HTMLHeadingElement>
}

/**
 * TT-12, TT-35, KB-6 "Plan". The bottom strip: a header row ("Unseated", the total, then the
 * hint), then every guest holding no pin, in guest-list order, never truncated (AC19) — the
 * criterion is that any of them can be clicked. The handoff's own "+62 more" overflow marker is
 * not built: the total in the header row already answers "how many", and every chip still
 * renders, which is what makes that total honest. Presentational, writes nothing; `PlanScreen`
 * owns selection and the place/release handlers.
 *
 * Each row is a quiet `Button`, not a listbox option: `aria-pressed` marks the selected one
 * with a border (`.rail .row[aria-pressed='true']`), a shape rather than a colour swap, so
 * KB-5's "strip every colour out and the screen still reads" holds with no fill added.
 * `data-guest-id` lets `PlanScreen` find a specific row to move focus to after a gesture
 * unmounts the control the user just activated.
 *
 * `tabIndex={-1}` on the heading is not for tab order — it is `PlanScreen`'s focus target when
 * a placement empties this rail and there is no longer a row to land on. The guest total sits
 * beside the heading, not inside it, so the heading's own accessible name stays exactly
 * "Unseated" (UnseatedRail.test.tsx asserts this by name).
 *
 * TT-35 scope: this is click-to-place, never drag — TT-23 is where dragging a guest onto a
 * table belongs, and it is out of the MVP (KB-1). No `draggable`, no drag-hover state, no grab
 * cursor, and the hint keeps its click wording rather than the handoff's drag copy.
 */
export function UnseatedRail({ guests, selectedGuestId, onSelect, headingRef }: UnseatedRailProps) {
  return (
    <div className={styles.rail}>
      <div className={styles.header}>
        <h2 tabIndex={-1} ref={headingRef} className={styles.heading}>
          Unseated
        </h2>{' '}
        <span className={cx(tabularClass, styles.count)}>{guests.length}</span>
        <p className={styles.instruction}>Click a guest then a seat to place and pin them.</p>
      </div>
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
