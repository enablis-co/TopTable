import { beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import App from '../../App'
import { STORAGE_KEY, useTopTableStore } from '../../store/store'
import type { Guest, Pin, RoomConfig } from '../../domain/types'
import { PROTOCOL_ROLES } from '../../domain/types'
import { seatPins } from '../../domain/seating'
import { allocate } from '../../domain/allocate'
import { totalSeats } from '../../domain/capacity'

/**
 * TT-13, "Seat the top table, then fill the room" — the Plan screen once Auto-allocate is
 * involved. Written from TT-11's, TT-12's and TT-13's acceptance criteria and KB-1, KB-5 and
 * KB-6, without opening PlanTable.tsx, PlanScreen.tsx, PlanHeader.tsx, floorplan.ts,
 * StatusStrip.tsx or App.tsx. Guest fixtures follow the conventions already established in
 * PlanScreen.test.tsx, PlanHeader.test.tsx, PlanTable.test.tsx and store.test.ts.
 *
 * Every render below goes through the real `<App />` rather than `<PlanScreen />` in isolation:
 * `<App />` takes no props and PlanScreen's own prop contract is this file's business to observe,
 * never to satisfy, and KB-1's tab-switching defect (2, below) is only visible through the real
 * navigation in any case.
 *
 * Four things this file pins down:
 *
 * 1. TT-12 ("Clicking a pinned guest releases the pin") is a per-guest contract. A table can
 *    hold both a pinned and an unpinned occupant at once, and only the pinned one is offered a
 *    release control.
 * 2. KB-1's journey moves between screens and back without losing what Auto-allocate produced.
 *    docs/state.md fixes the allocated plan as derived, never stored, so a full reload must
 *    still show the room unallocated even though the room, guests and pins themselves persist.
 * 3. KB-5: "the button that says Auto-allocate produces a state that says allocated" — read
 *    literally, on the Setup screen's own status line.
 * 4. The header's unseated figure and the solver's own `plan.unseated` are two reads of the same
 *    fact and must never disagree, across the room and guest shapes the domain has to handle.
 */

function makeGuest(id: string, overrides: Partial<Guest> = {}): Guest {
  return {
    id,
    name: `Guest ${id}`,
    side: 'bride',
    role: 'guest',
    age: 'adult',
    household: null,
    partnerOf: null,
    conflictsWith: [],
    tags: [],
    allergies: [],
    dietaryPreferences: [],
    accessibility: [],
    socialType: 'sociable',
    ...overrides,
  }
}

function makeGuests(count: number): Guest[] {
  return Array.from({ length: count }, (_, index) => makeGuest(`g-${index}`))
}

function tables(): HTMLElement[] {
  return Array.from(document.querySelectorAll('[data-occupancy]'))
}

// Once a room has a top table it renders first, so tables()[0] is no longer "the table under
// test" — this locates one by its own rendered label instead of DOM position. Matched on a
// leading ", " too, since a pinned or violating table appends that to the same heading text.
function tableLabelled(label: string): HTMLElement {
  const match = tables().find((table) => {
    const heading = table.querySelector('p')?.textContent ?? ''
    return heading === label || heading.startsWith(`${label},`)
  })
  if (!match) {
    throw new Error(`no table labelled "${label}"`)
  }
  return match
}

// Renders the real app and activates its Plan tab, the one seam every test in this file needs
// regardless of which defect it targets.
async function renderAppOnPlanTab(user: ReturnType<typeof userEvent.setup>) {
  const result = render(<App />)
  await user.click(screen.getByRole('button', { name: 'Plan' }))
  return result
}

/**
 * The header's four figures (TT-35: the capacity headline "N seats for M guests", then the
 * stat pair pinned/unseated). Each is matched by its own pattern, in the shape the redesigned
 * header actually renders it, rather than one sequence-anchored regex — the headline now puts
 * seats before guests, and the stat pair renders its value and label as separate elements that
 * meet with no space (PlanHeader.module.css's .statValue/.statLabel), so "11Unseated" (no
 * space, digit first) is what the header itself produces. That shape is also what keeps this
 * from matching the status region's own "Allocated. N seated, M unseated." — that phrase has a
 * space before "unseated" and no digit immediately after it, and it is lower-case where the
 * header's own label is not.
 */
function readHeaderFigures(text: string): { guests: number; seats: number; pinned: number; unseated: number } {
  const headline = /(\d+)\s*seats\s*for\s*(\d+)\s*guests/i.exec(text)
  const pinned = /(\d+)Pinned/.exec(text)
  const unseated = /(\d+)Unseated/.exec(text)
  if (!headline || !pinned || !unseated) {
    throw new Error(`expected the header's four figures in the rendered text; got: ${JSON.stringify(text)}`)
  }
  const [, seatsText, guestsText] = headline
  const [, pinnedText] = pinned
  const [, unseatedText] = unseated
  if (
    guestsText === undefined ||
    seatsText === undefined ||
    pinnedText === undefined ||
    unseatedText === undefined
  ) {
    throw new Error('regex matched without all four capture groups')
  }
  return {
    guests: Number(guestsText),
    seats: Number(seatsText),
    pinned: Number(pinnedText),
    unseated: Number(unseatedText),
  }
}

beforeEach(() => {
  useTopTableStore.getState().reset()
  localStorage.clear()
})

describe('TT-12 ("Clicking a pinned guest releases the pin") — the release control is offered per guest, not per table', () => {
  // pinnedGuest must be last in this array: the fill claims a free seat per guest in guest-list
  // order, so releasing pinnedGuest's pin only sends them back to the rail (rather than quietly
  // re-seating them) if both ordinary guests ahead of them already claim the table's two seats.
  function setUpSharedTable(): { autoGuestOne: Guest; pinnedGuest: Guest } {
    useTopTableStore.getState().setRoom({ roundTables: 1, seatsEach: 2, topTableSeats: 2 })
    const autoGuestOne = makeGuest('auto-1', { name: 'Auto Guest One' })
    const autoGuestTwo = makeGuest('auto-2', { name: 'Auto Guest Two' })
    const pinnedGuest = makeGuest('pinned-1', { name: 'Pinned Guest' })
    useTopTableStore.getState().setGuests([autoGuestOne, autoGuestTwo, pinnedGuest])
    useTopTableStore.getState().pinGuest('pinned-1', 'round-1')
    return { autoGuestOne, pinnedGuest }
  }

  it('a solver-seated, unpinned guest sharing a table with a pinned one is offered no release control, and no button anywhere claims them as pinned', async () => {
    setUpSharedTable()
    const user = userEvent.setup()
    await renderAppOnPlanTab(user)

    await user.click(screen.getByRole('button', { name: 'Auto-allocate' }))

    const table = tableLabelled('Table 1')
    // Sanity: the pinned and the solver-seated guest really did land at the same table.
    expect(table.textContent).toContain('Auto Guest One')
    expect(table.textContent).toContain('Pinned Guest')

    expect(screen.queryByRole('button', { name: /^Release Auto Guest One from/ })).not.toBeInTheDocument()
    const anyButtonNamingAutoGuestOne = screen
      .queryAllByRole('button')
      .filter((button) => (button.textContent ?? '').includes('Auto Guest One'))
    expect(anyButtonNamingAutoGuestOne).toHaveLength(0)
  })

  it('a hand-pinned guest keeps a working release control after Auto-allocate, and using it returns them to the unseated rail', async () => {
    setUpSharedTable()
    const user = userEvent.setup()
    await renderAppOnPlanTab(user)

    await user.click(screen.getByRole('button', { name: 'Auto-allocate' }))

    const releaseButton = screen.getByRole('button', { name: /^Release Pinned Guest from/ })
    await user.click(releaseButton)

    expect(useTopTableStore.getState().pins).toEqual([])
    expect(screen.getByRole('button', { name: 'Pinned Guest' })).toBeInTheDocument()
  })
})

describe('KB-1 (the journey moves past Plan and back) — an allocated plan survives leaving and returning to the Plan tab', () => {
  it('keeps the same guests at the same tables, and the same header figures, after navigating to Guests and back to Plan', async () => {
    useTopTableStore.getState().setRoom({ roundTables: 2, seatsEach: 4, topTableSeats: 2 })
    useTopTableStore.getState().setGuests(makeGuests(8))
    const user = userEvent.setup()
    render(<App />)

    await user.click(screen.getByRole('button', { name: 'Plan' }))
    await user.click(screen.getByRole('button', { name: 'Auto-allocate' }))

    const beforeTables = tables().map((table) => table.textContent)
    const beforeFigures = readHeaderFigures(document.body.textContent ?? '')
    expect(beforeFigures.unseated).toBe(0)

    await user.click(screen.getByRole('button', { name: 'Guests' }))
    await user.click(screen.getByRole('button', { name: 'Plan' }))

    expect(tables().map((table) => table.textContent)).toEqual(beforeTables)
    expect(readHeaderFigures(document.body.textContent ?? '')).toEqual(beforeFigures)
  })

  it('does not survive a full store reload — a fresh store reading the same storage still computes an unallocated plan (docs/state.md)', async () => {
    useTopTableStore.getState().setRoom({ roundTables: 2, seatsEach: 4, topTableSeats: 2 })
    useTopTableStore.getState().setGuests(makeGuests(8))
    const user = userEvent.setup()
    render(<App />)

    await user.click(screen.getByRole('button', { name: 'Plan' }))
    await user.click(screen.getByRole('button', { name: 'Auto-allocate' }))
    expect(readHeaderFigures(document.body.textContent ?? '').unseated).toBe(0)

    // A full reload re-evaluates the store module from scratch, rehydrating only from
    // localStorage — store.test.ts's own freshStore() pattern. Re-rendering the *old* App
    // against this new store instance would prove nothing (App's own import of store.ts was
    // already resolved when App.tsx first loaded, long before this line), so this reads the
    // reloaded state directly and re-derives the plan from it with the same pure seatPins TT-13
    // gives the pre-allocate view, rather than rendering anything a second time.
    vi.resetModules()
    const { useTopTableStore: reloadedStore } = await import('../../store/store')
    const reloaded = reloadedStore.getState()

    expect(reloaded.room).toEqual({ roundTables: 2, seatsEach: 4, topTableSeats: 2 })
    expect(reloaded.guests).toHaveLength(8)
    expect(reloaded.pins).toEqual([])

    const stored = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? '{}') as { state?: Record<string, unknown> }
    expect(Object.keys(stored.state ?? {}).sort()).toEqual(['event', 'guests', 'pins', 'room', 'scenario'])

    const replan = seatPins(reloaded.room, reloaded.guests, reloaded.pins)
    expect(replan.unseated).toHaveLength(8)
  })
})

