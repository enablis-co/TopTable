import { useId } from 'react'
import { REGISTERED_RULES } from '../../domain/rules/registry'
import type { SeatingRule, Severity } from '../../domain/rules/contract'
import styles from './RulesApplied.module.css'

/**
 * Hard before Soft. `Record<Severity, string>` is what makes this exhaustive — a third severity
 * fails typecheck at this literal rather than rendering nothing, the same guard `contract.ts`
 * reaches for — and the display order is read back off these keys rather than written out a
 * second time, so the two cannot disagree.
 */
const SEVERITY_LABEL: Record<Severity, string> = { hard: 'Hard', soft: 'Soft' }
const SEVERITY_ORDER = Object.keys(SEVERITY_LABEL) as Severity[]

/** Grouped by severity, rule id ascending within a group. Render order is `SEVERITY_ORDER`'s, so
 *  this only has to sort within a group. */
function rulesBySeverity(): Map<Severity, SeatingRule[]> {
  const groups = new Map<Severity, SeatingRule[]>()
  const byId = [...REGISTERED_RULES].sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0))

  for (const rule of byId) {
    const group = groups.get(rule.severity) ?? []
    group.push(rule)
    groups.set(rule.severity, group)
  }

  return groups
}

/**
 * TT-53. Reads `REGISTERED_RULES` directly — the same registry `ViolationsPanel`'s "N rules
 * registered" line counts — so a new `*.rule.ts` file joins this list with no edit here, the
 * discovery property `registry.ts` and TT-14 exist to protect.
 *
 * No `data-severity` here, unlike the violation entries above: `ViolationsPanel.module.css`
 * styles `[data-severity='hard']` and `[data-severity='soft']` as bare attribute selectors, which
 * CSS Modules does not scope, so reusing that attribute would paint an unviolated rule with the
 * violation left-bar and wash. Severity is carried by the group heading word alone (KB-5).
 *
 * The groups keep their markers (`list-style: disc`), so no explicit `role="list"` is needed —
 * that workaround exists for the `list-style: none` lists elsewhere in this folder, which WebKit
 * takes as licence to strip list semantics.
 */
export function RulesApplied() {
  const groups = rulesBySeverity()
  const headingId = useId()

  return (
    <section className={styles.rulesApplied} aria-labelledby={headingId}>
      <h3 id={headingId} className={styles.heading}>
        Rules applied
      </h3>
      {SEVERITY_ORDER.map((severity) => {
        const rules = groups.get(severity)
        if (!rules || rules.length === 0) return null
        const groupHeadingId = `${headingId}-${severity}`

        return (
          <div key={severity} className={styles.group}>
            <h4 id={groupHeadingId} className={styles.groupHeading}>
              {SEVERITY_LABEL[severity]}
            </h4>
            <ul aria-labelledby={groupHeadingId} className={styles.items}>
              {rules.map((rule) => (
                <li key={rule.id} className={styles.item}>
                  {rule.description}
                </li>
              ))}
            </ul>
          </div>
        )
      })}
    </section>
  )
}
