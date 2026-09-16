import { useState } from 'react'
import { describe, expect, it, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { PlanScreen } from './PlanScreen'
import { useTopTableStore } from '../../store/store'
import type { Guest } from '../../domain/types'
import { KNOWN_DIETARY_PREFERENCES } from '../../domain/types'
import { NavigationContext } from '../../shell/navigation'

/**
 * TT-36 — independent second pass on the guest summary's content and its interaction with
 * Escape, written from the ticket's acceptance criteria and KB-3, without opening PlanScreen.tsx,
 * UnseatedRail.tsx, GuestHoverCard.tsx or their stylesheets. This exercises the whole wiring
 * (store → PlanScreen → rail/floorplan → summary) rather than any one file in isolation, so it
 * reads at the level the criteria themselves are written at: guests, tables, hovering, focusing.
 *
 * Weighted toward:
 *   - C4: a guest with an allergy *and* a dietary preference, so the test distinguishes the two
 *     rather than passing because neither is present. Every one of KB-3's known dietary
 *     preferences is checked for, not just the one the fixture happens to carry.
 *   - C9: Escape closing an open summary without touching an unrelated rail selection, and —
 *     separately — Escape with no summary open still doing its existing job of clearing a
 *     selection.
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

beforeEach(() => {
  useTopTableStore.getState().reset()
  localStorage.clear()
})

describe('TT-36 C4 — the summary never shows a dietary preference, for a guest who also carries an allergy', () => {
  it('hovering a rail guest with every known dietary preference and one allergy shows the allergy, and none of the diets', async () => {
    useTopTableStore.getState().setRoom({ roundTables: 1, seatsEach: 4, topTableSeats: 2 })
    useTopTableStore.getState().setGuests([
      makeGuest('g-0', {
        name: 'Priya Shah',
        allergies: ['shellfish'],
        dietaryPreferences: [...KNOWN_DIETARY_PREFERENCES],
      }),
    ])
    const user = userEvent.setup()
    renderPlanScreen()

    await user.hover(screen.getByRole('button', { name: 'Priya Shah' }))

    const card = screen.getByRole('group', { name: /Priya Shah/ })
    expect(card.textContent).toMatch(/shellfish/i)
    for (const preference of KNOWN_DIETARY_PREFERENCES) {
      expect(card.textContent).not.toMatch(new RegExp(preference, 'i'))
    }
    expect(card.textContent).not.toMatch(/dietary/i)
    expect(card.textContent).not.toMatch(/\bdiet\b/i)
  })

  it('a guest whose only recorded fact is a dietary preference shows an otherwise-sparse summary, never the diet itself', async () => {
    useTopTableStore.getState().setRoom({ roundTables: 1, seatsEach: 4, topTableSeats: 2 })
    useTopTableStore.getState().setGuests([
      makeGuest('g-0', { name: 'Danny Whitaker', dietaryPreferences: ['vegan'] }),
    ])
    const user = userEvent.setup()
    renderPlanScreen()

    await user.hover(screen.getByRole('button', { name: 'Danny Whitaker' }))

    const card = screen.getByRole('group', { name: /Danny Whitaker/ })
    expect(card.textContent).not.toMatch(/vegan/i)
  })

  it('the same holds on the floorplan: an occupied chair\'s summary never names a dietary preference either', async () => {
    useTopTableStore.getState().setRoom({ roundTables: 1, seatsEach: 4, topTableSeats: 2 })
    useTopTableStore.getState().setGuests([
      makeGuest('g-0', { name: 'Maureen Shah', allergies: ['nuts'], dietaryPreferences: ['halal', 'pescatarian'] }),
    ])
    useTopTableStore.getState().pinGuest('g-0', 'round-1')
    const user = userEvent.setup()
    renderPlanScreen()

    const chair = screen.getByRole('img', { name: /Maureen Shah/ })
    await user.hover(chair)

    const card = screen.getByRole('group', { name: /Maureen Shah/ })
    expect(card.textContent).toMatch(/nuts/i)
    expect(card.textContent).not.toMatch(/halal/i)
    expect(card.textContent).not.toMatch(/pescatarian/i)
  })
})

describe('TT-36 C9 — Escape closes an open summary without clearing a rail selection that was not being made', () => {
  it('a summary opened by hovering a different guest is dismissed by Escape, and the selected guest stays selected', async () => {
    useTopTableStore.getState().setRoom({ roundTables: 1, seatsEach: 4, topTableSeats: 2 })
    useTopTableStore.getState().setGuests([makeGuest('g-0', { name: 'Ana Ferreira' }), makeGuest('g-1', { name: 'Ben Ojo' })])
    const user = userEvent.setup()
    renderPlanScreen()

    await user.click(screen.getByRole('button', { name: 'Ana Ferreira' }))
    expect(screen.getByRole('button', { name: 'Ana Ferreira' })).toHaveAttribute('aria-pressed', 'true')

    await user.hover(screen.getByRole('button', { name: 'Ben Ojo' }))
    expect(screen.getByRole('group', { name: /Ben Ojo/ })).toBeInTheDocument()

    await user.keyboard('{Escape}')

    expect(screen.queryByRole('group', { name: /Ben Ojo/ })).not.toBeInTheDocument()
    // The selection Escape must not have touched.
    expect(screen.getByRole('button', { name: 'Ana Ferreira' })).toHaveAttribute('aria-pressed', 'true')
    expect(useTopTableStore.getState().pins).toEqual([])
  })

  it('with no summary open, Escape still clears an existing rail selection — the pre-existing behaviour is unchanged', async () => {
    useTopTableStore.getState().setRoom({ roundTables: 1, seatsEach: 4, topTableSeats: 2 })
    useTopTableStore.getState().setGuests([makeGuest('g-0', { name: 'Ana Ferreira' })])
    const user = userEvent.setup()
    renderPlanScreen()

    await user.click(screen.getByRole('button', { name: 'Ana Ferreira' }))
    expect(screen.getByRole('button', { name: 'Ana Ferreira' })).toHaveAttribute('aria-pressed', 'true')

    await user.keyboard('{Escape}')

    expect(screen.getByRole('button', { name: 'Ana Ferreira' })).toHaveAttribute('aria-pressed', 'false')
  })

  it('a second Escape, after the summary is already closed, goes on to clear the selection', async () => {
    useTopTableStore.getState().setRoom({ roundTables: 1, seatsEach: 4, topTableSeats: 2 })
    useTopTableStore.getState().setGuests([makeGuest('g-0', { name: 'Ana Ferreira' }), makeGuest('g-1', { name: 'Ben Ojo' })])
    const user = userEvent.setup()
    renderPlanScreen()

    await user.click(screen.getByRole('button', { name: 'Ana Ferreira' }))
    await user.hover(screen.getByRole('button', { name: 'Ben Ojo' }))
    expect(screen.getByRole('group', { name: /Ben Ojo/ })).toBeInTheDocument()

    await user.keyboard('{Escape}')
    expect(screen.getByRole('button', { name: 'Ana Ferreira' })).toHaveAttribute('aria-pressed', 'true')

    await user.keyboard('{Escape}')
    expect(screen.getByRole('button', { name: 'Ana Ferreira' })).toHaveAttribute('aria-pressed', 'false')
  })

  it('Escape with neither a summary open nor a selection made does nothing, and does not throw', async () => {
    useTopTableStore.getState().setRoom({ roundTables: 1, seatsEach: 4, topTableSeats: 2 })
    useTopTableStore.getState().setGuests([makeGuest('g-0', { name: 'Ana Ferreira' })])
    const user = userEvent.setup()
    renderPlanScreen()

    await user.keyboard('{Escape}')

    expect(screen.getByRole('button', { name: 'Ana Ferreira' })).toBeInTheDocument()
    expect(useTopTableStore.getState().pins).toEqual([])
  })
})
