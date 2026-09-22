import { useState } from 'react'
import { describe, expect, it, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { PlanScreen } from './PlanScreen'
import { useTopTableStore } from '../../store/store'
import type { Guest } from '../../domain/types'
import { NavigationContext } from '../../shell/navigation'

/**
 * TT-53 — an acceptance-level pass over the rule-coverage line, driven through the real
 * `PlanScreen`, following the `tt46Acceptance.*` / `tt48Acceptance.*` / `tt49Acceptance.*`
 * precedent: real store, real registry, real scoring. Written from TT-53's acceptance criteria,
 * KB-2 and KB-8. Its job is the wiring, which no unit test sees. Does not open PlanScreen.tsx,
 * PlanHeader.tsx, RuleCoverageLine.tsx, RuleCoverageLine.module.css, ruleCoverage.ts,
 * ViolationsPanel.tsx, ScoreBreakdownPanel.tsx, engine.ts, score.ts or contract.ts.
 *
 * The room and guest list below are the clean scenario `tt48Acceptance.coverage.test.tsx`
 * establishes as reaching a 100% Fit and "Can be published" once Auto-allocate runs: 5 round
 * tables of 8 seats plus a 2-seat top table (42 seats), 10 guests, none holding a protocol role
 * and none partnered. All this file needs from that scenario is that the plan ends up scored at
 * all — the coverage line's own text does not depend on the Fit percentage.
 *
 * The rendered coverage text is checked against `document.body.textContent` (the same idiom
 * `PlanScreen.test.tsx` already uses for the violations panel's own rule count), rather than a
 * single queried element: the two numbers each get their own wrapping element for tabular
 * digits, so the string is never one text node, and a query that only looks at a node's own
 * direct text would not see it — this repo's accessible-name notes describe the identical trap
 * for computing a name from content. Checking the whole document's text also exercises the
 * explicit spacing the words and numbers need: collapse it and the substring below becomes
 * "4of10rules built" and the assertion fails.
 *
 * **Test 1 pins the registry's count today, 4** (capacity, top-table, partners-adjacent,
 * everyone-seated — TT-47) **against the declared 10.** It is expected to fail, honestly, the
 * moment TT-17 registers a fifth rule, and again as each of TT-18 to TT-22 lands — a one-line
 * edit to the literal number here each time, not a regression, and exactly the prompt to look at
 * the coverage line as the registry grows toward the declared count.
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

describe('TT-53 — the rule-coverage line, driven end to end through the real PlanScreen', () => {
  it(
    'a scored, publishable plan shows "4 of 10 rules built" beside the Fit figure; the ' +
      'violations panel still reads exactly "4 rules registered", carrying no denominator of ' +
      'its own; and the publishability line still accompanies the figure (pins today\'s ' +
      'registered count of 4 — expected to need a one-line bump, not a fix, as each of TT-17 to ' +
      'TT-22 raises it toward the declared 10)',
    async () => {
      useTopTableStore.getState().setRoom({ roundTables: 5, seatsEach: 8, topTableSeats: 2 })
      useTopTableStore.getState().setGuests(makeGuests(10))
      const user = userEvent.setup()
      renderPlanScreen()

      await user.click(screen.getByRole('button', { name: 'Auto-allocate' }))

      // The real coverage, exactly as it reads today.
      expect(document.body.textContent).toContain('4 of 10 rules built')

      // The violations panel's own "N rules registered" line, untouched by this ticket, reads
      // exactly what it always has. Matched on the paragraph's whole textContent rather than by
      // plain text — its rule count is a tabular-figure span, so the string is split across
      // elements — and matched exactly rather than as a substring, which is what makes this the
      // guard that the panel gained no denominator of its own: any suffix fails it.
      const registeredLine = screen.getByText(
        (_content, element) => element?.tagName === 'P' && element.textContent === '4 rules registered',
      )
      expect(registeredLine).toBeInTheDocument()

      // The publishability line still accompanies the figure.
      expect(screen.getByText('Can be published')).toBeInTheDocument()
    },
  )

  it('a configured room with no guest list shows "Nothing to score", no Fit toggle and no coverage line', () => {
    useTopTableStore.getState().setRoom({ roundTables: 5, seatsEach: 8, topTableSeats: 2 })
    // Guests left at the first-visit default: a configured room, deliberately no guest list.
    renderPlanScreen()

    expect(screen.getByText('Nothing to score')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /Fit/i })).not.toBeInTheDocument()
    expect(document.body.textContent).not.toContain('rules built')
  })
})
