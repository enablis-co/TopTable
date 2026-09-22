import type { RuleCoverage } from '../../domain/rules/ruleCoverage'
import { tabularClass } from '../../ui'
import styles from './RuleCoverageLine.module.css'

type RuleCoverageLineProps = {
  coverage: RuleCoverage
  scored: boolean
}

/**
 * TT-53. Qualifies the Fit figure with how much of KB-2 has actually been built — "4 of 10 rules
 * built".
 *
 * The verb is load-bearing and the trap is that a measuring one would be false: `scorePlan` drops
 * every rule the guest list gave no chances from the mean (KB-8), so a plan with no partner pairs
 * and no protocol-role holders scores over two of the four registered rules, not four. This line
 * counts what exists, never what the figure was weighed over — the score breakdown is where the
 * latter is visible, one click away, and a claim here that contradicted it would reproduce the
 * overstatement TT-53 was raised to fix. Guarded by the exact-string tests in
 * RuleCoverageLine.test.tsx.
 *
 * One predicate covers all three states that render nothing: no score to qualify, nothing left to
 * discount once the registry has caught up with the declared count, and a declared count the
 * registry has outgrown — neither of the last two has anything honest left to print.
 */
export function RuleCoverageLine({ coverage, scored }: RuleCoverageLineProps) {
  if (!scored || coverage.registered >= coverage.declared) return null

  return (
    <p className={styles.coverage}>
      {/* Every {' '} below is load-bearing, exactly as PlanHeader.tsx's own .headline and
          StatToggle comments record: adjacent JSX elements with nothing between them join with
          no space in textContent and in the computed accessible name alike, and a CSS gap only
          ever supplies visual spacing. Without these the string reads "4of10rules built". */}
      <span className={tabularClass}>{coverage.registered}</span>{' '}
      of{' '}
      <span className={tabularClass}>{coverage.declared}</span>{' '}
      rules built
    </p>
  )
}
