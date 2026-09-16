import type { ReactNode, Ref } from 'react'
import { scenarioById } from '../../domain/scenarios'
import { capacityFor } from '../../domain/capacity'
import type { Guest, RoomConfig } from '../../domain/types'
import type { ScenarioState } from '../../store/store'
import { Button, tabularClass } from '../../ui'
import { normaliseRoom } from '../../domain/seating'
import { planTotals, type SeatingView } from './floorplan'
import styles from './PlanHeader.module.css'

/** TT-16. What every interactive header stat needs to wire its own toggle — bundled so a stat's
 *  props only ever travel together, the way `PlanHeader`'s own five props stopped being worth
 *  passing loose once there were five of them. */
type StatPanelProps = {
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
  score: StatPanelProps & { value: number | null }
  pinned: StatPanelProps
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

type StatToggleProps = StatPanelProps & {
  value: ReactNode
  label: string
  hiddenSuffix: string
}

/**
 * TT-16. The one control behind both interactive stats — score and Pinned — so the invented
 * hover/expanded pattern exists in exactly one place. `<span>` children only, never `<p>` — a
 * button element admits phrasing content only. The `{' '}` boundaries are load-bearing —
 * name-from-content trims each child before joining, so a bare CSS gap would drop the space and
 * the name would read "71%Fitscore breakdown". Expanded state is carried by `aria-expanded` and
 * a background-plus-border-rule step, never colour alone (KB-5): the border rule is what tells
 * expanded apart from hovered, since both share the same `--sunken` background.
 */
function StatToggle(props: StatToggleProps) {
  // Destructured once: eslint's react-hooks/refs rule treats any object holding a Ref-typed
  // field as tainted as a whole, and flags every member access off it — not just toggleRef — as
  // a ref read during render.
  const { expanded, panelId, onToggle, toggleRef, value, label, hiddenSuffix } = props

  return (
    <Button
      variant="quiet"
      ref={toggleRef}
      className={styles.statToggle}
      aria-expanded={expanded}
      aria-controls={expanded ? panelId : undefined}
      onClick={onToggle}
    >
      <span className={styles.statValue}>{value}</span>{' '}
      <span className={styles.statLabel}>{label}</span>{' '}
      <span className="tt-visually-hidden">{hiddenSuffix}</span>
    </Button>
  )
}

/**
 * TT-16. A null score renders "Nothing to score", never a dash or a zero, which would read as a
 * real, low score — and no control, since there is nothing to open. Otherwise a `StatToggle`
 * with the `%` sign outside the tabular span: only the digits are tabular figures.
 */
function ScoreStat({ score }: { score: PlanHeaderProps['score'] }) {
  const { value, expanded, panelId, onToggle, toggleRef } = score

  if (value === null) {
    return <p className={styles.scoreAbsent}>Nothing to score</p>
  }

  return (
    <StatToggle
      expanded={expanded}
      panelId={panelId}
      onToggle={onToggle}
      toggleRef={toggleRef}
      value={
        <>
          <Num value={value} />%
        </>
      }
      label="Fit"
      hiddenSuffix="score breakdown"
    />
  )
}

/**
 * TT-16. At zero pinned this is today's inert markup verbatim — no dead control, matching
 * `ScoreStat`'s own rule for a value with nothing to open. With one or more pinned it is a
 * `StatToggle` opening the pinned-guests panel.
 */
function PinnedStat({ pinnedCount, pinned }: { pinnedCount: number; pinned: StatPanelProps }) {
  const { expanded, panelId, onToggle, toggleRef } = pinned

  if (pinnedCount === 0) {
    return (
      <div className={styles.stat}>
        <p className={styles.statValue}>
          <Num value={pinnedCount} />
        </p>
        <p className={styles.statLabel}>Pinned</p>
      </div>
    )
  }

  return (
    <StatToggle
      expanded={expanded}
      panelId={panelId}
      onToggle={onToggle}
      toggleRef={toggleRef}
      value={<Num value={pinnedCount} />}
      label="Pinned"
      hiddenSuffix="guests"
    />
  )
}

/**
 * TT-35, KB-6 "Plan". The canvas header: a capacity headline at `--t-figure-xl` (the largest
 * thing on the screen) plus a right-hand stat row — fit, then pinned, then unseated (TT-16 adds
 * the first two as toggles; `PlanScreen.tsx` passes their wiring as the `score` and `pinned`
 * props).
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
export function PlanHeader({ scenario, room, guests, seating, unseatedCount, score, pinned }: PlanHeaderProps) {
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
        <PinnedStat pinnedCount={pinnedCount} pinned={pinned} />
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
