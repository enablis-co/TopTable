import { Button, tabularClass } from '../../ui'
import styles from './StatusStrip.module.css'

type StatusStripProps = {
  guestCount: number
  totalSeats: number
  onGoToGuests: () => void
}

/**
 * The rail: three label/value pairs and the one secondary action this screen offers. Its
 * lead action is a `Button` with `variant="secondary"` on purpose — KB-5 allows one primary
 * control per view, and on this screen that will be TT-4's scenario cards, not this rail.
 */
export function StatusStrip({ guestCount, totalSeats, onGoToGuests }: StatusStripProps) {
  return (
    <div className={styles.strip}>
      <div className={styles.item}>
        <span className={styles.label}>Guests</span>
        <span className={styles.value}>
          <span className={tabularClass}>{guestCount}</span> loaded
        </span>
      </div>
      <div className={styles.item}>
        <span className={styles.label}>Seats</span>
        <span className={styles.value}>
          <span className={tabularClass}>{totalSeats}</span> configured
        </span>
      </div>
      <div className={styles.item}>
        <span className={styles.label}>Plan</span>
        {/* Literal until TT-12 first generates a plan; no prop or store field anticipates
            that yet. */}
        <span className={styles.value}>Not generated</span>
      </div>
      <Button variant="secondary" onClick={onGoToGuests}>
        Go to guests
      </Button>
    </div>
  )
}
