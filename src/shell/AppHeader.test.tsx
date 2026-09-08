import { describe, expect, it } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useState } from 'react'
import { AppHeader } from './AppHeader'
import { NavigationContext, TABS, type Tab } from './navigation'

function Harness({ initialTab = 'setup' }: { initialTab?: Tab }) {
  const [tab, setTab] = useState<Tab>(initialTab)
  return (
    <NavigationContext.Provider value={{ tab, goTo: setTab }}>
      <AppHeader />
    </NavigationContext.Provider>
  )
}

// aria-current is not a plain boolean attribute: a control can be marked not
// current either by omitting it or by setting it to the literal "false".
// Checking both keeps this test from assuming which convention is used.
function isMarkedCurrent(element: HTMLElement): boolean {
  const value = element.getAttribute('aria-current')
  return value !== null && value !== 'false'
}

describe('AppHeader', () => {
  it('shows the product name "Top Table" exactly once', () => {
    render(<Harness />)
    expect(screen.getAllByText('Top Table')).toHaveLength(1)
  })

  it('offers three controls named Setup, Guests and Plan, in that order', () => {
    render(<Harness />)
    const controls = screen.getAllByRole('button')
    expect(controls.map((control) => control.textContent?.trim())).toEqual([
      'Setup',
      'Guests',
      'Plan',
    ])
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

  it('renders the header in full regardless of which section is current', () => {
    for (const tab of TABS) {
      const { unmount } = render(<Harness initialTab={tab} />)
      expect(screen.getByText('Top Table')).toBeInTheDocument()
      expect(screen.getByRole('button', { name: 'Setup' })).toBeInTheDocument()
      expect(screen.getByRole('button', { name: 'Guests' })).toBeInTheDocument()
      expect(screen.getByRole('button', { name: 'Plan' })).toBeInTheDocument()
      unmount()
    }
  })

  it('offers no control named export, print, share or sign in', () => {
    render(<Harness />)
    for (const name of ['export', 'print', 'share', 'sign in']) {
      const pattern = new RegExp(name, 'i')
      expect(screen.queryByRole('button', { name: pattern })).not.toBeInTheDocument()
      expect(screen.queryByRole('link', { name: pattern })).not.toBeInTheDocument()
    }
  })

  it('reaches all three section controls in a keyboard tab sweep', async () => {
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
