import { useEffect, useRef, useState } from 'react'
import type { Guest } from '../../domain/types'
import { SCENARIOS, SCENARIO_IDS, scenarioById, scenarioSummary } from '../../domain/scenarios'
import type { ScenarioId } from '../../domain/scenarios'
import { loadScenarioGuests } from './scenarioSource'
import { Button, CardButton, Panel, tabularClass } from '../../ui'
import styles from './ScenarioPicker.module.css'

type ScenarioPickerProps = {
  /** Whether a guest list or a configured room already exists — gates the confirm prompt. */
  hasExistingData: boolean
  /** The guest count the confirm prompt warns it will replace. Not a scenario's own count. */
  currentGuestCount: number
  /** True only when this mount is the result of a "Change scenario" click. Read once, on mount. */
  autoFocusFirstCard: boolean
  onImport: (id: ScenarioId, guests: Guest[]) => void
}

type Flow =
  | { kind: 'idle' }
  | { kind: 'confirming'; id: ScenarioId }
  | { kind: 'loading'; id: ScenarioId }
  | { kind: 'failed'; id: ScenarioId }

/** KB-5: every number that updates gets the tabular-figure class, or it jitters as you type. */
function Num({ value }: { value: number }) {
  return <span className={tabularClass}>{value}</span>
}

/**
 * TT-4, KB-6's "Start from a scenario". Renders whenever SetupScreen decides the picker
 * should show — first visit, or after "Change scenario" brings it back (A12). No store
 * access of its own: this owns the import flow (local state, the one fetch) as view state,
 * and hands a completed result up through `onImport`.
 */
export function ScenarioPicker({
  hasExistingData,
  currentGuestCount,
  autoFocusFirstCard,
  onImport,
}: ScenarioPickerProps) {
  const [flow, setFlow] = useState<Flow>({ kind: 'idle' })
  const cardRefs = useRef<Partial<Record<ScenarioId, HTMLButtonElement | null>>>({})
  const confirmButtonRef = useRef<HTMLButtonElement | null>(null)
  const requestRef = useRef(0)

  function begin(id: ScenarioId) {
    setFlow({ kind: 'loading', id })
    const requestId = ++requestRef.current
    void loadScenarioGuests(id).then((guests) => {
      // A later request has started since this one began — its result decides, not this one.
      if (requestRef.current !== requestId) return

      if (guests) {
        onImport(id, guests)
        setFlow({ kind: 'idle' })
      } else {
        setFlow({ kind: 'failed', id })
      }
    })
  }

  function handleCardClick(id: ScenarioId) {
    // A load in flight owns the screen: ignore further card clicks rather than disabling the
    // cards, which would blur whichever one the user is standing on (see the focus effect).
    if (flow.kind === 'loading') return

    if (hasExistingData) {
      setFlow({ kind: 'confirming', id })
    } else {
      begin(id)
    }
  }

  function handleCancel(id: ScenarioId) {
    setFlow({ kind: 'idle' })
    cardRefs.current[id]?.focus()
  }

  // Reveal-side focus move (KB-6 C31): fires once, on mount, only when this mount is the
  // result of a "Change scenario" click — never on the first-visit mount. Empty dependency
  // array is load-bearing: SetupScreen mounts this component fresh on every reveal (A15), so
  // mount *is* the reveal, and `[autoFocusFirstCard]` would re-steal focus on an unrelated
  // re-render.
  useEffect(() => {
    if (!autoFocusFirstCard) return
    cardRefs.current[SCENARIO_IDS[0]]?.focus()
    // eslint-disable-next-line react-hooks/exhaustive-deps -- mount-time value only
  }, [])

  // Assumed A10: focus follows the decision. Opening the prompt puts focus on the primary
  // button; reaching a failure returns it to the card that was clicked. A cancel is handled
  // directly in handleCancel above, because the card is never unmounted so no re-render has
  // to land first.
  //
  // 'loading' is here for the window the plan did not consider. Both routes into a load
  // destroy the element the user was operating: via the prompt, activating "Load {name}"
  // unmounts the Panel holding it; and the cards used to take the real `disabled`
  // attribute, which browsers blur. Either way focus landed on <body> until the import
  // committed, so a keyboard user's next Tab restarted from the top of the document. The
  // invoking card survives the whole load now, so focus stays on it and C33 takes over at
  // the end. Dropping `disabled` in favour of aria-busy is what makes that possible; the
  // click guard above replaces what `disabled` was doing.
  useEffect(() => {
    if (flow.kind === 'confirming') {
      confirmButtonRef.current?.focus()
    } else if (flow.kind === 'loading' || flow.kind === 'failed') {
      cardRefs.current[flow.id]?.focus()
    }
  }, [flow])

  return (
    <section className={styles.section}>
      <h2>Start from a scenario</h2>
      <p className={styles.subtitle}>Loads a guest list and a matching room. Change anything after.</p>

      <ul className={styles.list}>
        {SCENARIOS.map((entry) => {
          const summary = scenarioSummary(entry)
          const isLoadingThis = flow.kind === 'loading' && flow.id === entry.id

          return (
            <li key={entry.id} className={styles.item}>
              <CardButton
                ref={(el) => {
                  cardRefs.current[entry.id] = el
                }}
                onClick={() => {
                  handleCardClick(entry.id)
                }}
                aria-busy={isLoadingThis || undefined}
              >
                <span className={styles.name}>{entry.name}</span>
                <span className={styles.detail}><Num value={entry.guestCount} /> guests</span>
                <span className={styles.detail}><Num value={entry.room.roundTables} /> tables of <Num value={entry.room.seatsEach} />, top table <Num value={entry.room.topTableSeats} /></span>
                <span className={styles.detail}>
                  {summary.spare === 0 ? (
                    <><Num value={summary.totalSeats} /> seats, none spare</>
                  ) : (
                    <><Num value={summary.totalSeats} /> seats, <Num value={summary.spare} /> spare</>
                  )}
                </span>
              </CardButton>
            </li>
          )
        })}
      </ul>

      {flow.kind === 'confirming' && (
        <Panel className={styles.confirm}>
          <p className={styles.confirmTitle}>Load {scenarioById(flow.id).name} over your current setup?</p>
          <p className={styles.confirmBody}>This replaces the <Num value={currentGuestCount} /> guests and the room you have now.</p>
          <div className={styles.confirmActions}>
            <Button
              variant="primary"
              ref={confirmButtonRef}
              onClick={() => {
                begin(flow.id)
              }}
            >
              Load {scenarioById(flow.id).name}
            </Button>
            <Button
              variant="quiet"
              onClick={() => {
                handleCancel(flow.id)
              }}
            >
              Cancel
            </Button>
          </div>
        </Panel>
      )}

      {flow.kind === 'loading' && <p className={styles.status}>Loading {scenarioById(flow.id).name}…</p>}

      {flow.kind === 'failed' && (
        <p className={styles.failure} role="alert" data-severity="hard">
          {scenarioById(flow.id).name} could not be loaded.
        </p>
      )}

      <p className={styles.divider}>or set it up yourself</p>
    </section>
  )
}
