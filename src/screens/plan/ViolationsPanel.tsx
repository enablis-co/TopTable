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
export function ViolationsPanel({ report }: ViolationsPanelProps) {
  const entries: Entry[] = [
    ...hardViolations(report).map((violation) => ({ violation, severity: 'hard' as const })),
    ...softViolations(report).map((violation) => ({ violation, severity: 'soft' as const })),
  ]

  return (
    <Panel title="Violations">
      <p>
        <span className={tabularClass}>{report.ruleCount}</span> {pluralWord(report.ruleCount, 'rule')} registered
      </p>
      {entries.length === 0 ? (
        <p>No violations. This plan satisfies every rule registered so far.</p>
      ) : (
        <ul className={styles.list}>
          {entries.map(({ violation, severity }, index) => (
            <li key={`${violation.ruleId}-${index}`} data-severity={severity}>
              <p>{violation.message}</p>
              <p>
                {severity === 'hard' ? 'Hard' : 'Soft'}
                {violation.detail ? ` · ${violation.detail}` : null}
              </p>
            </li>
          ))}
        </ul>
      )}
    </Panel>
  )
}
