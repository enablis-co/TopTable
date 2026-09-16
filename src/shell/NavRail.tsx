import { cx } from '../ui'
import { useTopTableStore } from '../store/store'
import { appVersion } from './appVersion'
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
  const version = appVersion()

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
      {/* Outside the TABS.map above and not a <button>, so it is not focusable and is not
          inside a nav row — the three rows' accessible names stay exactly "Setup", "Guests",
          "Plan" and NavRail.test.tsx passes untouched. No aria-hidden here, unlike the
          current-state dot and the guest count on the rows above: those are supplementary
          readouts next to a row's own name, but the version has no other name to hide behind
          and is the first thing anyone reporting a defect will be asked for. The inner <span>
          gives the value its own text node, separate from the visually-hidden prefix, so the
          visible and accessible text is exactly the version string — don't inline the two, or
          a tidy-up will break the exact-text query this stamp is matched on. */}
      {version !== null && (
        <p className={styles.version}>
          <span className="tt-visually-hidden">Version </span>
          <span>{version}</span>
        </p>
      )}
    </nav>
  )
}
