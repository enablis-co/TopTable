import { scenarioById } from '../../domain/scenarios'
import { totalSeats } from '../../domain/capacity'
import type { Guest, RoomConfig } from '../../domain/types'
import type { ScenarioState } from '../../store/store'
import { tabularClass } from '../../ui'
import { normaliseRoom } from '../../domain/seating'
import { planTotals, type SeatingView } from './floorplan'
import styles from './PlanHeader.module.css'

type PlanHeaderProps = {
  scenario: ScenarioState
  room: RoomConfig
  guests: Guest[]
  seating: SeatingView
  /** `plan.unseated.length` — the solver's own figure. Do not re-derive it from `seating`;
   * that produced two counts that could disagree. */
  unseatedCount: number
}

/**
 * `null` for no scenario loaded, `'Custom'` once the room has been edited after an import.
 * Not shared with `ScenarioChip`'s own version: its "… loaded" suffix is wrong here.
 * `scenarioById` throws on an unrecognised id, so both non-id cases are handled before it runs.
 */
function scenarioLabel(scenario: ScenarioState): string | null {
  if (scenario === null) return null
  if (scenario === 'custom') return 'Custom'
  return scenarioById(scenario).name
}

/**
 * TT-11, KB-6 "Plan". Scenario (when loaded), guest count, seat count, pinned count, unseated
 * count, every figure tabular. Presentational — `PlanScreen` is the only file here that
 * touches the store.
 */
export function PlanHeader({ scenario, room, guests, seating, unseatedCount }: PlanHeaderProps) {
  const label = scenarioLabel(scenario)
  const { guestCount, pinnedCount } = planTotals(guests, seating)
  // Normalised, matching PlanScreen's gate and FloorplanGrid's own generator.
  const seats = totalSeats(normaliseRoom(room))

  return (
    <p className={styles.line}>
      {label !== null && `${label} · `}
      <span className={tabularClass}>{guestCount}</span> guests
      {' · '}
      <span className={tabularClass}>{seats}</span> seats
      {' · '}
      <span className={tabularClass}>{pinnedCount}</span> pinned
      {' · '}
      <span className={tabularClass}>{unseatedCount}</span> unseated
    </p>
  )
}
