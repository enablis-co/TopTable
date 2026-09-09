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
 *
 * Every Guest fixture sets `age` to an AgeBand, never a number — see floorplan.test.ts's header
 * comment for why KB-3's `number` typing is the stale copy.
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

// The store's full key set today: four data fields plus eight actions. Asserting the exact
// set, not a substring scan, is what catches a future pin/seat/plan/violation key creeping in.
const EXPECTED_STORE_KEYS = [
  'event',
  'room',
  'guests',
  'scenario',
  'setEventName',
  'setRoom',
  'setGuests',
  'importScenario',
  'reset',
  'addGuest',
  'updateGuest',
  'removeGuest',
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
    // Real content in its place: the header's own vocabulary, and at least one table.
    expect(screen.queryByText(/unseated/i)).toBeInTheDocument()
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

describe('PlanScreen — no aria-live region, nothing on this screen can change yet (A11)', () => {
  it('mounts no [aria-live] element and no role="status" when configured', () => {
    useTopTableStore.getState().setRoom({ roundTables: 1, seatsEach: 4, topTableSeats: 4 })
    renderPlanScreen()

    expect(document.querySelector('[aria-live]')).toBeNull()
    expect(screen.queryByRole('status')).not.toBeInTheDocument()
  })

  it('mounts no [aria-live] element and no role="status" when unconfigured', () => {
    renderPlanScreen()

    expect(document.querySelector('[aria-live]')).toBeNull()
    expect(screen.queryByRole('status')).not.toBeInTheDocument()
  })
})

describe('PlanScreen — C6: renders and reacts to every interaction without writing pin, seat, plan or violation state', () => {
  it('the configured, floorplan-rendering branch leaves the store untouched', async () => {
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

    const user = userEvent.setup()
    renderPlanScreen()

    // Activate everything activatable: every button and every table (no click handler is
    // wired to a table, but clicking anyway is the honest way to prove nothing happens).
    for (const button of screen.queryAllByRole('button')) {
      await user.click(button)
    }
    for (const table of tables()) {
      await user.click(table)
    }
    for (const item of screen.queryAllByRole('listitem')) {
      await user.click(item)
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
    for (const key of Object.keys(after)) {
      expect(key.toLowerCase()).not.toMatch(/pin|seat|plan|violation/)
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
