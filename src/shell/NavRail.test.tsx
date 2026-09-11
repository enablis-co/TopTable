import { describe, expect, it, beforeEach } from 'vitest'
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useState } from 'react'
import { NavRail } from './NavRail'
import { NavigationContext, TABS, type Tab } from './navigation'
import { useTopTableStore } from '../store/store'
import type { Guest } from '../domain/types'

/**
 * TT-35 AC18: exactly Setup, Guests and Plan, in journey order — none of the handoff's
 * Tables, Rules or Catering rows — aria-current tracking the active section, and a guest
 * count that renders on the Guests row even at zero.
 *
 * The count is a visual-only readout (aria-hidden in NavRail.tsx), so every row keeps the
 * same accessible name it had in AppHeader — "Guests", not "Guests 70" — and every existing
 * global `getByRole('button', { name: 'Guests' })` elsewhere in the app keeps working.
 */

function Harness({ initialTab = 'setup' }: { initialTab?: Tab }) {
  const [tab, setTab] = useState<Tab>(initialTab)
  return (
    <NavigationContext.Provider value={{ tab, goTo: setTab }}>
      <NavRail />
    </NavigationContext.Provider>
  )
}

// aria-current is not a plain boolean attribute: a control can be marked not
// current either by omitting it or by setting it to the literal "false".
function isMarkedCurrent(element: HTMLElement): boolean {
  const value = element.getAttribute('aria-current')
  return value !== null && value !== 'false'
}

function makeGuest(id: string): Guest {
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
  }
}

beforeEach(() => {
  useTopTableStore.getState().reset()
})

describe('NavRail', () => {
  it('offers exactly three rows, named Setup, Guests and Plan, in journey order', () => {
    render(<Harness />)
    const rows = screen.getAllByRole('button')
    expect(rows).toHaveLength(3)
    expect(rows[0]).toHaveAccessibleName('Setup')
    expect(rows[1]).toHaveAccessibleName('Guests')
    expect(rows[2]).toHaveAccessibleName('Plan')
  })

  it('names no row Tables, Rules or Catering', () => {
    render(<Harness />)
    for (const name of [/tables/i, /rules/i, /catering/i]) {
      expect(screen.queryByRole('button', { name })).not.toBeInTheDocument()
    }
  })

  it('marks Setup as current on first render, and Guests and Plan as not current', () => {
    render(<Harness />)
    expect(isMarkedCurrent(screen.getByRole('button', { name: 'Setup' }))).toBe(true)
    expect(isMarkedCurrent(screen.getByRole('button', { name: 'Guests' }))).toBe(false)
    expect(isMarkedCurrent(screen.getByRole('button', { name: 'Plan' }))).toBe(false)
  })

  it('makes Guests current and Setup not current when Guests is activated', async () => {
    const user = userEvent.setup()
    render(<Harness />)
    await user.click(screen.getByRole('button', { name: 'Guests' }))
    expect(isMarkedCurrent(screen.getByRole('button', { name: 'Guests' }))).toBe(true)
    expect(isMarkedCurrent(screen.getByRole('button', { name: 'Setup' }))).toBe(false)
    expect(isMarkedCurrent(screen.getByRole('button', { name: 'Plan' }))).toBe(false)
  })

  it('makes Plan current and the others not current when Plan is activated', async () => {
    const user = userEvent.setup()
    render(<Harness />)
    await user.click(screen.getByRole('button', { name: 'Plan' }))
    expect(isMarkedCurrent(screen.getByRole('button', { name: 'Plan' }))).toBe(true)
    expect(isMarkedCurrent(screen.getByRole('button', { name: 'Setup' }))).toBe(false)
    expect(isMarkedCurrent(screen.getByRole('button', { name: 'Guests' }))).toBe(false)
  })

  it('renders all three rows regardless of which section is current', () => {
    for (const tab of TABS) {
      const { unmount } = render(<Harness initialTab={tab} />)
      expect(screen.getByRole('button', { name: 'Setup' })).toBeInTheDocument()
      expect(screen.getByRole('button', { name: 'Guests' })).toBeInTheDocument()
      expect(screen.getByRole('button', { name: 'Plan' })).toBeInTheDocument()
      unmount()
    }
  })

  it('shows the guest count on the Guests row, and shows zero rather than hiding it', () => {
    useTopTableStore.getState().setGuests([])
    render(<Harness />)
    const guestsRow = screen.getByRole('button', { name: 'Guests' })
    expect(within(guestsRow).getByText('0')).toBeInTheDocument()
  })

  it('updates the guest count as the store changes', () => {
    useTopTableStore.getState().setGuests([makeGuest('g-1'), makeGuest('g-2')])
    render(<Harness />)
    const guestsRow = screen.getByRole('button', { name: 'Guests' })
    expect(within(guestsRow).getByText('2')).toBeInTheDocument()
  })

  it('shows no count on the Setup or Plan rows', () => {
    useTopTableStore.getState().setGuests([makeGuest('g-1')])
    render(<Harness />)
    const setupRow = screen.getByRole('button', { name: 'Setup' })
    const planRow = screen.getByRole('button', { name: 'Plan' })
    expect(within(setupRow).queryByText(/^\d+$/)).not.toBeInTheDocument()
    expect(within(planRow).queryByText(/^\d+$/)).not.toBeInTheDocument()
  })

  it('reaches all three rows in a keyboard tab sweep', async () => {
    const user = userEvent.setup()
    render(<Harness />)
    await user.tab()
    expect(screen.getByRole('button', { name: 'Setup' })).toHaveFocus()
    await user.tab()
    expect(screen.getByRole('button', { name: 'Guests' })).toHaveFocus()
    await user.tab()
    expect(screen.getByRole('button', { name: 'Plan' })).toHaveFocus()
  })
})
