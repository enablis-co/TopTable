import { Button } from '../../ui'
import { MIN_TOP_TABLE_SEATS } from '../setup/roomCompleteness'
import styles from './PlanEmpty.module.css'

/**
 * `'unconfigured'`: nothing seats anyone yet, KB-6's original empty case. `'topTableIncomplete'`
 * (fix to TT-3): the room has round tables and/or seats but no valid top table — a different
 * problem with a different fix, so it gets its own copy rather than reusing the scenario one.
 */
export type PlanEmptyReason = 'unconfigured' | 'topTableIncomplete'

type PlanEmptyProps = {
  reason: PlanEmptyReason
  onGoToSetup: () => void
}

/**
 * KB-6 does not draw either state — both follow KB-5's "an empty screen is an invitation, not
 * an apology". Neither button reads "Go to setup": the app header's own "Setup" tab means a
 * label containing "setup" would collide with it once this renders inside the real shell, so
 * each names the action instead (KB-5: a button is named for what it does).
 */
export function PlanEmpty({ reason, onGoToSetup }: PlanEmptyProps) {
  if (reason === 'topTableIncomplete') {
    return (
      <div className={styles.empty}>
        <p className={styles.message}>
          Add a top table of at least {MIN_TOP_TABLE_SEATS} seats. Set it on Setup.
        </p>
        <Button variant="secondary" onClick={onGoToSetup}>
          Add the top table
        </Button>
      </div>
    )
  }

  return (
    <div className={styles.empty}>
      <p className={styles.message}>Start from a scenario, or set the room up</p>
      <Button variant="secondary" onClick={onGoToSetup}>
        Go to scenarios
      </Button>
    </div>
  )
}
