import { describe, expect, it } from 'vitest'
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import App from './App'

// AppHeader.test.tsx builds its own NavigationContext.Provider harness, which
// is exactly the wiring A4/A5/E1 are about — every one of its tests would
// keep passing against an AppShell that never actually renders AppHeader, or
// a header that isn't wired to the real navigation state at all. These tests
// render the real App and drive it through a browser-like interaction, so the
// header, the section switch and the context that connects them are all
// exercised together, not assumed.

// aria-current is not a plain boolean attribute: a control can be marked not
// current either by omitting it or by setting it to the literal "false".
function isMarkedCurrent(element: HTMLElement): boolean {
  const value = element.getAttribute('aria-current')
  return value !== null && value !== 'false'
}

function getHeaderControls(header: HTMLElement) {
  return {
    setup: within(header).getByRole('button', { name: 'Setup' }),
    guests: within(header).getByRole('button', { name: 'Guests' }),
    plan: within(header).getByRole('button', { name: 'Plan' }),
  }
}

describe('App', () => {
  it('renders a header with the wordmark and Setup, Guests, Plan in order, Setup current on first render (A4, A5, E1)', () => {
    render(<App />)

    const header = screen.getByRole('banner')
    expect(within(header).getByText('Top Table')).toBeInTheDocument()

    const controls = within(header).getAllByRole('button')
    expect(controls.map((control) => control.textContent?.trim())).toEqual([
      'Setup',
      'Guests',
      'Plan',
    ])

    const { setup, guests, plan } = getHeaderControls(header)
    expect(isMarkedCurrent(setup)).toBe(true)
    expect(isMarkedCurrent(guests)).toBe(false)
    expect(isMarkedCurrent(plan)).toBe(false)
  })

  it('keeps the header and swaps the section content when Guests is activated (A4, A5: persistent header, exactly one current section)', async () => {
    const user = userEvent.setup()
    const { container } = render(<App />)
    const initialContent = container.textContent

    const opener = getHeaderControls(screen.getByRole('banner'))
    await user.click(opener.guests)

    const header = screen.getByRole('banner')
    expect(within(header).getByText('Top Table')).toBeInTheDocument()

    const { setup, guests, plan } = getHeaderControls(header)
    expect(isMarkedCurrent(guests)).toBe(true)
    expect(isMarkedCurrent(setup)).toBe(false)
    expect(isMarkedCurrent(plan)).toBe(false)

    // The header's own text is identical in every section (same wordmark,
    // same three labels; "current" is carried by aria-current and the
    // underline, not by any text change), so a difference here can only come
    // from the section content actually having changed.
    expect(container.textContent).not.toBe(initialContent)
  })

  it('keeps the header and swaps the section content when Plan is activated (A4, A5: persistent header, exactly one current section)', async () => {
    const user = userEvent.setup()
    const { container } = render(<App />)
    const initialContent = container.textContent

    const opener = getHeaderControls(screen.getByRole('banner'))
    await user.click(opener.plan)

    const header = screen.getByRole('banner')
    expect(within(header).getByText('Top Table')).toBeInTheDocument()

    const { setup, guests, plan } = getHeaderControls(header)
    expect(isMarkedCurrent(plan)).toBe(true)
    expect(isMarkedCurrent(setup)).toBe(false)
    expect(isMarkedCurrent(guests)).toBe(false)

    expect(container.textContent).not.toBe(initialContent)
  })
})
