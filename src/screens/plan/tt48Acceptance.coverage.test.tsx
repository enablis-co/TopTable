import { useState } from 'react'
import { describe, expect, it, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { PlanScreen } from './PlanScreen'
import { useTopTableStore } from '../../store/store'
import type { Guest } from '../../domain/types'
import { NavigationContext } from '../../shell/navigation'

/**
 * TT-48 — end-to-end pass over the coverage factor (KB-8: "plan score = fit × (guests seated ÷
 * guests)"), driven through the real `PlanScreen`, following the `tt46Acceptance.*.test.tsx`
 * precedent. Written from TT-48's acceptance criteria and KB-8. Does not open PlanScreen.tsx,
 * PlanHeader.tsx, ScoreBreakdownPanel.tsx, engine.ts, score.ts, contract.ts or the planOccupancy
 * addition to seating.ts.
 *
 * The room is 5 round tables of 8 seats plus a 2-seat top table (42 seats), with 10 guests, none
 * of them holding a protocol role and none of them partnered — so partners-adjacent reports 0
 * opportunities throughout (no partner pair to judge) and drops out of the mean. Top-table (TT-49)
 * does not drop out: its opportunities are the table's own capacity, flat, so it always
 * contributes — this guest list holds no protocol role, so its empty seats are never a missed
 * chance, and it scores a clean fit 1.0 throughout. Capacity, everyone-seated and top-table are
 * the three dimensions in the mean below.
 *
 * Before allocation (no pins at all), every guest is unseated:
 * - capacity: 6 tables (5 round + 1 top) judged, none over capacity -> fit 1.0, weight 3.
 * - everyone-seated: opportunities = min(guests 10, totalSeats 42) = 10; missed = min(unseated
 *   effective 10, free seats 42) = 10 -> fit 0.0, weight 3.
 * - top-table: capacity 2, empty, list holds no protocol role -> opportunities 2, missed 0,
 *   fit 1.0, weight 3.
 * - mean = (3×1.0 + 3×0.0 + 3×1.0) / 9 = 6/9 = 0.666666...  Coverage factor = 0 seated / 10
 *   guests = 0.
 * - score = round(0.666666... × 0 × 100) = 0 — unchanged by TT-49, the coverage factor of 0
 *   dominates regardless of the mean. Hard violation count = 1 (everyone-seated) -> unpublishable.
 *
 * After Auto-allocate, capacity still can't be breached and there are more than enough round-table
 * seats for all 10 guests, and none of them qualify for the reserved top table, so all 10 land on
 * round tables and the top table stays empty:
 * - capacity: fit 1.0. everyone-seated: 10 seated, 0 missed -> fit 1.0. top-table: capacity 2,
 *   still empty, still no protocol role on the list -> fit 1.0.
 * - mean = (3×1.0 + 3×1.0 + 3×1.0) / 9 = 1.0 — unchanged by TT-49, every dimension was already
 *   1.0. Coverage factor = 10/10 = 1. score = round(1.0 × 1 × 100) = 100.
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

describe('TT-48 — the coverage factor, driven end to end through the real PlanScreen', () => {
  it('a configured room with a guest list and no allocation reads 0% Fit and Cannot be published', () => {
    useTopTableStore.getState().setRoom({ roundTables: 5, seatsEach: 8, topTableSeats: 2 })
    useTopTableStore.getState().setGuests(makeGuests(10))
    renderPlanScreen()

    const fitToggle = screen.getByRole('button', { name: /Fit/i })
    expect(fitToggle).toHaveTextContent('0')
    expect(screen.getByText('Cannot be published')).toBeInTheDocument()
  })

  it('after Auto-allocate on a room with spare seats, Fit rises above zero and every violation clears (TT-47)', async () => {
    useTopTableStore.getState().setRoom({ roundTables: 5, seatsEach: 8, topTableSeats: 2 })
    useTopTableStore.getState().setGuests(makeGuests(10))
    const user = userEvent.setup()
    renderPlanScreen()

    await user.click(screen.getByRole('button', { name: 'Auto-allocate' }))

    const fitToggle = screen.getByRole('button', { name: /Fit/i })
    expect(fitToggle).toHaveTextContent('100')
    expect(screen.getByText('Can be published')).toBeInTheDocument()
    expect(screen.getByText('No violations.')).toBeInTheDocument()
  })

  it('a configured room with no guests at all reads "Nothing to score", with no Fit toggle and no percentage', () => {
    useTopTableStore.getState().setRoom({ roundTables: 5, seatsEach: 8, topTableSeats: 2 })
    // Guests left at the first-visit default: a configured room, deliberately no guest list.
    renderPlanScreen()

    expect(screen.getByText('Nothing to score')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /Fit/i })).not.toBeInTheDocument()
    expect(screen.queryByText('0%')).not.toBeInTheDocument()
  })

  it('the score breakdown on an unfinished plan lists everyone-seated as a Hard row with its missed count', async () => {
    useTopTableStore.getState().setRoom({ roundTables: 5, seatsEach: 8, topTableSeats: 2 })
    useTopTableStore.getState().setGuests(makeGuests(10))
    const user = userEvent.setup()
    renderPlanScreen()

    await user.click(screen.getByRole('button', { name: /Fit/i }))

    expect(screen.getByRole('heading', { name: 'Score breakdown' })).toBeInTheDocument()
    const ruleLabel = screen.getByText('Every guest has a seat while the room still has an empty one')
    const row = ruleLabel.closest('li')
    expect(row).not.toBeNull()
    expect(row).toHaveTextContent('Hard')
    expect(row).toHaveTextContent('10')
    expect(row).toHaveTextContent('missed')
  })
})
