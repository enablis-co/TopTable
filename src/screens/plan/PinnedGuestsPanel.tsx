import type { PinnedGuestRow } from './pinnedGuests'
import { Button, Panel } from '../../ui'
import styles from './PinnedGuestsPanel.module.css'

type PinnedGuestsPanelProps = {
  id: string
  rows: readonly PinnedGuestRow[]
  onDismiss: () => void
}

function DismissButton({ onDismiss }: { onDismiss: () => void }) {
  return (
    <Button variant="quiet" className={styles.dismiss} onClick={onDismiss}>
      <span aria-hidden="true">×</span> <span className="tt-visually-hidden">Close pinned guests</span>
    </Button>
  )
}

/** The guest's name, then the table their pin names — "Table 8 · over capacity" when the pin
 *  outran that table's seats. Read-only, so `<p>` rather than the toggle's `<span>` rule. */
function PinnedRow({ row }: { row: PinnedGuestRow }) {
  return (
    <li className={styles.row}>
      <p className={styles.name}>{row.guestName}</p>
      <p className={styles.table}>
        {row.tableLabel}
        {row.overCapacity && ' · over capacity'}
      </p>
    </li>
  )
}

/**
 * TT-16, KB-6 "Plan". Presentational, matching `TableDetailPanel` and `ScoreBreakdownPanel`'s
 * contract — no store read of its own. No release control here: TT-15's table detail panel
 * owns releasing. No empty-list branch: `PlanScreen` mounts this only when there is at least
 * one pinned guest, and returns the column to violations the moment that count reaches zero.
 */
export function PinnedGuestsPanel({ id, rows, onDismiss }: PinnedGuestsPanelProps) {
  return (
    <div id={id} className={styles.wrapper}>
      <Panel title="Pinned guests" actions={<DismissButton onDismiss={onDismiss} />} className={styles.body}>
        <p className={styles.subtitle}>Pinned guests keep their table when the room is auto-allocated.</p>
        <ol className={styles.list}>
          {rows.map((row) => (
            <PinnedRow key={row.guestId} row={row} />
          ))}
        </ol>
      </Panel>
    </div>
  )
}
