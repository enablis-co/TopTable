import { useState } from 'react'
import { describe, expect, it, beforeEach } from 'vitest'
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { PlanScreen } from './PlanScreen'
import { useTopTableStore } from '../../store/store'
import type { Guest } from '../../domain/types'
import { NavigationContext } from '../../shell/navigation'

/**
 * TT-16's third-column state machine, driven through the real `PlanScreen` rather than through
 * any one panel in isolation — the invariant (never two of violations, table detail and
 * breakdown at once) is enforced by two handlers each clearing the other's state, so only an
 * integration test can actually see it hold. Named as its own file so TT-15's `PlanScreen.test.tsx`
 * and `planAllocation.test.tsx` are not touched by TT-16 at all.
 *
 * Written from the ticket's acceptance criteria. Does not open PlanScreen.tsx,
 * ScoreBreakdownPanel.tsx or PlanHeader.tsx. `renderPlanScreen`/`tables`/`tableLabelled`/
 * `selectTable`/`tableDetailPanel` follow PlanScreen.test.tsx's own conventions.
 *
 * TT-16's review: `opportunities` is now a property of the guest list, never of how much of the
 * plan is seated (the fix for the comparability defect the review found). One consequence,
 * checked below where it matters: an unallocated or just-cleared plan whose guest list still
 * carries partner data no longer reads "Nothing to score" — it scores honestly at 0. Null is now
 * reached only by a guest list with no partner data at all.
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

function tables(): HTMLElement[] {
  return Array.from(document.querySelectorAll('[data-occupancy]'))
}

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

async function selectTable(user: ReturnType<typeof userEvent.setup>, label: string): Promise<void> {
  const button = tableLabelled(label).querySelector('button')
  if (!button) {
    throw new Error(`expected a select button on the table labelled "${label}"`)
  }
  await user.click(button)
}

function PlanScreenHarness() {
  const [allocated, setAllocated] = useState(false)
  return <PlanScreen allocated={allocated} setAllocated={setAllocated} />
}

function renderPlanScreen() {
  return render(
    <NavigationContext.Provider value={{ tab: 'plan', goTo: () => {} }}>
      <PlanScreenHarness />
    </NavigationContext.Provider>,
  )
}

function scoreToggle(): HTMLElement {
  return screen.getByRole('button', { name: /Fit/i })
}

function queryScoreToggle(): HTMLElement | null {
  return screen.queryByRole('button', { name: /Fit/i })
}

/** Exactly one of the three column states is showing: violations, a table's detail, or the
 *  breakdown. */
function openColumnStates(): string[] {
  const open: string[] = []
  if (screen.queryByRole('heading', { name: 'Violations' })) open.push('violations')
  if (screen.queryByRole('heading', { name: 'Score breakdown' })) open.push('breakdown')
  if (screen.queryByRole('button', { name: 'Close table detail' })) open.push('table-detail')
  return open
}

function openPrompt(): HTMLElement {
  const cancel = screen.getByRole('button', { name: 'Cancel' })
  let node: HTMLElement | null = cancel.parentElement
  while (node && !(node.textContent ?? '').includes('cannot be undone')) {
    node = node.parentElement
  }
  if (!node) {
    throw new Error('could not locate the open confirm prompt')
  }
  return node
}

/**
 * A room with a seated partner pair pinned at two different tables — guaranteed to violate
 * partners-adjacent regardless of which seat within a table either lands on, since they are never
 * on the same table at all. This is the one soft rule registered today, so this guarantees a
 * real, non-null score (0) without depending on any seat-assignment tie-break.
 */
function setUpScorableRoom(): void {
  useTopTableStore.getState().setRoom({ roundTables: 1, seatsEach: 4, topTableSeats: 2 })
  const a = makeGuest('a', { name: 'Partner A', partnerOf: 'b' })
  const b = makeGuest('b', { name: 'Partner B', partnerOf: 'a' })
  useTopTableStore.getState().setGuests([a, b])
  useTopTableStore.getState().pinGuest('a', 'round-1')
  useTopTableStore.getState().pinGuest('b', 'top')
}

beforeEach(() => {
  useTopTableStore.getState().reset()
  localStorage.clear()
})

describe('default: the violations panel is in the column; no breakdown, no table detail', () => {
  it('renders only the violations panel at rest', () => {
    setUpScorableRoom()
    renderPlanScreen()

    expect(openColumnStates()).toEqual(['violations'])
  })
})

