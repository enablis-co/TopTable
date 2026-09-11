import { useEffect, useMemo, useRef, useState } from 'react'
import { flushSync } from 'react-dom'
import { useTopTableStore } from '../../store/store'
import { useNavigation } from '../../shell/navigation'
import { totalSeats } from '../../domain/capacity'
import { pinnedTableFor } from '../../domain/pins'
import { normaliseRoom, seatPins, tablesInRoom } from '../../domain/seating'
import { allocate } from '../../domain/allocate'
import { seatingViewFrom } from './floorplan'
import { PlanHeader } from './PlanHeader'
import { FloorplanGrid } from './FloorplanGrid'
import { PlanEmpty } from './PlanEmpty'
import { UnseatedRail } from './UnseatedRail'
import { Button } from '../../ui'
import styles from './PlanScreen.module.css'

/**
 * TT-11, TT-12, TT-13, KB-6 "Plan". Owns every store read and write for this screen; PlanHeader,
 * FloorplanGrid, UnseatedRail and PlanEmpty stay presentational. The plan itself is always
 * derived — from the room, the guests and the pins, plus the solver once `allocated` is true —
 * and never stored (docs/state.md).
 *
 * `allocated`/`setAllocated` arrive as props rather than local state: `App`'s `CurrentScreen`
 * unmounts this component on every tab switch, so state kept here was losing the allocation the
 * moment someone left for Guests and came back. The flag now lives in `App`, above that unmount,
 * and survives it; re-allocating is deterministic, so remounting and recomputing from the same
 * room, guests and pins reproduces the same plan. Two columns, not three: KB-6's third column,
 * the violations panel, is TT-14's, and the numbered seats in its table detail are TT-15's.
 */
type PlanScreenProps = {
  allocated: boolean
  setAllocated: (allocated: boolean) => void
}

export function PlanScreen({ allocated, setAllocated }: PlanScreenProps) {
  const room = useTopTableStore((s) => s.room)
  const guests = useTopTableStore((s) => s.guests)
  const scenario = useTopTableStore((s) => s.scenario)
  const pins = useTopTableStore((s) => s.pins)
  const pinGuest = useTopTableStore((s) => s.pinGuest)
  const unpinGuest = useTopTableStore((s) => s.unpinGuest)
  const { goTo } = useNavigation()

  const [selectedGuestId, setSelectedGuestId] = useState<string | null>(null)
  const [announcement, setAnnouncement] = useState('')

  const railRef = useRef<HTMLDivElement>(null)
  const railHeadingRef = useRef<HTMLHeadingElement>(null)

  // Normalised first, matching FloorplanGrid's own generator — see normaliseRoom in ../../domain/seating.
  const hasSeats = totalSeats(normaliseRoom(room)) > 0
  const slots = tablesInRoom(room)
  const plan = useMemo(
    () => (allocated ? allocate(room, guests, pins) : seatPins(room, guests, pins)),
    [allocated, room, guests, pins],
  )
  const seating = useMemo(() => seatingViewFrom(plan), [plan])
  const selectedGuest = guests.find((guest) => guest.id === selectedGuestId) ?? null

  // Active only while a guest is selected — GuestRowMenu's own listen/cleanup pattern.
  useEffect(() => {
    if (selectedGuestId === null) return

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        setSelectedGuestId(null)
        setAnnouncement('Selection cleared')
      }
    }

    document.addEventListener('keydown', handleKeyDown)
    return () => {
      document.removeEventListener('keydown', handleKeyDown)
    }
  }, [selectedGuestId])

  // The rail's own buttons, current as of the last commit. Reads railRef rather than closing
  // over unseated, so a caller wrapping its state updates in flushSync first is guaranteed
  // this sees the post-update DOM rather than the render that was current when it was called.
  function railButtons(): HTMLButtonElement[] {
    return Array.from(railRef.current?.querySelectorAll<HTMLButtonElement>('[data-guest-id]') ?? [])
  }

  function handleSelect(guestId: string) {
    setSelectedGuestId((current) => (current === guestId ? null : guestId))
  }

  function handlePlace(tableId: string) {
    if (selectedGuest === null) return

    const tableLabel = slots.find((slot) => slot.id === tableId)?.label ?? tableId
    const guestName = selectedGuest.name
    // flushSync, not an effect: the row being focused next unmounts as part of this same
    // update (the placed guest leaves the rail), so focus has to move only once the DOM
    // reflects that — synchronously, or the moment in between would drop focus to <body>.
    flushSync(() => {
      pinGuest(selectedGuest.id, tableId)
      setSelectedGuestId(null)
      setAnnouncement(`${guestName} placed at ${tableLabel}`)
    })
    const firstRemaining = railButtons()[0]
    if (firstRemaining) {
      firstRemaining.focus()
    } else {
      railHeadingRef.current?.focus()
    }
  }

  function handleRelease(guestId: string) {
    const guest = guests.find((candidate) => candidate.id === guestId)
    const tableId = pinnedTableFor(pins, guestId)
    const tableLabel = tableId === null ? null : slots.find((slot) => slot.id === tableId)?.label
    flushSync(() => {
      unpinGuest(guestId)
      setAnnouncement(`${guest?.name ?? 'Guest'} released from ${tableLabel ?? 'their table'}`)
    })
    const reappeared = railButtons().find((button) => button.dataset.guestId === guestId)
    reappeared?.focus()
  }

  function handleAllocate() {
    // setAllocated(true) leaves this render's own `plan` pointed at the pre-click seating —
    // that closure doesn't update until the next render, and flushSync can't change that, only
    // when the DOM catches up. A second, throwaway solver run is what the announcement can
    // trust; see the PlanScreen test asserting the announced figures are the post-click ones.
    const justAllocated = allocate(room, guests, pins)
    const seatedCount = guests.length - justAllocated.unseated.length
    setAllocated(true)
    setSelectedGuestId(null)
    setAnnouncement(`Allocated. ${seatedCount} seated, ${justAllocated.unseated.length} unseated.`)
  }

  return (
    <div>
      <h1 className="tt-visually-hidden">Plan</h1>
      {hasSeats ? (
        <>
          <div className={styles.actions}>
            <Button variant="primary" onClick={handleAllocate}>
              Auto-allocate
            </Button>
          </div>
          <PlanHeader
            scenario={scenario}
            room={room}
            guests={guests}
            seating={seating}
            unseatedCount={plan.unseated.length}
          />
          <div className={styles.screen}>
            <div ref={railRef}>
              <UnseatedRail
                guests={plan.unseated}
                selectedGuestId={selectedGuestId}
                onSelect={handleSelect}
                headingRef={railHeadingRef}
              />
            </div>
            <FloorplanGrid
              room={room}
              seating={seating}
              placingGuestName={selectedGuest?.name}
              onPlace={handlePlace}
              onRelease={handleRelease}
            />
          </div>
          <p role="status" className="tt-visually-hidden">
            {announcement}
          </p>
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
