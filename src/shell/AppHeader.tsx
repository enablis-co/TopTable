import { Mark, cx } from '../ui'
import { TABS, TAB_LABELS, useNavigation } from './navigation'
import styles from './AppHeader.module.css'

/**
 * Present on every section: the mark, the wordmark, and the three section controls, in
 * journey order (KB-1). Nothing else — no export, print, share or account control (E3).
 *
 * The three controls are a `<nav>` with `aria-current`, not the ARIA tab-widget pattern:
 * they navigate between sections rather than switching panels within one, so there is no
 * roving tabindex and no arrow-key handling.
 */
export function AppHeader() {
  const { tab, goTo } = useNavigation()

  return (
    <header className={styles.header}>
      <div className={styles.lockup}>
        <Mark size={24} />
        <span className={styles.wordmark}>Top Table</span>
      </div>
      <nav aria-label="Sections" className={styles.nav}>
        {TABS.map((t) => {
          const current = t === tab
          return (
            <button
              key={t}
              type="button"
              aria-current={current ? 'page' : undefined}
              className={cx(styles.tab, current && styles.tabCurrent)}
              onClick={() => {
                goTo(t)
              }}
            >
              {TAB_LABELS[t]}
            </button>
          )
        })}
      </nav>
    </header>
  )
}
