import { Button } from '../../ui'
import styles from './PlanEmpty.module.css'

type PlanEmptyProps = {
  onGoToScenarios: () => void
}

/**
 * KB-6 does not draw this state — it follows KB-5's "an empty screen is an invitation, not an
 * apology". Reads "Go to scenarios", not "Go to setup": the app header's own "Setup" tab means
 * a label containing "setup" would collide with it once this renders inside the real shell.
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
