import { Button } from '../../ui'
import styles from './PlanEmpty.module.css'

type PlanEmptyProps = {
  onGoToScenarios: () => void
}

/**
 * TT-11, C10, A8. KB-6 does not draw this state — it is derived from KB-5's "an empty screen
 * is an invitation, not an apology" and shown here rather than an empty grid, in the manner
 * of `GuestsEmpty` (one of KB-6's own three "must look intentional" states, one screen
 * earlier). The control reads "Go to scenarios", not "Go to setup", for the same reason
 * `GuestsEmpty`'s does: the app header's own always-present "Setup" tab means any label
 * containing "setup" collides with it once this renders inside the real shell.
 */
export function PlanEmpty({ onGoToScenarios }: PlanEmptyProps) {
  return (
    <div className={styles.empty}>
      <p className={styles.message}>Start from a scenario, or set the room up</p>
      <Button variant="secondary" onClick={onGoToScenarios}>
        Go to scenarios
      </Button>
    </div>
  )
}
