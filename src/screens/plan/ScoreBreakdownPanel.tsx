import type { ScoreDimension } from '../../domain/rules/score'
import { Button, Panel, tabularClass } from '../../ui'
import styles from './ScoreBreakdownPanel.module.css'

type ScoreBreakdownPanelProps = {
  id: string
  dimensions: readonly ScoreDimension[]
  onDismiss: () => void
}

function DismissButton({ onDismiss }: { onDismiss: () => void }) {
  return (
    <Button variant="quiet" className={styles.dismiss} onClick={onDismiss}>
      <span aria-hidden="true">×</span> <span className="tt-visually-hidden">Close score breakdown</span>
    </Button>
  )
}

/**
 * One dimension: the rule's own `description` as its label — no map of rule ids to labels
 * exists anywhere, so a `*.rule.ts` file added to the folder reaches this row with its label
 * through the glob alone — then its figures.
 *
 * TT-16's no-cap decision (score.ts) relies on this row to make a finding behind a rounded
 * headline visible: the missed count is the exact, unrounded fact and is always rendered, even
 * when the dimension's own fit rounds to 100% — "100% · 1 of 200 missed" is a real line this
 * renders. Do not "fix" that apparent contradiction; a dimension that rounds to 100% is not the
 * same as one with nothing missed, and this line is where the difference is visible.
 */
function DimensionRow({ dimension }: { dimension: ScoreDimension }) {
  const percent = Math.round(dimension.fit * 100)

  return (
    <li className={styles.row}>
      <p className={styles.rule}>{dimension.description}</p>
      <p className={styles.figures}>
        <span className={tabularClass}>{percent}</span>
        {'% · '}
        <span className={tabularClass}>{dimension.missed}</span>
        {' of '}
        <span className={tabularClass}>{dimension.opportunities}</span>
        {' missed'}
        {dimension.weight !== 1 && (
          <>
            {' · counts ×'}
            <span className={tabularClass}>{dimension.weight}</span>
          </>
        )}
      </p>
    </li>
  )
}

/**
 * TT-16, KB-6 "Plan". `dimensions` arrives already worst-first from `scorePlan` — this component
 * does no sorting and no arithmetic beyond rounding a fit to a percentage. No `--hard`/`--soft`
 * colour or dashed border on a row: a dimension at 100% is not a violation
 * (`ViolationsPanel.module.css` records the same one-shape-one-meaning rule). No empty-state
 * branch: `PlanScreen` mounts this only when the score is non-null, which implies at least one
 * dimension.
 */
export function ScoreBreakdownPanel({ id, dimensions, onDismiss }: ScoreBreakdownPanelProps) {
  return (
    <div id={id} className={styles.wrapper}>
      <Panel title="Score breakdown" actions={<DismissButton onDismiss={onDismiss} />} className={styles.body}>
        <p className={styles.subtitle}>Soft rules only. Hard violations do not move it.</p>
        <ol className={styles.list}>
          {dimensions.map((dimension) => (
            <DimensionRow key={dimension.ruleId} dimension={dimension} />
          ))}
        </ol>
      </Panel>
    </div>
  )
}
