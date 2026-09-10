import { useTopTableStore } from '../../store/store'
import { useNavigation } from '../../shell/navigation'
import { totalSeats } from '../../domain/capacity'
import { NOTHING_SEATED, normaliseRoom } from './floorplan'
import { PlanHeader } from './PlanHeader'
import { FloorplanGrid } from './FloorplanGrid'
import { PlanEmpty } from './PlanEmpty'
import styles from './PlanScreen.module.css'

/**
 * TT-11, KB-6 "Plan". Owns every store read for this screen; PlanHeader, FloorplanGrid and
 * PlanEmpty are presentational and write nothing — pinning, the seating model and violations
 * are TT-12 to TT-14, and none of that state exists in the store yet. One column, not three:
 * KB-6's unseated rail and violations panel belong to the tickets that own that state.
 */
export function PlanScreen() {
  const room = useTopTableStore((s) => s.room)
  const guests = useTopTableStore((s) => s.guests)
  const scenario = useTopTableStore((s) => s.scenario)
  const { goTo } = useNavigation()

  // Normalised first, matching FloorplanGrid's own generator — see normaliseRoom in ./floorplan.
  const hasSeats = totalSeats(normaliseRoom(room)) > 0

  return (
    <div className={styles.screen}>
      <h1 className="tt-visually-hidden">Plan</h1>
      {hasSeats ? (
        <>
          {/* NOTHING_SEATED: nothing can be seated before TT-12/13/14 land. Not a stub to delete. */}
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
