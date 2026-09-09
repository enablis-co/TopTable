import { Button } from '../../ui'
import styles from './GuestsEmpty.module.css'

type GuestsEmptyProps = {
  onGoToSetup: () => void
}

/**
 * TT-6, C30. One of KB-6's three states that "must look intentional rather than broken." The
 * line is KB-5's own worked example for this exact state — the "Not: No guests yet" wording
 * it replaces does not appear here. "Add your first guest" points at the Add guest button
 * TT-5 puts in the header above this, present in both states; this component only supplies
 * the route back to Setup's scenarios.
 */
export function GuestsEmpty({ onGoToSetup }: GuestsEmptyProps) {
  return (
    <div className={styles.empty}>
      <p className={styles.message}>Start from a scenario, or add your first guest</p>
      <Button variant="secondary" onClick={onGoToSetup}>
        Go to setup
      </Button>
    </div>
  )
}
