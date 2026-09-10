import { useEffect, useRef, useState } from 'react'
import { flushSync } from 'react-dom'
import { useTopTableStore } from '../../store/store'
import { useNavigation } from '../../shell/navigation'
import { totalSeats } from '../../domain/capacity'
import { pinnedTableFor } from '../../domain/pins'
import { floorplanFromRoom, normaliseRoom, seatingFromPins, unseatedGuests } from './floorplan'
import { PlanHeader } from './PlanHeader'
import { FloorplanGrid } from './FloorplanGrid'
import { PlanEmpty } from './PlanEmpty'
import { UnseatedRail } from './UnseatedRail'
import styles from './PlanScreen.module.css'

/**
 * TT-11, TT-12, KB-6 "Plan". Owns every store read and write for this screen; PlanHeader,
 * FloorplanGrid, UnseatedRail and PlanEmpty are presentational and write nothing themselves.
 * Placing pins a guest at a table — the seating model beyond one pin per guest is still
 * TT-13's, and violations are still TT-14's. Two columns, not three: KB-6's third, the
 * violations panel, belongs to TT-14.
 */
export function PlanScreen() {
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

  // Normalised first, matching FloorplanGrid's own generator — see normaliseRoom in ./floorplan.
  const hasSeats = totalSeats(normaliseRoom(room)) > 0
  const slots = floorplanFromRoom(room)
  const seating = seatingFromPins(slots, guests, pins)
  const unseated = unseatedGuests(guests, seating)
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

  return (
    <div>
      <h1 className="tt-visually-hidden">Plan</h1>
      {hasSeats ? (
        <>
          <PlanHeader scenario={scenario} room={room} guests={guests} seating={seating} />
          <div className={styles.screen}>
            <div ref={railRef}>
              <UnseatedRail
                guests={unseated}
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