describe('clicking the score opens and closes the breakdown', () => {
  it('shows the breakdown and removes the violations panel; clicking again restores the violations panel', async () => {
    setUpScorableRoom()
    const user = userEvent.setup()
    renderPlanScreen()

    await user.click(scoreToggle())
    expect(openColumnStates()).toEqual(['breakdown'])

    await user.click(scoreToggle())
    expect(openColumnStates()).toEqual(['violations'])
  })
})

describe('selecting a table while the breakdown is open', () => {
  it("shows that table's detail and removes the breakdown", async () => {
    setUpScorableRoom()
    const user = userEvent.setup()
    renderPlanScreen()

    await user.click(scoreToggle())
    expect(openColumnStates()).toEqual(['breakdown'])

    await selectTable(user, 'Table 1')

    expect(openColumnStates()).toEqual(['table-detail'])
    expect(screen.getByRole('heading', { name: 'Table 1' })).toBeInTheDocument()
  })
})

describe('opening the breakdown while a table detail is open', () => {
  it('shows the breakdown and closes the table detail', async () => {
    setUpScorableRoom()
    const user = userEvent.setup()
    renderPlanScreen()

    await selectTable(user, 'Table 1')
    expect(openColumnStates()).toEqual(['table-detail'])

    await user.click(scoreToggle())

    expect(openColumnStates()).toEqual(['breakdown'])
    expect(screen.queryByRole('heading', { name: 'Table 1' })).not.toBeInTheDocument()
  })
})

describe('"Close score breakdown" returns the column to the violations panel', () => {
  it('closes the breakdown and shows the violations panel', async () => {
    setUpScorableRoom()
    const user = userEvent.setup()
    renderPlanScreen()

    await user.click(scoreToggle())
    await user.click(screen.getByRole('button', { name: 'Close score breakdown' }))

    expect(openColumnStates()).toEqual(['violations'])
  })
})

describe('"Close table detail" always returns to violations, never to a breakdown left open before', () => {
  it('returns to violations even though the breakdown was open before the table was selected', async () => {
    setUpScorableRoom()
    const user = userEvent.setup()
    renderPlanScreen()

    await user.click(scoreToggle()) // breakdown open
    await selectTable(user, 'Table 1') // closes breakdown, opens table detail
    await user.click(screen.getByRole('button', { name: 'Close table detail' }))

    expect(openColumnStates()).toEqual(['violations'])
    expect(screen.queryByRole('heading', { name: 'Score breakdown' })).not.toBeInTheDocument()
  })
})

describe('never two of the three states at once, across every transition above', () => {
  it('checks the invariant after every step of a full tour through the state machine', async () => {
    setUpScorableRoom()
    const user = userEvent.setup()
    renderPlanScreen()

    expect(openColumnStates().length).toBe(1) // start: violations

    await user.click(scoreToggle())
    expect(openColumnStates().length).toBe(1) // breakdown

    await selectTable(user, 'Table 1')
    expect(openColumnStates().length).toBe(1) // table detail

    await user.click(scoreToggle())
    expect(openColumnStates().length).toBe(1) // breakdown again

    await user.click(screen.getByRole('button', { name: 'Close score breakdown' }))
    expect(openColumnStates().length).toBe(1) // violations

    await selectTable(user, 'Top table')
    expect(openColumnStates().length).toBe(1) // table detail

    await selectTable(user, 'Top table') // toggling the same table closed (TT-15)
    expect(openColumnStates().length).toBe(1) // violations
  })
})

describe('focus stays on, and returns to, the score toggle', () => {
  it('is on the toggle after opening the breakdown, and back on it after "Close score breakdown"', async () => {
    setUpScorableRoom()
    const user = userEvent.setup()
    renderPlanScreen()

    await user.click(scoreToggle())
    expect(scoreToggle()).toHaveFocus()

    await user.click(screen.getByRole('button', { name: 'Close score breakdown' }))
    expect(scoreToggle()).toHaveFocus()
  })
})

describe('the score stays rendered in the header while a table detail is open', () => {
  it('the score toggle is still present once a table is selected', async () => {
    setUpScorableRoom()
    const user = userEvent.setup()
    renderPlanScreen()

    await selectTable(user, 'Table 1')

    expect(queryScoreToggle()).not.toBeNull()
  })
})

