import { scenarioById } from '../../domain/scenarios'
import { totalSeats } from '../../domain/capacity'
import type { Guest, RoomConfig } from '../../domain/types'
import type { ScenarioState } from '../../store/store'
import { tabularClass } from '../../ui'
import { normaliseRoom, planTotals, type SeatingView } from './floorplan'
import styles from './PlanHeader.module.css'

type PlanHeaderProps = {
  scenario: ScenarioState
  room: RoomConfig
  guests: Guest[]
  seating: SeatingView
}

/**
 * `null` for no scenario loaded, `'Custom'` once the room has been edited after an import
 * (A7) — mirrors `ScenarioChip`'s own behaviour rather than sharing it: that chip's "…
 * loaded" suffix is wrong for this plain text line, so the one ternary is duplicated
 * deliberately instead of extracting a shared helper for no behavioural gain. `scenarioById`
 * throws on an unrecognised id and is typed to take only a `ScenarioId`, so both non-id
 * cases (`null`, `'custom'`) are handled before it is ever called.
 */
function scenarioLabel(scenario: ScenarioState): string | null {
  if (scenario === null) return null
  if (scenario === 'custom') return 'Custom'
  return scenarioById(scenario).name
}

/**
 * TT-11, C5, KB-6 "Plan". One line: scenario (when loaded), guest count, seat count, pinned
 * count, unseated count — every figure in `tabularClass` (C9), since this line changes as
 * TT-12 and TT-13 land and jitters without it. Presentational: `PlanScreen` is the only file
 * in this folder that touches the store.
 */
export function PlanHeader({ scenario, room, guests, seating }: PlanHeaderProps) {
  const label = scenarioLabel(scenario)
  const { guestCount, pinnedCount, unseatedCount } = planTotals(guests, seating)
  // normaliseRoom first, matching PlanScreen's gate and FloorplanGrid's own generator — this
  // is the same room prop and the same possibly-un-normalised storage, so this figure must
  // not tell a different story from the grid rendered underneath it.
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
