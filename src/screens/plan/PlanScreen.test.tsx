import { describe, expect, it, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { PlanScreen } from './PlanScreen'
import { useTopTableStore } from '../../store/store'
import type { Guest } from '../../domain/types'
import { NavigationContext } from '../../shell/navigation'

/**
 * TT-11, "Render the floorplan from config" — C1, C2, C4, C6, C7, C10, C11, A11. Written from
 * TT-11's acceptance criteria, KB-6 ("Screens") and `docs/state.md`, against the `PlanScreen`
 * contract in `.claude/plans/TT-11.md` section 4 and the store-backed screen pattern in
 * src/screens/guests/GuestsScreen.test.tsx and src/screens/setup/SetupScreen.test.tsx. Does not
 * open PlanScreen.tsx, PlanEmpty.tsx, Floorplan.tsx (or however the grid component is actually
 * named) or any of their stylesheets.
 *
 * Tables are located by `[data-occupancy]` rather than by role: every PlanTable carries that
 * attribute unconditionally (PlanTable.test.tsx's own header comment explains why), which keeps
 * this file's counts correct regardless of whether a seated table's nested guest-name list is
 * itself a `<ul>`/`<li>` structure that would otherwise inflate a plain `getAllByRole('listitem')`
 * count.
 *
 * The empty-state button label ("Go to scenarios") and copy ("Start from a scenario, or set the
 * room up") are asserted exactly, unlike GuestsScreen.test.tsx's loose `/scenario|setup/i` match
 * on its own analogous control. That looseness there exists because neither TT-6 nor KB-6
 * publishes that control's copy. Here, A8 says the copy is invented too, but `.claude/plans/
 * TT-11.md` section 4 nonetheless states both strings as a definite, quoted decision — the
 * contract ui-developer is building to — so a divergence is a real integration finding, not a
 * false alarm on prose nobody committed to.
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

// The store's full key set today (docs/state.md, and src/store/store.ts read directly): four
// data fields plus eight actions. C6's whole point is that this list must not grow a pin, seat,
// plan or violation entry — asserting the exact set, not just a substring scan, is the strongest
// version of that check the plan's own "removeGuest and future pins (R5)" evidence relies on.
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
    // "unseated" is a word unique to the header line's vocabulary (C5) — its absence here is
    // evidence the header is not rendered at all in this state, per the component contract
    // ("renders <PlanEmpty/> and nothing else").
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
    // docs/state.md: storage is not a trusted input. Raw totalSeats on this room is
    // -1 * 8 + 8 = 0 (which used to render the invitation), but the room normalises to
    // { 0, 8, 8 } — a real top table — exactly as floorplanFromRoom already generates it.
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

    // The seat count is split across a tabular <span> and a plain-text " seats" sibling, so
    // it is asserted against the flattened body text rather than screen.getByText — the same
    // reason PlanScreen's own C10 tests above check document.body.textContent rather than a
    // role/text query for copy that spans more than one node.
    expect(document.body.textContent).toContain('8 seats')
  })
})

describe('PlanScreen — the round-table region is reachable by keyboard (WCAG 2.1.1, review)', () => {
  // FloorplanGrid.module.css gives the round-table list `overflow-x: auto`, and jsdom does no
  // layout — this suite cannot make the grid actually overflow, only assert the seam that makes
  // it operable once it does: a real accessible name and role, and tabIndex 0. See
  // FloorplanGrid.tsx's own header comment, point 3, for the reviewer's measured 1100px/9-table
  // case and why the fix is unconditional rather than driven by table count.

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

    // Activate everything activatable: every button, and every table (A9 says tables are not
    // buttons — TT-11 wires no click handler to them — but the criterion is about behaviour, so
    // clicking them anyway is the honest way to prove nothing happens).
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
