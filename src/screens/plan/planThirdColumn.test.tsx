import { useState } from 'react'
import { describe, expect, it, beforeEach } from 'vitest'
import { act, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { PlanScreen } from './PlanScreen'
import { useTopTableStore } from '../../store/store'
import type { Guest } from '../../domain/types'
import { NavigationContext } from '../../shell/navigation'

/**
 * TT-16's third-column state machine, driven through the real `PlanScreen` rather than through
 * any one panel in isolation — the invariant (never two of violations, a table's detail, the
 * score breakdown and the pinned-guests panel at once) is enforced by handlers that each clear
 * the others' state, so only an integration test can actually see it hold. Named as its own file
 * so TT-15's `PlanScreen.test.tsx` and `planAllocation.test.tsx` are not touched by TT-16 at all.
 *
 * Written from the ticket's acceptance criteria. Does not open PlanScreen.tsx,
 * ScoreBreakdownPanel.tsx, PinnedGuestsPanel.tsx, PlanHeader.tsx or thirdColumn.ts.
 * `renderPlanScreen`/`tables`/`tableLabelled`/`selectTable`/`tableDetailPanel` follow
 * PlanScreen.test.tsx's own conventions.
 *
 * TT-16's review: `opportunities` is now a property of the guest list, never of how much of the
 * plan is seated (the fix for the comparability defect the review found). One consequence,
 * checked below where it matters: an unallocated or just-cleared plan whose guest list still
 * carries partner data no longer reads "Nothing to score".
 *
 * Part two adds a fourth column state, the pinned-guests panel, behind a second header toggle.
 * `pinnedToggle()` matches the visible label "Pinned" with a case-sensitive pattern deliberately:
 * a table carrying a pin renders a lowercase ", pinned" in its own accessible name (PlanTable),
 * which a case-insensitive match would also catch.
 *
 * TT-46: every rule scores now, hard and soft alike, and capacity always has an opportunity once
 * a room is configured (one per table, KB-8). That moves several of this file's own figures —
 * recomputed by hand from KB-8's formula at each site below, not tuned to match a run — and it
 * means null is now reached only when there are no tables at all (an unconfigured room), never
 * merely by a guest list with no partner data: a fixture that used to read "Nothing to score" for
 * that reason now scores honestly on capacity alone.
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

// Case-sensitive: a pinned table's own accessible name appends a lowercase ", pinned" (PlanTable),
// which /Pinned/i would also match. The header's stat label is capitalised "Pinned".
function pinnedToggle(): HTMLElement {
  return screen.getByRole('button', { name: /Pinned/ })
}

function queryPinnedToggle(): HTMLElement | null {
  return screen.queryByRole('button', { name: /Pinned/ })
}

function pinnedGuestsPanel(): HTMLElement {
  const dismiss = screen.getByRole('button', { name: 'Close pinned guests' })
  let node: HTMLElement | null = screen.getByRole('heading', { name: 'Pinned guests' })
  while (node && (!node.contains(dismiss) || !node.querySelector('ol, ul, [role="list"]'))) {
    node = node.parentElement
  }
  if (!node) {
    throw new Error('could not locate the pinned guests panel')
  }
  return node
}

function pinnedGuestNames(): string[] {
  return within(pinnedGuestsPanel())
    .getAllByRole('listitem')
    .map((row) => row.textContent ?? '')
}

/** Read the Pinned figure directly off the header stat, structurally — the same figure the
 *  panel's row count must always agree with (D11, AC-P4). Works whether the stat is today's
 *  inert markup (zero pinned) or the interactive toggle (one or more). */
function pinnedFigureFromHeader(): number {
  const label = screen.getByText('Pinned')
  const container = label.closest('button') ?? label.parentElement
  if (!container) {
    throw new Error('could not locate the Pinned stat container')
  }
  const valueEl = Array.from(container.querySelectorAll('p, span')).find((el) =>
    /^\d+$/.test(el.textContent?.trim() ?? ''),
  )
  if (!valueEl) {
    throw new Error('could not find the Pinned figure in the header')
  }
  return Number(valueEl.textContent?.trim())
}

/** Exactly one of the four column states is showing: violations, a table's detail, the score
 *  breakdown, or the pinned-guests panel. */
function openColumnStates(): string[] {
  const open: string[] = []
  if (screen.queryByRole('heading', { name: 'Violations' })) open.push('violations')
  if (screen.queryByRole('heading', { name: 'Score breakdown' })) open.push('breakdown')
  if (screen.queryByRole('heading', { name: 'Pinned guests' })) open.push('pinned')
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

describe('never two of the four states at once, across every transition above', () => {
  it('checks the invariant after every step of a full tour through all four states', async () => {
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

    await user.click(pinnedToggle())
    expect(openColumnStates().length).toBe(1) // pinned

    await selectTable(user, 'Table 1')
    expect(openColumnStates().length).toBe(1) // table detail, closing pinned

    await user.click(pinnedToggle())
    expect(openColumnStates().length).toBe(1) // pinned again, closing table detail

    await user.click(scoreToggle())
    expect(openColumnStates().length).toBe(1) // breakdown, closing pinned

    await user.click(pinnedToggle())
    expect(openColumnStates().length).toBe(1) // pinned, closing breakdown

    await user.click(screen.getByRole('button', { name: 'Close pinned guests' }))
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
  it('placing the second half of a partner pair moves a real, non-null score from 75 toward 100 (TT-46)', async () => {
    useTopTableStore.getState().setRoom({ roundTables: 1, seatsEach: 2, topTableSeats: 2 })
    const a = makeGuest('a', { name: 'Partner A', partnerOf: 'b' })
    const b = makeGuest('b', { name: 'Partner B', partnerOf: 'a' })
    useTopTableStore.getState().setGuests([a, b])
    useTopTableStore.getState().pinGuest('a', 'round-1') // b stays unseated
    const user = userEvent.setup()
    renderPlanScreen()

    // This pair is on the guest list, so it is one opportunity regardless of who is seated yet —
    // TT-16's fix for the comparability defect. With b unseated the pair is a missed chance, not
    // a finding: partners-adjacent scores fit 0.0 at its default weight of 1. Capacity also scores
    // now (TT-46): two tables judged (round-1, top), neither over capacity, fit 1.0 at its default
    // weight of 3. (3×1.0 + 1×0.0) / (3+1) = 0.75 → 75, hand-computed from KB-8's formula — the
    // toggle renders, and "Nothing to score" is absent.
    expect(document.body.textContent).not.toContain('Nothing to score')
    expect(scoreToggle()).toHaveTextContent('75')

    await user.click(screen.getByRole('button', { name: 'Partner B' }))
    await user.click(screen.getByRole('button', { name: /^Place Partner B at Table 1/ }))

    // Table 1 has only 2 seats — with both partners now seated there, they are necessarily
    // adjacent (a ring of two), so partners-adjacent is now a clean fit too: 1 opportunity, 0
    // missed, fit 1.0. (3×1.0 + 1×1.0) / 4 = 1.0 → the plan score is exactly 100.
    expect(scoreToggle()).toHaveTextContent('100')
  })
})

describe('clearing the allocation does not null the score while the guest list still carries partner data', () => {
  it('leaves the breakdown open, now showing an honest 75 rather than closing to violations (TT-46)', async () => {
    setUpScorableRoom()
    const user = userEvent.setup()
    renderPlanScreen()

    await user.click(screen.getByRole('button', { name: 'Auto-allocate' }))
    await user.click(scoreToggle())
    expect(openColumnStates()).toEqual(['breakdown'])

    await user.click(screen.getByRole('button', { name: 'Clear allocation and pins' }))
    await user.click(within(openPrompt()).getByRole('button', { name: 'Clear allocation and pins' }))

    // Clearing removes pins and seats, not guests: the same partner pair is still on the guest
    // list, so partners-adjacent still has one opportunity, one missed (both partners now
    // unseated), fit 0.0, weight 1. Capacity also has opportunities here (TT-46): two tables
    // judged, neither over capacity, fit 1.0, weight 3. (3×1.0 + 1×0.0) / 4 = 0.75 → 75, never
    // null. The breakdown's own guard only clears on a null score, so it is expected to stay open.
    expect(document.body.textContent).not.toContain('Nothing to score')
    expect(openColumnStates()).toEqual(['breakdown'])
    expect(scoreToggle()).toHaveTextContent('75')
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

describe('clicking Pinned opens and closes the pinned-guests panel', () => {
  it('shows the pinned panel and removes the violations panel; clicking again restores the violations panel', async () => {
    setUpScorableRoom()
    const user = userEvent.setup()
    renderPlanScreen()

    await user.click(pinnedToggle())
    expect(openColumnStates()).toEqual(['pinned'])

    await user.click(pinnedToggle())
    expect(openColumnStates()).toEqual(['violations'])
  })
})

describe('the two stat panels replace each other', () => {
  it('opening Pinned while the breakdown is open closes the breakdown, and opening the breakdown while Pinned is open closes Pinned', async () => {
    setUpScorableRoom()
    const user = userEvent.setup()
    renderPlanScreen()

    await user.click(scoreToggle())
    expect(openColumnStates()).toEqual(['breakdown'])

    await user.click(pinnedToggle())
    expect(openColumnStates()).toEqual(['pinned'])

    await user.click(scoreToggle())
    expect(openColumnStates()).toEqual(['breakdown'])
  })
})

describe('selecting a table while the pinned panel is open', () => {
  it("shows that table's detail and removes the pinned panel", async () => {
    setUpScorableRoom()
    const user = userEvent.setup()
    renderPlanScreen()

    await user.click(pinnedToggle())
    expect(openColumnStates()).toEqual(['pinned'])

    await selectTable(user, 'Table 1')

    expect(openColumnStates()).toEqual(['table-detail'])
    expect(screen.getByRole('heading', { name: 'Table 1' })).toBeInTheDocument()
  })
})

describe('"Close pinned guests" returns the column to the violations panel', () => {
  it('closes the pinned panel and shows the violations panel, returning focus to the Pinned toggle', async () => {
    setUpScorableRoom()
    const user = userEvent.setup()
    renderPlanScreen()

    await user.click(pinnedToggle())
    await user.click(screen.getByRole('button', { name: 'Close pinned guests' }))

    expect(openColumnStates()).toEqual(['violations'])
    expect(pinnedToggle()).toHaveFocus()
  })
})

describe('"Close table detail" never returns to a pinned panel left open before', () => {
  it('returns to violations even though the pinned panel was open before the table was selected', async () => {
    setUpScorableRoom()
    const user = userEvent.setup()
    renderPlanScreen()

    await user.click(pinnedToggle()) // pinned panel open
    await selectTable(user, 'Table 1') // closes pinned, opens table detail
    await user.click(screen.getByRole('button', { name: 'Close table detail' }))

    expect(openColumnStates()).toEqual(['violations'])
    expect(screen.queryByRole('heading', { name: 'Pinned guests' })).not.toBeInTheDocument()
  })
})

describe('focus stays on, and returns to, the Pinned toggle', () => {
  it('is on the toggle after opening the pinned panel, and back on it after "Close pinned guests"', async () => {
    setUpScorableRoom()
    const user = userEvent.setup()
    renderPlanScreen()

    await user.click(pinnedToggle())
    expect(pinnedToggle()).toHaveFocus()

    await user.click(screen.getByRole('button', { name: 'Close pinned guests' }))
    expect(pinnedToggle()).toHaveFocus()
  })
})

describe('the Pinned toggle stays rendered in the header while a table detail is open', () => {
  it('the Pinned toggle is still present once a table is selected', async () => {
    setUpScorableRoom()
    const user = userEvent.setup()
    renderPlanScreen()

    await selectTable(user, 'Table 1')

    expect(queryPinnedToggle()).not.toBeNull()
  })
})

describe('the pinned panel lists exactly what the header counts (D11)', () => {
  it("the panel's row count equals the header's own Pinned figure, both at the start and after a placement changes it", async () => {
    setUpScorableRoom() // two pinned guests: Partner A at Table 1, Partner B at Top table
    const user = userEvent.setup()
    renderPlanScreen()

    expect(pinnedFigureFromHeader()).toBe(2)

    await user.click(pinnedToggle())
    expect(pinnedGuestNames()).toHaveLength(2)
    expect(pinnedGuestNames().join(' ')).toContain('Partner A')
    expect(pinnedGuestNames().join(' ')).toContain('Partner B')
  })
})

describe('placing a guest while the pinned panel is open adds them to it', () => {
  it('a newly placed guest appears as a row, and the header figure grows to match', async () => {
    useTopTableStore.getState().setRoom({ roundTables: 1, seatsEach: 2, topTableSeats: 2 })
    const a = makeGuest('a', { name: 'Partner A', partnerOf: 'b' })
    const b = makeGuest('b', { name: 'Partner B', partnerOf: 'a' })
    useTopTableStore.getState().setGuests([a, b])
    useTopTableStore.getState().pinGuest('a', 'round-1') // b stays unseated
    const user = userEvent.setup()
    renderPlanScreen()

    await user.click(pinnedToggle())
    expect(pinnedGuestNames()).toHaveLength(1)
    expect(pinnedFigureFromHeader()).toBe(1)

    await user.click(screen.getByRole('button', { name: 'Partner B' }))
    await user.click(screen.getByRole('button', { name: /^Place Partner B at Table 1/ }))

    expect(pinnedGuestNames()).toHaveLength(2)
    expect(pinnedGuestNames().join(' ')).toContain('Partner B')
    expect(pinnedFigureFromHeader()).toBe(2)
  })
})

describe('"Clear allocation and pins" while the pinned panel is open', () => {
  it('returns the column to violations with no empty panel, and the Pinned stat renders no button and reads 0', async () => {
    setUpScorableRoom()
    const user = userEvent.setup()
    renderPlanScreen()

    await user.click(pinnedToggle())
    expect(openColumnStates()).toEqual(['pinned'])

    await user.click(screen.getByRole('button', { name: 'Clear allocation and pins' }))
    await user.click(within(openPrompt()).getByRole('button', { name: 'Clear allocation and pins' }))

    expect(openColumnStates()).toEqual(['violations'])
    expect(queryPinnedToggle()).toBeNull()
    expect(pinnedFigureFromHeader()).toBe(0)
  })
})

describe('the Pinned toggle works regardless of the score, which is no longer null here now that capacity always has an opportunity (TT-46)', () => {
  it('a guest list with no partner data reads a real capacity-only score, not "Nothing to score", and the Pinned toggle still opens its panel', async () => {
    useTopTableStore.getState().setRoom({ roundTables: 1, seatsEach: 2, topTableSeats: 2 })
    const solo = makeGuest('solo', { name: 'Solo Guest' })
    useTopTableStore.getState().setGuests([solo])
    useTopTableStore.getState().pinGuest('solo', 'round-1')
    const user = userEvent.setup()
    renderPlanScreen()

    // TT-16's soft-only score read null here — no partner pairs, so partners-adjacent had nothing
    // to judge. TT-46 also scores capacity: two tables judged (round-1, top), neither over
    // capacity, fit 1.0 at the hard default weight of 3 — the only contributing dimension, so the
    // mean is exactly that dimension's own fit: 100.
    expect(document.body.textContent).not.toContain('Nothing to score')
    expect(queryScoreToggle()).not.toBeNull()
    expect(scoreToggle()).toHaveTextContent('100')

    await user.click(pinnedToggle())
    expect(openColumnStates()).toEqual(['pinned'])
    expect(pinnedGuestNames().join(' ')).toContain('Solo Guest')
  })
})

/**
 * AC-C8 (TT-16): a score going null while the pinned panel is open was meant to change nothing
 * about the column or focus — the pinned panel does not read the score at all, so it was a no-op
 * precisely worth guarding against a future edit that widened the correction to cover both panels.
 *
 * TT-46 removes the premise this test was built on: with capacity also scoring, and a table
 * configured, `removeGuest` dropping the guest list's last partner pair no longer nulls the score
 * at all — capacity alone (fit 1.0, weight 3) keeps it real. Recomputed below rather than deleted,
 * because the regression it actually guards — a guest-list edit leaving the pinned column and its
 * focus untouched — still holds and is still worth keeping, whatever the score settles on.
 * `removeGuest` is still called directly on the mounted store rather than through a rendered
 * control, because no control on this screen edits guest data.
 */
describe('removeGuest dropping the guest list\'s last partner pair no longer nulls the score (TT-46) — the pinned column and its focus are untouched either way', () => {
  it('leaves the column on the pinned panel and focus on the Pinned toggle, with the score settling on a real, non-null figure', async () => {
    useTopTableStore.getState().setRoom({ roundTables: 1, seatsEach: 4, topTableSeats: 2 })
    const a = makeGuest('a', { name: 'Partner A', partnerOf: 'b' })
    const b = makeGuest('b', { name: 'Partner B', partnerOf: 'a' })
    const c = makeGuest('c', { name: 'Guest C' })
    useTopTableStore.getState().setGuests([a, b, c])
    useTopTableStore.getState().pinGuest('c', 'round-1')
    const user = userEvent.setup()
    renderPlanScreen()

    // A real, non-null score before the panel even opens — same guarantee as setUpScorableRoom,
    // from the guest list alone (F1), with nobody seated yet. Capacity (fit 1.0, weight 3) and
    // partners-adjacent (a/b both unseated, fit 0.0, weight 1) give (3×1.0 + 1×0.0) / 4 = 0.75.
    expect(document.body.textContent).not.toContain('Nothing to score')
    expect(queryScoreToggle()).not.toBeNull()
    expect(scoreToggle()).toHaveTextContent('75')

    await user.click(pinnedToggle())
    expect(openColumnStates()).toEqual(['pinned'])
    expect(pinnedToggle()).toHaveFocus()

    act(() => {
      useTopTableStore.getState().removeGuest('a')
    })

    // b's reciprocal partnerOf clears with a removed, so partners-adjacent has nothing left to
    // judge (0 opportunities, excluded) — but capacity still does: two tables judged, neither over
    // capacity, fit 1.0 at weight 3, the only contributing dimension. The mean is that dimension's
    // own fit: 100, not null (TT-46) — this is the behaviour change the review comment above no
    // longer holds for.
    expect(document.body.textContent).not.toContain('Nothing to score')
    expect(scoreToggle()).toHaveTextContent('100')
    expect(openColumnStates()).toEqual(['pinned'])
    expect(pinnedToggle()).toHaveFocus()
    expect(pinnedGuestNames().join(' ')).toContain('Guest C')
  })
})

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
