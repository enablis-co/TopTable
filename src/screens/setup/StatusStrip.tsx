import { Button, tabularClass } from '../../ui'
import styles from './StatusStrip.module.css'

type StatusStripProps = {
  guestCount: number
  totalSeats: number
  allocated: boolean
  onGoToGuests: () => void
}

/**
 * The rail: three label/value pairs and the one secondary action this screen offers. Its
 * lead action is a `Button` with `variant="secondary"` on purpose — KB-5 allows one primary
 * control per view, and on this screen that is the import confirmation's Load button, not
 * this rail.
 */
export function StatusStrip({ guestCount, totalSeats, allocated, onGoToGuests }: StatusStripProps) {
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
        <span className={styles.value}>{allocated ? 'Allocated' : 'Not generated'}</span>
      </div>
      <Button variant="secondary" onClick={onGoToGuests}>
        Go to guests
      </Button>
    </div>
  )
}