describe('placing a guest changes the score shown in the header with no further interaction', () => {
  it('placing the second half of a partner pair moves a real, non-null score from 0 toward 100', async () => {
    useTopTableStore.getState().setRoom({ roundTables: 1, seatsEach: 2, topTableSeats: 2 })
    const a = makeGuest('a', { name: 'Partner A', partnerOf: 'b' })
    const b = makeGuest('b', { name: 'Partner B', partnerOf: 'a' })
    useTopTableStore.getState().setGuests([a, b])
    useTopTableStore.getState().pinGuest('a', 'round-1') // b stays unseated
    const user = userEvent.setup()
    renderPlanScreen()

    // This pair is on the guest list, so it is one opportunity regardless of who is seated yet —
    // TT-16's fix for the comparability defect. With b unseated the pair is a missed chance, not
    // a finding, so the score is a real 0: the toggle renders, and "Nothing to score" is absent.
    expect(document.body.textContent).not.toContain('Nothing to score')
    expect(scoreToggle()).toHaveTextContent('0')

    await user.click(screen.getByRole('button', { name: 'Partner B' }))
    await user.click(screen.getByRole('button', { name: /^Place Partner B at Table 1/ }))

    // Table 1 has only 2 seats — with both partners now seated there, they are necessarily
    // adjacent (a ring of two), so this pair is a clean fit: 1 opportunity, 0 missed, fit 1.0,
    // and it is the only dimension, so the plan score is exactly 100.
    expect(scoreToggle()).toHaveTextContent('100')
  })
})

describe('clearing the allocation does not null the score while the guest list still carries partner data', () => {
  it('leaves the breakdown open, now showing an honest 0 rather than closing to violations', async () => {
    setUpScorableRoom()
    const user = userEvent.setup()
    renderPlanScreen()

    await user.click(screen.getByRole('button', { name: 'Auto-allocate' }))
    await user.click(scoreToggle())
    expect(openColumnStates()).toEqual(['breakdown'])

    await user.click(screen.getByRole('button', { name: 'Clear allocation and pins' }))
    await user.click(within(openPrompt()).getByRole('button', { name: 'Clear allocation and pins' }))

    // Clearing removes pins and seats, not guests: the same partner pair is still on the guest
    // list, so opportunities is still 1 and the score is a real 0, never null. The breakdown's
    // own guard only clears on a null score, so it is expected to stay open here.
    expect(document.body.textContent).not.toContain('Nothing to score')
    expect(openColumnStates()).toEqual(['breakdown'])
    expect(scoreToggle()).toHaveTextContent('0')
  })
})

/**
 * TT-16's review also fixed the breakdown re-opening itself: a score going null now clears
 * `breakdownOpen`, so the column cannot resurface the breakdown over a plan the user just
 * generated. The team could not reach that edge from the Plan screen's own controls, because none
 * of clear, auto-allocate, place or release change the guest list any more, only the seating —
 * confirmed just above, where clearing the allocation leaves the score non-null rather than
 * nulling it. The remaining candidate — editing the guest list so the last partner pair stops
 * existing — needs a different tab, and PlanScreen unmounts on every tab change (docs/state.md),
 * which already clears `breakdownOpen` as local component state before any edited guest list
 * could be shown here. No path within a single mount of this screen reaches a null score while
 * the breakdown is open, so that correction is left untested rather than exercised through a
 * setter no user action can trigger.
 */

describe('TT-15 regression: the table detail panel behaves exactly as before, alongside the new breakdown', () => {
  it('clicking a table opens its detail, clicking it again dismisses it', async () => {
    setUpScorableRoom()
    const user = userEvent.setup()
    renderPlanScreen()

    await selectTable(user, 'Table 1')
    expect(screen.getByRole('heading', { name: 'Table 1' })).toBeInTheDocument()

    await selectTable(user, 'Table 1')
    expect(screen.queryByRole('heading', { name: 'Table 1' })).not.toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Violations' })).toBeInTheDocument()
  })

  it('releasing a pinned guest still moves focus to the dismiss control when no rail row remains', async () => {
    // One round table with exactly one seat and one guest: once allocated, releasing the only
    // pin leaves one free seat and one unpinned guest, so the very next recompute re-seats them
    // at the same table instead of leaving them unseated — no rail row ever appears to focus
    // (the same fixture PlanScreen.test.tsx's own TT-15 regression uses).
    useTopTableStore.getState().setRoom({ roundTables: 1, seatsEach: 1, topTableSeats: 2 })
    useTopTableStore.getState().setGuests([makeGuest('solo')])
    useTopTableStore.getState().pinGuest('solo', 'round-1')
    const user = userEvent.setup()
    renderPlanScreen()

    await user.click(screen.getByRole('button', { name: 'Auto-allocate' }))
    await selectTable(user, 'Table 1')
    await user.click(screen.getByRole('button', { name: /^Release Guest solo from/ }))

    expect(screen.queryByRole('button', { name: 'Guest solo' })).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Close table detail' })).toHaveFocus()
  })
})
