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
 * round table is ever seated and nobody is ever pinned to the empty top table, so capacity is the
 * only rule with anything to judge (the top table rule has no occupied seat to judge, and this
 * guest list carries no partner pairs). One over-capacity table out of ten judged is 1 − 1/10 =
 * 0.9, a 90% Fit regardless of what the hard default weight for capacity happens to be, since it
 * is the only contributing dimension.
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
  it('a hard violation makes the plan unpublishable however high the score, appears wherever the score does, and flips the moment the violation is removed', async () => {
    useTopTableStore.getState().setRoom({ roundTables: 9, seatsEach: 8, topTableSeats: 2 })
    useTopTableStore.getState().setGuests(makeGuests(9))
    for (let index = 0; index < 9; index += 1) {
      useTopTableStore.getState().pinGuest(`g-${index}`, 'round-1')
    }
    const user = userEvent.setup()
    renderPlanScreen()

    const fitToggle = screen.getByRole('button', { name: /Fit/i })
    expect(fitToggle).toHaveTextContent('90')
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

    // No further interaction: the words flip on their own once the underlying violation is gone.
    expect(screen.getAllByText('Can be published')).toHaveLength(1)
    expect(screen.queryByText('Cannot be published')).not.toBeInTheDocument()
  })
})
