import { useTopTableStore } from '../../store/store'
import { useNavigation } from '../../shell/navigation'
import { totalSeats } from '../../domain/capacity'
import { NOTHING_SEATED, normaliseRoom } from './floorplan'
import { PlanHeader } from './PlanHeader'
import { FloorplanGrid } from './FloorplanGrid'
import { PlanEmpty } from './PlanEmpty'
import styles from './PlanScreen.module.css'

/**
 * TT-11, KB-6 "Plan". Owns every store read for this screen — PlanHeader, Floorplan,
 * PlanTable and PlanEmpty are all presentational, mirroring GuestsScreen's and SetupScreen's
 * own ownership pattern. Reads room, guests and scenario with three separate selectors, and
 * writes nothing: pinning, the seating model and violations are TT-12, TT-13 and TT-14, and
 * none of that state exists in the store yet (C6). `src/store/store.ts` and
 * `src/domain/guests.ts` are unchanged by this ticket.
 *
 * One column, not three (R6). KB-6 draws an unseated rail and a violations panel either side
 * of the floorplan, but those belong to the tickets that own the state they would show —
 * stubbing two empty gutters here would look broken today, not future-proofed.
 */
export function PlanScreen() {
  const room = useTopTableStore((s) => s.room)
  const guests = useTopTableStore((s) => s.guests)
  const scenario = useTopTableStore((s) => s.scenario)
  const { goTo } = useNavigation()

  // normaliseRoom before totalSeats, not totalSeats(room) directly: FloorplanGrid generates
  // its grid from the normalised room (via floorplanFromRoom), so the gate has to agree with
  // it on the same, single normalisation — otherwise a hand-edited, un-trusted room (a
  // negative roundTables from storage, say) can total 0 seats raw while genuinely having a
  // top table once normalised, hiding real seats behind this invitation. See normaliseRoom's
  // own comment in ./floorplan for the exact reviewer-found case.
  const hasSeats = totalSeats(normaliseRoom(room)) > 0

  return (
    <div className={styles.screen}>
      <h1 className="tt-visually-hidden">Plan</h1>
      {hasSeats ? (
        <>
          {/*
            NOTHING_SEATED, on both children below: nothing can be seated before TT-12 gives
            a guest a pin, TT-13 gives the plan a seating model, and TT-14 gives a table a
            violation. This is what TT-11 has to render in the meantime, not a stub for
            whoever picks up one of those tickets to delete.
          */}
          <PlanHeader scenario={scenario} room={room} guests={guests} seating={NOTHING_SEATED} />
          <FloorplanGrid room={room} seating={NOTHING_SEATED} />
        </>
      ) : (
        <PlanEmpty
          onGoToScenarios={() => {
            goTo('setup')
          }}
        />
      )}
    </div>
  )
}
