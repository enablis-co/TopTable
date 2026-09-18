import { useState } from 'react'
import { describe, expect, it, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { PlanScreen } from './PlanScreen'
import { useTopTableStore } from '../../store/store'
import { topTableRoleOrder } from '../../domain/seating'
import type { Guest } from '../../domain/types'
import { NavigationContext } from '../../shell/navigation'

/**
 * TT-49 — an acceptance-level pass, driven through the real `PlanScreen`, following the
 * `tt46Acceptance.*.test.tsx` / `tt48Acceptance.*.test.tsx` precedent. Written from TT-49's
 * acceptance criteria and KB-8. Does not open PlanScreen.tsx, PlanHeader.tsx,
 * ScoreBreakdownPanel.tsx, engine.ts, score.ts, contract.ts or topTable.rule.ts.
 *
 * Every other fixture in this repo's screen suites gives its guest list no protocol role at
 * all, so nothing above the unit level ever exercised this rule's own arithmetic — this is the
 * one user-visible consequence of TT-49: a protocol-role holder the guest list names but that
 * has no seat costs the top table a chance, visible in the Fit figure, without turning into a
 * hard violation on its own (KB-8: a missed chance is not a finding).
 *
 * Room: 1 round table of 4 seats plus a 2-seat top table (KB-6 requires at least two top-table
 * seats before the floorplan renders at all). Four guests: three filler guests hand-pinned to
 * the round table, and a fourth holding the protocol role `topTableRoleOrder(2)` names for a
 * two-seat table's first seat — deliberately left unpinned. `PlanScreen` seats only pinned
 * guests until Auto-allocate runs (TT-48's own fixtures establish this), so before that click the
 * role holder sits in `unseated` and their own top-table seat is empty.
 *
 * Before Auto-allocate:
 * - capacity: 2 tables judged (round-1 occ 3/cap 4, top occ 0/cap 2), neither over -> fit 1.0,
 *   weight 3.
 * - everyone-seated: opportunities = min(guests 4, totalSeats 6) = 4; missed = min(guests 4 -
 *   seated 3, freeSeats 6 - 3) = min(1, 3) = 1 -> fit 1 - 1/4 = 0.75, weight 3.
 * - top-table (TT-49): only one of the two seats `topTableRoleOrder(2)` names has its role held
 *   on this guest list (the other role has nobody), so opportunities = 1; that one seat is
 *   empty and its role is held -> missed = 1, no finding (an empty seat never fires) -> fit
 *   1 - 1/1 = 0.0, weight 3.
 * - partners-adjacent: no partner pairs on this list -> 0 opportunities, dropped from the mean.
 * - mean = (3×1.0 + 3×0.75 + 3×0.0) / 9 = 5.25/9 = 0.583333...
 * - coverage factor = 3 seated / 4 guests = 0.75.
 * - score = round(0.583333... × 0.75 × 100) = round(43.75) = 44.
 *
 * After Auto-allocate seats the role holder in their own, now-open top-table seat:
 * - everyone-seated: missed 0 -> fit 1.0. top-table: missed 0 -> fit 1.0 (opportunities still 1,
 *   unaffected by occupancy, TT-49 A1).
 * - mean = (3×1.0 + 3×1.0 + 3×1.0) / 9 = 1.0. coverage = 4/4 = 1.0. score = 100.
 *
 * Re-derived by hand against TT-49's fourth defect (a pin names a table, never a seat, so a
 * builder's own free-seat index is an artefact — see topTable.rule.test.ts): unaffected here, and
 * neither figure above moves. Exactly one guest is ever seated at this top table in either state —
 * nobody else is pinned there to compete for a free seat — so there is no second occupant whose
 * placement could shift the role holder's seat index and no scope for the artefact to appear.
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

function fitToggle(): HTMLElement {
  return screen.getByRole('button', { name: /Fit/i })
}

beforeEach(() => {
  useTopTableStore.getState().reset()
  localStorage.clear()
})

describe('TT-49 — an unseated protocol-role holder costs the top table a chance, visible in the score before Auto-allocate closes it', () => {
  it('the Fit figure drops for a genuine unseated role holder, quietly (no hard violation raised by that seat alone), and recovers once Auto-allocate seats them', async () => {
    const roleForFirstTopSeat = topTableRoleOrder(2)[0]
    if (!roleForFirstTopSeat) throw new Error('expected topTableRoleOrder(2) to name a role for a two-seat top table')

    useTopTableStore.getState().setRoom({ roundTables: 1, seatsEach: 4, topTableSeats: 2 })
    const fillers = [makeGuest('filler-0'), makeGuest('filler-1'), makeGuest('filler-2')]
    const roleHolder = makeGuest('role-holder', { role: roleForFirstTopSeat })
    useTopTableStore.getState().setGuests([...fillers, roleHolder])
    useTopTableStore.getState().pinGuest('filler-0', 'round-1')
    useTopTableStore.getState().pinGuest('filler-1', 'round-1')
    useTopTableStore.getState().pinGuest('filler-2', 'round-1')

    const user = userEvent.setup()
    renderPlanScreen()

    expect(fitToggle()).toHaveTextContent('44')
    expect(screen.getByText('Cannot be published')).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Auto-allocate' }))

    expect(fitToggle()).toHaveTextContent('100')
    expect(screen.getByText('Can be published')).toBeInTheDocument()
  })
})
