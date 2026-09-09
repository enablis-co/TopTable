import { scenarioById } from '../../domain/scenarios'
import type { ScenarioState } from '../../store/store'
import styles from './ScenarioChip.module.css'

type ScenarioChipProps = {
  scenario: ScenarioState
}

/**
 * TT-4, KB-6's chip. A local component rather than a reuse of src/ui/Tag: Tag's own
 * contract says tags "do not signal anything", and this chip signals which scenario is
 * loaded. It borrows Tag's tokens, not its class.
 *
 * Renders nothing before anything has been imported (C16) — no role="status", no
 * aria-live: the count of the screen's one aria-live region must stay at one (section 4a).
 */
export function ScenarioChip({ scenario }: ScenarioChipProps) {
  if (scenario === null) return null

  return (
    <span className={styles.chip}>{scenario === 'custom' ? 'Custom' : `${scenarioById(scenario).name} loaded`}</span>
  )
}
