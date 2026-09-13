import type { Ref } from 'react'
import { scenarioById } from '../../domain/scenarios'
import { capacityFor } from '../../domain/capacity'
import type { Guest, RoomConfig } from '../../domain/types'
import type { ScenarioState } from '../../store/store'
import { Button, tabularClass } from '../../ui'
import { normaliseRoom } from '../../domain/seating'
import { planTotals, type SeatingView } from './floorplan'
import styles from './PlanHeader.module.css'

/** TT-16. Bundled into one prop rather than five loose ones — PlanHeader already took five,
 *  and these five only make sense together. */
type ScoreStatProps = {
  /** `null` when no soft rule had an opportunity to be satisfied — never 0. */
  value: number | null
  expanded: boolean
  panelId: string
  onToggle: () => void
  toggleRef: Ref<HTMLButtonElement>
}

type PlanHeaderProps = {
  scenario: ScenarioState
  room: RoomConfig
  guests: Guest[]
  seating: SeatingView
  /** `plan.unseated.length` — the solver's own figure. Do not re-derive it from `seating`;
   * that produced two counts that could disagree. */
  unseatedCount: number
  score: ScoreStatProps
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

/** Every number here updates as the room or the guest list changes, so every one of them gets
 *  the tabular-figure class (KB-5) — otherwise the readout jitters as you type. */
function Num({ value }: { value: number }) {
  return <span className={tabularClass}>{value}</span>
}

/**
 * TT-16. A null score renders "Nothing to score", never a dash or a zero, which would read as a
 * real, low score. Expanded state is carried by `aria-expanded` and the caret's rotation, never
 * colour alone (KB-5). Name is from content, not `aria-label` — the `{' '}` boundary trap in this
 * file's headline comment below applies here too.
 */
function ScoreStat({ score }: { score: ScoreStatProps }) {
  // Destructured once: eslint's react-hooks/refs rule treats any object holding a Ref-typed field
  // as tainted as a whole, and flags every member access off it — not just toggleRef — as a ref
  // read during render.
  const { value, expanded, panelId, onToggle, toggleRef } = score

  if (value === null) {
    return <p className={styles.scoreAbsent}>Nothing to score</p>
  }

  return (
    <Button
      variant="quiet"
      ref={toggleRef}
      className={styles.scoreToggle}
      aria-expanded={expanded}
      aria-controls={expanded ? panelId : undefined}
      onClick={onToggle}
    >
      <span className={styles.statValue}>
        <Num value={value} />
      </span>{' '}
      <span className={styles.statLabel}>Fit</span>{' '}
      <span className="tt-visually-hidden">score breakdown</span>
      <span aria-hidden="true" className={styles.caret} />
    </Button>
  )
}

/**
 * TT-35, KB-6 "Plan". The canvas header: a capacity headline at `--t-figure-xl` (the largest
 * thing on the screen) plus a right-hand stat row — fit, then pinned, then unseated (TT-16
 * adds the first of those three; PlanScreen.tsx passes it as one bundled `score` prop).
 *
 * Reads `capacityFor` directly rather than reusing Setup's `CapacityReadout`, which answers a
 * different question — is the room configured well enough to proceed — and owns its own
 * incomplete-top-table branch, `data-state` border and suggestion line. `PlanScreen` only
 * mounts this once `showFloorplan` is already true, so none of that applies here.
 *
 * Every `font:` value below the headline/stat figures is applied to an *ancestor* of the
 * tabular-class span it sizes, never to the span itself — the `--t-figure-*` tokens are `font:`
 * shorthands, which reset `font-family` back to sans on any element they land on directly, and
 * an inherited value always loses to `.tt-num`'s own rule applied straight to its own span.
 */
export function PlanHeader({ scenario, room, guests, seating, unseatedCount, score }: PlanHeaderProps) {
  const label = scenarioLabel(scenario)
  const { guestCount, pinnedCount } = planTotals(guests, seating)
  // Normalised, matching PlanScreen's gate and FloorplanGrid's own generator (TT-11 review).
  const normalisedRoom = normaliseRoom(room)
  const { totalSeats, state, spare, shortfall } = capacityFor(normalisedRoom, guestCount)
  const { roundTables, seatsEach, topTableSeats } = normalisedRoom

  const hasTables = roundTables > 0
  const hasTopTable = topTableSeats > 0
  const hasBreakdown = hasTables || hasTopTable

  return (
    <div className={styles.header}>
      <div className={styles.capacity}>
        {label !== null && <p className={styles.scenario}>{label}</p>}
        {/* Plain inline flow, not flex: adjacent elements with nothing between them join with
            no space in the accessible name and in textContent alike (the same trap
            PlanTable.tsx's own top comment names) — a CSS gap only ever supplies visual
            spacing. The explicit {' '} below is what keeps "78 seats for 70 guests" readable
            as words rather than "78seats for70guests", and inline flow gives the baseline
            alignment the handoff asks for with no extra rule needed. */}
        <p className={styles.headline}>
          <span className={styles.figure}>
            <Num value={totalSeats} />
          </span>{' '}
          <span className={styles.word}>seats for</span>{' '}
          <span className={styles.figure}>
            <Num value={guestCount} />
          </span>{' '}
          <span className={styles.word}>guests</span>
        </p>
        <p className={styles.qualifier} data-state={state}>
          {state === 'slack' && (
            <>
              <Num value={spare} /> spare
            </>
          )}
          {state === 'exact' && 'Exactly enough'}
          {state === 'short' && (
            <>
              <Num value={shortfall} /> short
            </>
          )}
          {hasBreakdown && (
            <>
              {' · '}
              {hasTables && (
                <>
                  <Num value={roundTables} /> × <Num value={seatsEach} />
                </>
              )}
              {hasTables && hasTopTable && ', plus '}
              {hasTopTable && (
                <>
                  a top table of <Num value={topTableSeats} />
                </>
              )}
            </>
          )}
        </p>
      </div>
      <div className={styles.stats}>
        <ScoreStat score={score} />
        <div className={styles.stat}>
          <p className={styles.statValue}>
            <Num value={pinnedCount} />
          </p>
          <p className={styles.statLabel}>Pinned</p>
        </div>
        <div className={styles.stat}>
          <p className={styles.statValue}>
            <Num value={unseatedCount} />
          </p>
          <p className={styles.statLabel}>Unseated</p>
        </div>
      </div>
    </div>
  )
}
