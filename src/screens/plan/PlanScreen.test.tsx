import { describe, expect, it, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { PlanScreen } from './PlanScreen'
import { useTopTableStore } from '../../store/store'
import type { Guest } from '../../domain/types'
import { NavigationContext } from '../../shell/navigation'

/**
 * TT-11, "Render the floorplan from config". Written from the acceptance criteria and KB-6,
 * without opening PlanScreen.tsx, PlanEmpty.tsx, FloorplanGrid.tsx or their stylesheets.
 *
 * Tables are located by `[data-occupancy]` rather than by role, so a seated table's nested
 * guest-name list can't inflate a plain `getAllByRole('listitem')` count.
 *
 * The empty-state button label and copy are asserted exactly, not loosely matched the way
 * GuestsScreen.test.tsx's analogous control is — that looseness there is because neither TT-6
 * nor KB-6 publishes its copy, but this screen's copy is a definite, quoted decision.
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

function renderPlanScreen(goTo: (tab: string) => void = () => {}) {
  return render(
    <NavigationContext.Provider value={{ tab: 'plan', goTo }}>
      <PlanScreen />
    </NavigationContext.Provider>,
  )
}

// The store's full key set today: five data fields plus ten actions. Asserting the exact
// set, not a substring scan, is what catches a future seat/plan/violation key creeping in.
const EXPECTED_STORE_KEYS = [
  'event',
  'room',
  'guests',
  'scenario',
  'pins',
  'setEventName',
  'setRoom',
  'setGuests',
  'importScenario',
  'reset',
  'addGuest',
  'updateGuest',
  'removeGuest',
  'pinGuest',
  'unpinGuest',
].sort()

beforeEach(() => {
  useTopTableStore.getState().reset()
  localStorage.clear()
})

describe('PlanScreen — table count is derived from the room, not fixed (C1, C7)', () => {
  it('renders five tables for Small and cosy (4 round + the top table)', () => {
    useTopTableStore.getState().setRoom({ roundTables: 4, seatsEach: 8, topTableSeats: 8 })
    useTopTableStore.getState().setGuests([])
    renderPlanScreen()

    expect(tables()).toHaveLength(5)
  })

  it('renders twenty-seven tables for Celebrity scale (26 round + the top table)', () => {
    useTopTableStore.getState().setRoom({ roundTables: 26, seatsEach: 8, topTableSeats: 8 })
    useTopTableStore.getState().setGuests([])
    renderPlanScreen()

    expect(tables()).toHaveLength(27)
  })
})

describe('PlanScreen — the top table is first, before every round table, in DOM order (C2)', () => {
  it('the first table element is the top table, and no other table is', () => {
    useTopTableStore.getState().setRoom({ roundTables: 3, seatsEach: 8, topTableSeats: 6 })
    useTopTableStore.getState().setGuests([])
    renderPlanScreen()

    const all = tables()
    expect(all).toHaveLength(4)
    const [first, ...rest] = all
    if (!first) {
      throw new Error('expected at least one table')
    }

    expect(first.textContent).toContain('Top table')
    for (const table of rest) {
      expect(table.textContent).not.toContain('Top table')
    }
  })
})

describe('PlanScreen — with nothing seated, every table is empty and clean (C4)', () => {
  it('every table carries data-occupancy="empty" and no data-pinned or data-violation attribute', () => {
    useTopTableStore.getState().setRoom({ roundTables: 3, seatsEach: 8, topTableSeats: 6 })
    useTopTableStore.getState().setGuests(makeGuests(5))
    renderPlanScreen()

    const all = tables()
    expect(all.length).toBeGreaterThan(0)
    for (const table of all) {
      expect(table.getAttribute('data-occupancy')).toBe('empty')
      expect(table.hasAttribute('data-pinned')).toBe(false)
      expect(table.hasAttribute('data-violation')).toBe(false)
    }
  })
})

describe('PlanScreen — an empty guest list is not an unconfigured room (C10)', () => {
  it('a configured room with no guests still renders the floorplan, every table empty', () => {
    useTopTableStore.getState().setRoom({ roundTables: 2, seatsEach: 4, topTableSeats: 4 })
    useTopTableStore.getState().setGuests([])
    renderPlanScreen()

    const all = tables()
    expect(all).toHaveLength(3)
    for (const table of all) {
      expect(table.getAttribute('data-occupancy')).toBe('empty')
    }
  })
})

describe('PlanScreen — first visit reads as an invitation, not an empty grid (C10)', () => {
  it('renders no tables, and no header figures, when no seats are configured', () => {
    // reset() in beforeEach already leaves the room at {0,0,0} with no guests — true first visit.
    renderPlanScreen()

    expect(tables()).toHaveLength(0)
    expect(screen.queryByRole('list')).not.toBeInTheDocument()
    // "unseated" is unique to the header's vocabulary — its absence is evidence the header
    // isn't rendered at all in this state.
    expect(screen.queryByText(/unseated/i)).not.toBeInTheDocument()
  })

  it('offers a "Go to scenarios" control, and activating it asks the app to go to Setup', async () => {
    let requestedTab: string | null = null
    const user = userEvent.setup()
    renderPlanScreen((tab) => {
      requestedTab = tab
    })

    const button = screen.getByRole('button', { name: 'Go to scenarios' })
    await user.click(button)

    expect(requestedTab).toBe('setup')
  })

  it('reads the invitation copy from the plan\'s own contract, not an apology', () => {
    renderPlanScreen()
    expect(document.body.textContent).toContain('Start from a scenario, or set the room up')
    expect(document.body.textContent).not.toMatch(/sorry/i)
  })
})

describe('PlanScreen — the gate agrees with the generator on an un-normalised room (regression, TT-11 review)', () => {
  it('a hand-edited room with a negative roundTables still shows the floorplan once it normalises to real seats', () => {
    // Raw totalSeats on this room is -1 * 8 + 8 = 0, but it normalises to { 0, 8, 8 } — a real
    // top table, exactly as floorplanFromRoom already generates it.
    useTopTableStore.getState().setRoom({ roundTables: -1, seatsEach: 8, topTableSeats: 8 })
    useTopTableStore.getState().setGuests([])
    renderPlanScreen()

    const all = tables()
    const [only] = all
    if (!only) {
      throw new Error('expected exactly one table: the top table alone')
    }

    expect(all).toHaveLength(1)
    expect(only.textContent).toContain('Top table')
    expect(screen.queryByText(/start from a scenario/i)).not.toBeInTheDocument()
  })

  it('the header seat figure agrees with the grid on that same un-normalised room', () => {
    useTopTableStore.getState().setRoom({ roundTables: -1, seatsEach: 8, topTableSeats: 8 })
    useTopTableStore.getState().setGuests([])
    renderPlanScreen()

    // Split across a tabular <span> and a plain-text sibling, so it's asserted against the
    // flattened body text rather than screen.getByText.
    expect(document.body.textContent).toContain('8 seats')
  })
})

describe('PlanScreen — the round-table region is reachable by keyboard (WCAG 2.1.1, review)', () => {
  // jsdom does no layout, so this suite can't make the grid actually overflow — only assert
  // the seam that makes it operable once it does: a real name, role and tabIndex 0.

  it('the round-table region is focusable and carries a real accessible name', () => {
    useTopTableStore.getState().setRoom({ roundTables: 9, seatsEach: 8, topTableSeats: 6 })
    useTopTableStore.getState().setGuests([])
    renderPlanScreen()

    expect(screen.getByRole('region', { name: 'Round tables' }).tabIndex).toBe(0)
  })

  it('is focusable even at a single round table, which can never overflow — not conditioned on a count that would still be wrong', () => {
    useTopTableStore.getState().setRoom({ roundTables: 1, seatsEach: 8, topTableSeats: 6 })
    useTopTableStore.getState().setGuests([])
    renderPlanScreen()

    expect(screen.getByRole('region', { name: 'Round tables' }).tabIndex).toBe(0)
  })

  it('renders no such region when there are no round tables to scroll', () => {
    useTopTableStore.getState().setRoom({ roundTables: 0, seatsEach: 8, topTableSeats: 8 })
    useTopTableStore.getState().setGuests([])
    renderPlanScreen()

    expect(screen.queryByRole('region', { name: 'Round tables' })).not.toBeInTheDocument()
  })
})

describe('PlanScreen — the scaffold is gone (C11)', () => {
  it('never renders the old scaffold text, and renders real content in its place', () => {
    useTopTableStore.getState().setRoom({ roundTables: 2, seatsEach: 4, topTableSeats: 4 })
    useTopTableStore.getState().setGuests(makeGuests(3))
    renderPlanScreen()

    expect(document.body.textContent).not.toContain('The plan lands here')
    // Real content in its place: the header's own vocabulary, and at least one table. A body
    // text-content check, not screen.queryByText — TT-12's rail heading also says "Unseated",
    // so a single-element query is now ambiguous by design (two independent, correct pieces
    // of copy both carry the word).
    expect(document.body.textContent).toMatch(/unseated/i)
    expect(tables().length).toBeGreaterThan(0)
  })

  it('never renders the old scaffold text in the empty, unconfigured state either', () => {
    renderPlanScreen()
    expect(document.body.textContent).not.toContain('The plan lands here')
  })
})

describe('PlanScreen — a visually-hidden "Plan" heading, in every state', () => {
  it('is present when configured', () => {
    useTopTableStore.getState().setRoom({ roundTables: 1, seatsEach: 4, topTableSeats: 4 })
    renderPlanScreen()
    expect(screen.getByRole('heading', { level: 1, name: 'Plan' })).toBeInTheDocument()
  })

  it('is present when unconfigured', () => {
    renderPlanScreen()
    expect(screen.getByRole('heading', { level: 1, name: 'Plan' })).toBeInTheDocument()
  })
})

describe('PlanScreen — one live region announces placing and releasing', () => {
  it('mounts exactly one role="status" element when configured, empty at rest', () => {
    useTopTableStore.getState().setRoom({ roundTables: 1, seatsEach: 4, topTableSeats: 4 })
    renderPlanScreen()

    expect(screen.getAllByRole('status')).toHaveLength(1)
    expect(screen.getByRole('status').textContent).toBe('')
  })

  it('mounts no role="status" element when unconfigured', () => {
    renderPlanScreen()

    expect(screen.queryByRole('status')).not.toBeInTheDocument()
  })

  it('names the guest and the table once a placement is made', async () => {
    useTopTableStore.getState().setRoom({ roundTables: 1, seatsEach: 4, topTableSeats: 0 })
    useTopTableStore.getState().setGuests(makeGuests(1))
    const user = userEvent.setup()
    renderPlanScreen()

    await user.click(screen.getByRole('button', { name: 'Guest g-0' }))
    const [placingButton] = screen.getAllByRole('button', { name: /^Place Guest g-0 at/ })
    if (!placingButton) {
      throw new Error('expected a placing button once a guest is selected')
    }
    await user.click(placingButton)

    expect(screen.getByRole('status').textContent).toMatch(/Guest g-0/)
    expect(screen.getByRole('status').textContent).toMatch(/placed/i)
  })

  it('names the guest and the table once a placed guest is released', async () => {
    useTopTableStore.getState().setRoom({ roundTables: 1, seatsEach: 4, topTableSeats: 0 })
    useTopTableStore.getState().setGuests(makeGuests(1))
    useTopTableStore.getState().pinGuest('g-0', 'round-1')
    const user = userEvent.setup()
    renderPlanScreen()

    await user.click(screen.getByRole('button', { name: /^Release Guest g-0 from/ }))

    expect(screen.getByRole('status').textContent).toMatch(/Guest g-0/)
    expect(screen.getByRole('status').textContent).toMatch(/released/i)
  })
})

describe('PlanScreen — placing writes a pin and nothing else', () => {
  it('placing a guest changes only pins; event, room, guests and scenario stay byte-identical', async () => {
    useTopTableStore.getState().setRoom({ roundTables: 2, seatsEach: 4, topTableSeats: 4 })
    useTopTableStore.getState().setGuests(makeGuests(4))

    const before = useTopTableStore.getState()
    const beforeSnapshot = structuredClone({
      event: before.event,
      room: before.room,
      guests: before.guests,
      scenario: before.scenario,
    })
    expect(Object.keys(before).sort()).toEqual(EXPECTED_STORE_KEYS)
    expect(before.pins).toEqual([])

    const user = userEvent.setup()
    renderPlanScreen()

    await user.click(screen.getByRole('button', { name: 'Guest g-0' }))
    const [placingButton] = screen.getAllByRole('button', { name: /^Place Guest g-0 at/ })
    if (!placingButton) {
      throw new Error('expected a placing button once a guest is selected')
    }
    await user.click(placingButton)

    const after = useTopTableStore.getState()
    const afterSnapshot = {
      event: after.event,
      room: after.room,
      guests: after.guests,
      scenario: after.scenario,
    }

    expect(afterSnapshot).toEqual(beforeSnapshot)
    // The top table's placing button is first in DOM order (FloorplanGrid renders it before
    // the round grid), so this is the one the click above landed on.
    expect(after.pins).toEqual([{ guestId: 'g-0', tableId: 'top' }])
    expect(Object.keys(after).sort()).toEqual(EXPECTED_STORE_KEYS)
    for (const key of Object.keys(after)) {
      expect(key.toLowerCase()).not.toMatch(/seat|plan|violation/)
    }
  })

  it('the first-visit, invitation branch leaves the store untouched even after its control is used', async () => {
    const before = useTopTableStore.getState()
    const beforeSnapshot = structuredClone({
      event: before.event,
      room: before.room,
      guests: before.guests,
      scenario: before.scenario,
    })

    const user = userEvent.setup()
    renderPlanScreen()

    for (const button of screen.queryAllByRole('button')) {
      await user.click(button)
    }

    const after = useTopTableStore.getState()
    const afterSnapshot = {
      event: after.event,
      room: after.room,
      guests: after.guests,
      scenario: after.scenario,
    }

    expect(afterSnapshot).toEqual(beforeSnapshot)
    expect(Object.keys(after).sort()).toEqual(EXPECTED_STORE_KEYS)
  })
})

describe('PlanScreen — the rail lists every unseated guest beside the floorplan', () => {
  it('a configured room with five guests and no pins lists five rail buttons, in guest order, and every table reads its own zero seats', () => {
    useTopTableStore.getState().setRoom({ roundTables: 2, seatsEach: 4, topTableSeats: 4 })
    useTopTableStore.getState().setGuests(makeGuests(5))
    renderPlanScreen()

    const railButtons = screen.getAllByRole('button', { name: /^Guest g-\d+$/ })
    expect(railButtons.map((button) => button.textContent)).toEqual([
      'Guest g-0',
      'Guest g-1',
      'Guest g-2',
      'Guest g-3',
      'Guest g-4',
    ])

    for (const table of tables()) {
      expect(table.textContent).toMatch(/0\s*of\s*4\s*seats/i)
    }
  })
})

describe('PlanScreen — placing a guest with two clicks', () => {
  it('clicking a rail guest then a table places them: they leave the rail, the table reads one seat filled, and the table carries data-pinned', async () => {
    useTopTableStore.getState().setRoom({ roundTables: 1, seatsEach: 4, topTableSeats: 0 })
    useTopTableStore.getState().setGuests(makeGuests(1))
    const user = userEvent.setup()
    renderPlanScreen()

    await user.click(screen.getByRole('button', { name: 'Guest g-0' }))
    await user.click(screen.getByRole('button', { name: /^Place Guest g-0 at Table 1/ }))

    expect(screen.queryByRole('button', { name: 'Guest g-0' })).not.toBeInTheDocument()
    const [table] = tables()
    if (!table) {
      throw new Error('expected one table')
    }
    expect(table.textContent).toMatch(/1\s*of\s*4\s*seats/i)
    expect(table.getAttribute('data-pinned')).toBe('true')
  })
})

describe('PlanScreen — a table offers nothing to click without a selection', () => {
  it('with no guest selected the table has no button to click, and clicking it writes no pin', async () => {
    useTopTableStore.getState().setRoom({ roundTables: 1, seatsEach: 4, topTableSeats: 0 })
    useTopTableStore.getState().setGuests(makeGuests(1))
    const user = userEvent.setup()
    renderPlanScreen()

    const [table] = tables()
    if (!table) {
      throw new Error('expected one table')
    }
    expect(table.querySelectorAll('button')).toHaveLength(0)

    await user.click(table)

    expect(useTopTableStore.getState().pins).toEqual([])
    expect(screen.getByRole('button', { name: 'Guest g-0' })).toBeInTheDocument()
  })
})

describe('PlanScreen — the header reflects a placement, with PlanHeader.tsx itself unmodified', () => {
  it('after one placement the header reads one pinned and its unseated figure drops by one', async () => {
    useTopTableStore.getState().setRoom({ roundTables: 1, seatsEach: 4, topTableSeats: 0 })
    useTopTableStore.getState().setGuests(makeGuests(3))
    const user = userEvent.setup()
    renderPlanScreen()

    expect(document.body.textContent).toContain('3 unseated')
    expect(document.body.textContent).toContain('0 pinned')

    await user.click(screen.getByRole('button', { name: 'Guest g-0' }))
    await user.click(screen.getByRole('button', { name: /^Place Guest g-0 at Table 1/ }))

    expect(document.body.textContent).toContain('1 pinned')
    expect(document.body.textContent).toContain('2 unseated')
  })
})

describe('PlanScreen — releasing a pinned guest', () => {
  it('releasing the only pinned guest returns them to the rail, drops the table to zero seats, and clears data-pinned entirely rather than to "false"', async () => {
    useTopTableStore.getState().setRoom({ roundTables: 1, seatsEach: 4, topTableSeats: 0 })
    useTopTableStore.getState().setGuests(makeGuests(1))
    useTopTableStore.getState().pinGuest('g-0', 'round-1')
    const user = userEvent.setup()
    renderPlanScreen()

    await user.click(screen.getByRole('button', { name: /^Release Guest g-0 from/ }))

    expect(screen.getByRole('button', { name: 'Guest g-0' })).toBeInTheDocument()
    const [table] = tables()
    if (!table) {
      throw new Error('expected one table')
    }
    expect(table.textContent).toMatch(/0\s*of\s*4\s*seats/i)
    expect(table.hasAttribute('data-pinned')).toBe(false)
    expect(table.getAttribute('data-pinned')).not.toBe('false')
  })

  it('releasing one of two guests pinned at the same table keeps it pinned and drops it to one seat', async () => {
    useTopTableStore.getState().setRoom({ roundTables: 1, seatsEach: 4, topTableSeats: 0 })
    useTopTableStore.getState().setGuests(makeGuests(2))
    useTopTableStore.getState().pinGuest('g-0', 'round-1')
    useTopTableStore.getState().pinGuest('g-1', 'round-1')
    const user = userEvent.setup()
    renderPlanScreen()

    await user.click(screen.getByRole('button', { name: /^Release Guest g-0 from/ }))

    const [table] = tables()
    if (!table) {
      throw new Error('expected one table')
    }
    expect(table.getAttribute('data-pinned')).toBe('true')
    expect(table.textContent).toMatch(/1\s*of\s*4\s*seats/i)
  })
})

describe('PlanScreen — Escape clears the selection', () => {
  it('selecting a guest then pressing Escape leaves no guest pressed, offers no table to place at, and writes no pin', async () => {
    useTopTableStore.getState().setRoom({ roundTables: 1, seatsEach: 4, topTableSeats: 0 })
    useTopTableStore.getState().setGuests(makeGuests(1))
    const user = userEvent.setup()
    renderPlanScreen()

    await user.click(screen.getByRole('button', { name: 'Guest g-0' }))
    expect(screen.getByRole('button', { name: 'Guest g-0' })).toHaveAttribute('aria-pressed', 'true')

    await user.keyboard('{Escape}')

    expect(screen.getByRole('button', { name: 'Guest g-0' })).toHaveAttribute('aria-pressed', 'false')
    const [table] = tables()
    if (!table) {
      throw new Error('expected one table')
    }
    expect(table.querySelectorAll('button')).toHaveLength(0)
    expect(useTopTableStore.getState().pins).toEqual([])
  })

  it('Escape with no guest selected does nothing, and does not throw', async () => {
    useTopTableStore.getState().setRoom({ roundTables: 1, seatsEach: 4, topTableSeats: 0 })
    useTopTableStore.getState().setGuests(makeGuests(1))
    const user = userEvent.setup()
    renderPlanScreen()

    await user.keyboard('{Escape}')

    expect(screen.getByRole('button', { name: 'Guest g-0' })).toBeInTheDocument()
    expect(useTopTableStore.getState().pins).toEqual([])
  })

  it('reports the cleared selection in the live region', async () => {
    useTopTableStore.getState().setRoom({ roundTables: 1, seatsEach: 4, topTableSeats: 0 })
    useTopTableStore.getState().setGuests(makeGuests(1))
    const user = userEvent.setup()
    renderPlanScreen()

    await user.click(screen.getByRole('button', { name: 'Guest g-0' }))
    await user.keyboard('{Escape}')

    expect(screen.getByRole('status').textContent).toMatch(/selection cleared/i)
  })
})

describe('PlanScreen — placing at the top table', () => {
  it('placing an ordinary, non-protocol guest at the top table succeeds — TT-12 does not gate placing on a protocol role', async () => {
    useTopTableStore.getState().setRoom({ roundTables: 0, seatsEach: 0, topTableSeats: 4 })
    useTopTableStore.getState().setGuests([makeGuest('g-0', { role: 'guest' })])
    const user = userEvent.setup()
    renderPlanScreen()

    await user.click(screen.getByRole('button', { name: 'Guest g-0' }))
    await user.click(screen.getByRole('button', { name: /^Place Guest g-0 at/ }))

    expect(useTopTableStore.getState().pins).toEqual([{ guestId: 'g-0', tableId: 'top' }])
    const [table] = tables()
    if (!table) {
      throw new Error('expected the top table alone')
    }
    expect(table.textContent).toContain('Top table')
    expect(table.getAttribute('data-pinned')).toBe('true')
  })
})

describe('PlanScreen — a table can be placed past its capacity by hand', () => {
  it('placing a ninth guest at an eight-seat table succeeds; the table reads nine of eight seats and stays full', async () => {
    useTopTableStore.getState().setRoom({ roundTables: 1, seatsEach: 8, topTableSeats: 0 })
    useTopTableStore.getState().setGuests(makeGuests(9))
    for (let index = 0; index < 8; index += 1) {
      useTopTableStore.getState().pinGuest(`g-${index}`, 'round-1')
    }
    const user = userEvent.setup()
    renderPlanScreen()

    await user.click(screen.getByRole('button', { name: 'Guest g-8' }))
    await user.click(screen.getByRole('button', { name: /^Place Guest g-8 at Table 1/ }))

    const [table] = tables()
    if (!table) {
      throw new Error('expected one table')
    }
    expect(table.textContent).toMatch(/9\s*of\s*8\s*seats/i)
    expect(table.getAttribute('data-occupancy')).toBe('full')
  })
})

describe('PlanScreen — focus follows the gesture, since the control just activated unmounts', () => {
  it('after placing, focus lands on the rail\'s first remaining guest button', async () => {
    useTopTableStore.getState().setRoom({ roundTables: 1, seatsEach: 4, topTableSeats: 0 })
    useTopTableStore.getState().setGuests(makeGuests(3))
    const user = userEvent.setup()
    renderPlanScreen()

    await user.click(screen.getByRole('button', { name: 'Guest g-0' }))
    await user.click(screen.getByRole('button', { name: /^Place Guest g-0 at Table 1/ }))

    expect(screen.getByRole('button', { name: 'Guest g-1' })).toHaveFocus()
  })

  it('placing the only remaining guest empties the rail, and focus lands on the rail heading instead', async () => {
    useTopTableStore.getState().setRoom({ roundTables: 1, seatsEach: 4, topTableSeats: 0 })
    useTopTableStore.getState().setGuests(makeGuests(1))
    const user = userEvent.setup()
    renderPlanScreen()

    await user.click(screen.getByRole('button', { name: 'Guest g-0' }))
    await user.click(screen.getByRole('button', { name: /^Place Guest g-0 at Table 1/ }))

    expect(screen.getByRole('heading', { name: 'Unseated' })).toHaveFocus()
  })

  it('after releasing, focus lands on that guest\'s newly-appeared rail button', async () => {
    useTopTableStore.getState().setRoom({ roundTables: 1, seatsEach: 4, topTableSeats: 0 })
    useTopTableStore.getState().setGuests(makeGuests(1))
    useTopTableStore.getState().pinGuest('g-0', 'round-1')
    const user = userEvent.setup()
    renderPlanScreen()

    await user.click(screen.getByRole('button', { name: /^Release Guest g-0 from/ }))

    expect(screen.getByRole('button', { name: 'Guest g-0' })).toHaveFocus()
  })
})

describe('PlanScreen — a pin survives a remount, and a selection does not', () => {
  it('placing a guest, then unmounting and remounting the screen, keeps the pin and starts with nothing selected', async () => {
    useTopTableStore.getState().setRoom({ roundTables: 1, seatsEach: 4, topTableSeats: 0 })
    useTopTableStore.getState().setGuests(makeGuests(2))
    const user = userEvent.setup()
    const { unmount } = renderPlanScreen()

    await user.click(screen.getByRole('button', { name: 'Guest g-0' }))
    await user.click(screen.getByRole('button', { name: /^Place Guest g-0 at Table 1/ }))

    unmount()
    renderPlanScreen()

    expect(useTopTableStore.getState().pins).toEqual([{ guestId: 'g-0', tableId: 'round-1' }])
    expect(screen.queryByRole('button', { pressed: true })).not.toBeInTheDocument()
    expect(screen.getByRole('status').textContent).toBe('')
  })
})

describe('PlanScreen — Celebrity scale renders every guest and every table, without truncating either', () => {
  it('200 guests and 27 tables all render', () => {
    useTopTableStore.getState().setRoom({ roundTables: 26, seatsEach: 8, topTableSeats: 8 })
    useTopTableStore.getState().setGuests(makeGuests(200))
    renderPlanScreen()

    expect(screen.getAllByRole('button', { name: /^Guest g-\d+$/ })).toHaveLength(200)
    expect(tables()).toHaveLength(27)
  })
})
