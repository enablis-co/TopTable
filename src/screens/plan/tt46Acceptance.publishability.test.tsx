import { useState } from 'react'
import { describe, expect, it, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { PlanScreen } from './PlanScreen'
import { useTopTableStore } from '../../store/store'
import type { Guest } from '../../domain/types'
import { NavigationContext } from '../../shell/navigation'

/**
 * TT-46 — independent end-to-end pass over A7 and A8, written from the ticket's acceptance
 * criteria and KB-8 "The score is not permission", driving the real `PlanScreen` rather than
 * `PlanHeader` or `ScoreBreakdownPanel` in isolation, following the `tt36Acceptance.*.test.tsx`
 * precedent. Does not open PlanScreen.tsx, PlanHeader.tsx, ScoreBreakdownPanel.tsx, engine.ts,
 * score.ts or contract.ts.
 *
 * The hard violation here is a table hand-pinned past its own capacity — the same, already
 * established route PlanScreen.test.tsx uses ("a hard violation marks the table and lists in the
 * panel"): nine guests pinned to a single eight-seat round table, no Auto-allocate needed, since a
 * pin alone is enough to seat (and here, overflow) a guest.
 *
 * The Fit figure is hand-computed from KB-8's formula, never read back from the render: nine
 * round tables plus the top table PlanScreen requires configured (KB-6 requires at least a
 * two-seat top table before the floorplan itself renders at all) makes ten tables judged; only one
 * round table is ever seated and nobody is ever pinned to the empty top table, so this guest list
 * (no partner pairs, no protocol roles) leaves top-table and partners-adjacent with nothing to
 * judge (0 opportunities each, dropped from the mean).
 *
 * TT-47 registers a second hard rule, everyone-seated, into the same pipeline, and this fixture —
 * nine guests hand-pinned to an eight-seat table — trips it too: the ninth guest lands in
 * round-1's `overflow`, which is exactly as "no real seat" as being on the unseated list, and the
 * other eight round tables plus the top table are sitting empty. So this test's own hard violation
 * count moves from one to two, and both the Fit figure and the flow needed to clear every hard
 * violation move with it:
 *
 * - capacity: 10 tables, 1 over capacity (round-1: 9 seated+overflow against a capacity of 8) ->
 *   fit 1 - 1/10 = 0.9, weight 3.
 * - everyone-seated: guests 9 (8 seated + 1 overflow), totalSeats 74 (9×8 + 2), seated 8, free
 *   seats 66, so opportunities = min(9, 74) = 9 and missed = min(9-8, 66) = 1 -> fit 1 - 1/9 =
 *   8/9, weight 3.
 * - mean = (3×0.9 + 3×(8/9)) / 6 = 161/180 = 0.894444...
 * - TT-48's coverage factor is real `planOccupancy`, not a fixture: 8 of the 9 guests are seated,
 *   so the factor is 8/9. score = round(0.894444... × 8/9 × 100) = round(79.5061...) = 80.
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

beforeEach(() => {
  useTopTableStore.getState().reset()
  localStorage.clear()
})

describe('TT-46 A7/A8 — publishability, driven end to end through the real PlanScreen', () => {
  it('a hard violation makes the plan unpublishable however high the score, appears wherever the score does, and flips once every hard violation is resolved', async () => {
    useTopTableStore.getState().setRoom({ roundTables: 9, seatsEach: 8, topTableSeats: 2 })
    useTopTableStore.getState().setGuests(makeGuests(9))
    for (let index = 0; index < 9; index += 1) {
      useTopTableStore.getState().pinGuest(`g-${index}`, 'round-1')
    }
    const user = userEvent.setup()
    renderPlanScreen()

    const fitToggle = screen.getByRole('button', { name: /Fit/i })
    expect(fitToggle).toHaveTextContent('80')
    expect(screen.getAllByText('Cannot be published')).toHaveLength(1)
    expect(screen.queryByText('Can be published')).not.toBeInTheDocument()

    // A7: the words appear wherever the score does — opening the breakdown adds a second copy
    // beside the header's own, rather than replacing it.
    await user.click(fitToggle)
    expect(screen.getByRole('heading', { name: 'Score breakdown' })).toBeInTheDocument()
    expect(screen.getAllByText('Cannot be published')).toHaveLength(2)

    // Back to violations, then release the one guest a hand pin pushed past capacity — the same
    // control PlanScreen.test.tsx's own over-capacity regression uses.
    await user.click(fitToggle)
    await selectTable(user, 'Table 1')
    const releaseButton = screen.getByRole('button', { name: /^Release .+ from Table 1, over capacity$/ })
    await user.click(releaseButton)

    // TT-47: releasing that ninth guest's pin clears the capacity violation, but the guest is now
    // genuinely unseated with dozens of empty seats elsewhere in the room — the everyone-seated
    // rule (47-A2) picks up exactly where capacity left off, so the plan is still not publishable
    // from this one action alone.
    expect(screen.getAllByText('Cannot be published')).toHaveLength(1)
    expect(screen.queryByText('Can be published')).not.toBeInTheDocument()

    // 47-A6: Auto-allocate seats the released guest into one of those free seats, clearing the
    // last hard violation without any further hand placement.
    await user.click(screen.getByRole('button', { name: 'Auto-allocate' }))

    expect(screen.getAllByText('Can be published')).toHaveLength(1)
    expect(screen.queryByText('Cannot be published')).not.toBeInTheDocument()
  })
})