describe('KB-5 ("the button that says Auto-allocate produces a state that says allocated") — the Setup screen\'s plan status', () => {
  it('reads "Not generated" before Auto-allocate and "Allocated" after, driven through the real navigation', async () => {
    useTopTableStore.getState().setRoom({ roundTables: 1, seatsEach: 4, topTableSeats: 2 })
    useTopTableStore.getState().setGuests(makeGuests(4))
    const user = userEvent.setup()
    render(<App />)

    expect(document.body.textContent).toContain('Not generated')
    expect(document.body.textContent).not.toContain('Allocated')

    await user.click(screen.getByRole('button', { name: 'Plan' }))
    await user.click(screen.getByRole('button', { name: 'Auto-allocate' }))
    await user.click(screen.getByRole('button', { name: 'Setup' }))

    expect(document.body.textContent).toContain('Allocated')
    expect(document.body.textContent).not.toContain('Not generated')
  })
})

describe("TT-11 (the header's unseated figure) — it always agrees with the plan's own unseated list", () => {
  const ROOM_CASES: { label: string; room: RoomConfig }[] = [
    { label: 'zero round tables (top table 8)', room: { roundTables: 0, seatsEach: 8, topTableSeats: 8 } },
    { label: 'zero-capacity round tables', room: { roundTables: 4, seatsEach: 0, topTableSeats: 6 } },
    { label: 'ordinary room, minimal top table', room: { roundTables: 2, seatsEach: 4, topTableSeats: 2 } },
    { label: 'top table of 6', room: { roundTables: 2, seatsEach: 4, topTableSeats: 6 } },
    { label: 'top table of 8, ample capacity', room: { roundTables: 3, seatsEach: 8, topTableSeats: 8 } },
  ]

  const GUEST_SET_CASES: { label: string; guests: () => Guest[] }[] = [
    { label: 'no guests', guests: () => [] },
    { label: 'five ordinary guests, no protocol roles', guests: () => makeGuests(5) },
    {
      label: 'all eight protocol roles plus four ordinary guests',
      guests: () => [
        ...PROTOCOL_ROLES.map((role, index) => makeGuest(`role-${index}`, { role, name: `Role ${index}` })),
        ...makeGuests(4),
      ],
    },
  ]

  type PropertyCase = {
    roomLabel: string
    room: RoomConfig
    guestLabel: string
    guests: Guest[]
    pinLabel: string
    pins: Pin[]
  }

  function buildPropertyCases(): PropertyCase[] {
    const cases: PropertyCase[] = []

    for (const roomCase of ROOM_CASES) {
      for (const guestCase of GUEST_SET_CASES) {
        const guests = guestCase.guests()

        // A zero-seat room renders the first-visit invitation screen instead of a header,
        // confirmed empirically (not by reading PlanScreen.tsx): guests alone did not avert it
        // when this file's own "zero-capacity round tables" case still had topTableSeats: 0.
        // None of ROOM_CASES has totalSeats 0 any more, so this guard is currently a no-op —
        // kept so a future zero-seat room added here fails loudly here, not with a confusing
        // "no header figures found" error three functions away.
        if (totalSeats(roomCase.room) === 0) {
          continue
        }

        const pinVariants: { label: string; pins: Pin[] }[] = [{ label: 'no pins', pins: [] }]
        const firstGuest = guests[0]
        if (firstGuest) {
          const tableId = roomCase.room.roundTables >= 1 ? 'round-1' : roomCase.room.topTableSeats > 0 ? 'top' : null
          if (tableId) {
            pinVariants.push({ label: `one pin (${tableId})`, pins: [{ guestId: firstGuest.id, tableId }] })
          }
        }

        for (const pinVariant of pinVariants) {
          cases.push({
            roomLabel: roomCase.label,
            room: roomCase.room,
            guestLabel: guestCase.label,
            guests,
            pinLabel: pinVariant.label,
            pins: pinVariant.pins,
          })
        }
      }
    }

    return cases
  }

  it.each(buildPropertyCases())(
    '$roomLabel × $guestLabel × $pinLabel — before and after allocating',
    async ({ room, guests, pins }) => {
      useTopTableStore.getState().setRoom(room)
      useTopTableStore.getState().setGuests(guests)
      for (const pin of pins) {
        useTopTableStore.getState().pinGuest(pin.guestId, pin.tableId)
      }

      const user = userEvent.setup()
      await renderAppOnPlanTab(user)

      const expectedBefore = seatPins(room, guests, pins).unseated.length
      const actualBefore = readHeaderFigures(document.body.textContent ?? '').unseated
      expect(
        actualBefore,
        `before allocating, room=${JSON.stringify(room)} guests=${guests.length} pins=${pins.length}`,
      ).toBe(expectedBefore)

      await user.click(screen.getByRole('button', { name: 'Auto-allocate' }))

      const expectedAfter = allocate(room, guests, pins).unseated.length
      const actualAfter = readHeaderFigures(document.body.textContent ?? '').unseated
      expect(
        actualAfter,
        `after allocating, room=${JSON.stringify(room)} guests=${guests.length} pins=${pins.length}`,
      ).toBe(expectedAfter)
    },
  )
})
