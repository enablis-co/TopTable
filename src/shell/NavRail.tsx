import { cx } from '../ui'
import { useTopTableStore } from '../store/store'
import { TABS, TAB_LABELS, useNavigation } from './navigation'
import styles from './NavRail.module.css'

/**
 * The dark left rail: KB-1's three journey steps, Setup then Guests then Plan, and nothing
 * else — no Tables or Rules row (no such screens exist) and no Catering row (TT-25, out of
 * the MVP per KB-1). Moved out of AppHeader by TT-35 so the top bar can be identity-only.
 *
 * Same `aria-current="page"` pattern AppHeader used: these are links between sections, not
 * an ARIA tab widget, so there is no roving tabindex and no arrow-key handling.
 */
export function NavRail() {
  const { tab, goTo } = useNavigation()
  const guestCount = useTopTableStore((state) => state.guests.length)

  return (
    <nav aria-label="Sections" className={styles.rail}>
      <div className={styles.label}>Wedding</div>
      {TABS.map((t) => {
        const current = t === tab
        // Guests is the only row with a count: no Tables or Rules screen exists to count,
        // and Catering isn't built. Zero renders, it does not disappear (KB-6).
        const count = t === 'guests' ? guestCount : null

        return (
          <button
            key={t}
            type="button"
            aria-current={current ? 'page' : undefined}
            className={cx(styles.row, current && styles.rowCurrent)}
            onClick={() => {
              goTo(t)
            }}
          >
            <span className={styles.rowLabel}>
              {current && <span className={styles.dot} aria-hidden="true" />}
              {TAB_LABELS[t]}
            </span>
            {/* aria-hidden like the current-state dot above: the count is a supplementary
                readout, not part of the row's name, so the accessible name stays "Guests"
                rather than "Guests 70" — NavRail.test.tsx asserts the exact, unchanged name. */}
            {count !== null && (
              <span className={styles.count} aria-hidden="true">
                {count}
              </span>
            )}
          </button>
        )
      })}
    </nav>
  )
}
