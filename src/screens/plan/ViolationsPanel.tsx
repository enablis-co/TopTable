import type { Violation } from '../../domain/rules/contract'
import { hardViolations, softViolations, type RuleReport } from '../../domain/rules/engine'
import { Panel, tabularClass } from '../../ui'
import styles from './ViolationsPanel.module.css'

type ViolationsPanelProps = {
  report: RuleReport
}

type Entry = { violation: Violation; severity: 'hard' | 'soft' }

// Local to this file, matching SuggestionLine.tsx's own note: a shared text primitive added
// here would be inherited by every later screen before anything needs that.
function pluralWord(count: number, singular: string): string {
  return count === 1 ? singular : `${singular}s`
}

/**
 * TT-14, KB-6 "Plan" third column. `entries` is built from `hardViolations`/`softViolations`,
 * never `report.violations` directly, so a finding's severity always comes from which of those
 * two arrays produced it — one definition of "which violations are hard" (`engine.ts`), never a
 * second read of `violation.severity` in this file.
 *
 * TT-14 supersedes KB-5 here: KB-5 draws soft the same as hard, solid, just amber; the product
 * owner ruled shape must differ too, so soft is dotted rather than solid — dotted, not dashed,
 * because dashed is already the table-in-violation idiom (`PlanTable.module.css`) and one shape
 * must not mean two things.
 */

/**
 * TT-35. No publish control exists yet (TT-34), so this states what is true of the plan itself
 * and never implies one — the handoff's own "stops this plan publishing" does not appear here.
 * Hard is checked first regardless of how many soft violations also exist: a single hard
 * violation needing fixing is the whole story for this line. Soft-only reads as "nothing
 * blocking" rather than repeating the per-violation list a second time. A genuinely clean plan
 * says so in words, never a tick — KB-5 rules out a colour for this entirely.
 */
function Footer({ hardCount, softCount }: { hardCount: number; softCount: number }) {
  if (hardCount > 0) {
    return (
      <p className={styles.footer}>
        {hardCount === 1 ? (
          'One hard violation needs fixing.'
        ) : (
          <>
            <span className={tabularClass}>{hardCount}</span> hard violations need fixing.
          </>
        )}
      </p>
    )
  }
  if (softCount > 0) {
    return <p className={styles.footer}>Nothing is blocking this plan.</p>
  }
  return <p className={styles.footer}>No violations.</p>
}

export function ViolationsPanel({ report }: ViolationsPanelProps) {
  const hard = hardViolations(report)
  const soft = softViolations(report)
  const entries: Entry[] = [
    ...hard.map((violation) => ({ violation, severity: 'hard' as const })),
    ...soft.map((violation) => ({ violation, severity: 'soft' as const })),
  ]

  return (
    <Panel title="Violations">
      <p>
        <span className={tabularClass}>{report.ruleCount}</span> {pluralWord(report.ruleCount, 'rule')} registered
      </p>
      {entries.length > 0 && (
        <ul className={styles.list}>
          {entries.map(({ violation, severity }, index) => (
            <li key={`${violation.ruleId}-${index}`} data-severity={severity}>
              <p className={styles.title}>{violation.message}</p>
              <p className={styles.meta}>
                {severity === 'hard' ? 'Hard' : 'Soft'}
                {violation.detail ? ` · ${violation.detail}` : null}
              </p>
            </li>
          ))}
        </ul>
      )}
      <Footer hardCount={hard.length} softCount={soft.length} />
    </Panel>
  )
}
