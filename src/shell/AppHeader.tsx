import { scenarioById } from '../domain/scenarios'
import { useTopTableStore } from '../store/store'
import type { ScenarioState } from '../store/store'
import { Mark } from '../ui'
import styles from './AppHeader.module.css'

/**
 * Present on every section: identity only — the mark, the wordmark, the event name and
 * which scenario (if any) is loaded. TT-35 moved the three section controls out to
 * `NavRail`; nothing here navigates and nothing here is a screen's own action (A13).
 */

// Sentence case, like every other label in the product. The handoff's reference file draws
// this pill lowercase ("small and cosy"), but its own prose calls that "the scenario name in
// sentence case" and its rule 7 says sentence case everywhere, as does KB-5. The rule stated
// twice beats the example that contradicts it, so the name is used as the domain spells it.
// "Custom" is KB-6's wording for a room edited away from its scenario.
function scenarioPillText(scenario: ScenarioState): string | null {
  if (scenario === null) return null
  if (scenario === 'custom') return 'Custom'
  return scenarioById(scenario).name
}

export function AppHeader() {
  const eventName = useTopTableStore((state) => state.event.name)
  const scenario = useTopTableStore((state) => state.scenario)
  const pillText = scenarioPillText(scenario)
  const hasIdentity = eventName !== '' || pillText !== null

  return (
    <header className={styles.header}>
      <div className={styles.lockup}>
        <Mark size={22} zone="chrome" />
        <span className={styles.wordmark}>Top Table</span>
      </div>
      <div className={styles.divider} aria-hidden="true" />
      {hasIdentity && (
        <div className={styles.identity}>
          {eventName !== '' && <span className={styles.eventName}>{eventName}</span>}
          {pillText !== null && <span className={styles.scenarioPill}>{pillText}</span>}
        </div>
      )}
    </header>
  )
}
