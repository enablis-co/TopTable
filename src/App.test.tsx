import { describe, expect, it } from 'vitest'
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import App from './App'
import { useTopTableStore } from './store/store'

// AppHeader.test.tsx and NavRail.test.tsx build their own NavigationContext.Provider
// harnesses, which is exactly the wiring A4/A5/E1 are about — every one of those tests
// would keep passing against an AppShell that never actually renders AppHeader or NavRail,
// or a rail that isn't wired to the real navigation state at all. These tests render the
// real App and drive it through a browser-like interaction, so the header, the nav rail,
// the section switch and the context that connects them are all exercised together, not
// assumed.

// aria-current is not a plain boolean attribute: a control can be marked not
// current either by omitting it or by setting it to the literal "false".
function isMarkedCurrent(element: HTMLElement): boolean {
  const value = element.getAttribute('aria-current')
  return value !== null && value !== 'false'
}

function getNavControls(nav: HTMLElement) {
  return {
    setup: within(nav).getByRole('button', { name: 'Setup' }),
    guests: within(nav).getByRole('button', { name: 'Guests' }),
    plan: within(nav).getByRole('button', { name: 'Plan' }),
  }
}

describe('App', () => {
  it('renders a header with the wordmark, and a nav rail with Setup, Guests, Plan in order, Setup current on first render (A4, A5, E1)', () => {
    render(<App />)

    const header = screen.getByRole('banner')
    expect(within(header).getByText('Top Table')).toBeInTheDocument()

    const nav = screen.getByRole('navigation', { name: 'Sections' })
    // Accessible name, not raw textContent: the Guests row carries an aria-hidden guest
    // count as real DOM text (NavRail, TT-35), which .textContent picks up and
    // accessible-name computation correctly does not — matches NavRail.test.tsx's own
    // ordering check for the same three rows.
    const controls = within(nav).getAllByRole('button')
    expect(controls).toHaveLength(3)
    expect(controls[0]).toHaveAccessibleName('Setup')
    expect(controls[1]).toHaveAccessibleName('Guests')
    expect(controls[2]).toHaveAccessibleName('Plan')

    const { setup, guests, plan } = getNavControls(nav)
    expect(isMarkedCurrent(setup)).toBe(true)
    expect(isMarkedCurrent(guests)).toBe(false)
    expect(isMarkedCurrent(plan)).toBe(false)
  })

  it('keeps the header and nav rail, and swaps the section content when Guests is activated (A4, A5: persistent header and rail, exactly one current section)', async () => {
    const user = userEvent.setup()
    const { container } = render(<App />)
    const initialContent = container.textContent

    const opener = getNavControls(screen.getByRole('navigation', { name: 'Sections' }))
    await user.click(opener.guests)

    const header = screen.getByRole('banner')
    expect(within(header).getByText('Top Table')).toBeInTheDocument()

    const nav = screen.getByRole('navigation', { name: 'Sections' })
    const { setup, guests, plan } = getNavControls(nav)
    expect(isMarkedCurrent(guests)).toBe(true)
    expect(isMarkedCurrent(setup)).toBe(false)
    expect(isMarkedCurrent(plan)).toBe(false)

    // The header and rail's own text is identical in every section (same wordmark,
    // same three labels; "current" is carried by aria-current and the
    // underline, not by any text change), so a difference here can only come
    // from the section content actually having changed.
    expect(container.textContent).not.toBe(initialContent)
  })

  it('keeps the header and nav rail, and swaps the section content when Plan is activated (A4, A5: persistent header and rail, exactly one current section)', async () => {
    const user = userEvent.setup()
    const { container } = render(<App />)
    const initialContent = container.textContent

    const opener = getNavControls(screen.getByRole('navigation', { name: 'Sections' }))
    await user.click(opener.plan)

    const header = screen.getByRole('banner')
    expect(within(header).getByText('Top Table')).toBeInTheDocument()

    const nav = screen.getByRole('navigation', { name: 'Sections' })
    const { setup, guests, plan } = getNavControls(nav)
    expect(isMarkedCurrent(plan)).toBe(true)
    expect(isMarkedCurrent(setup)).toBe(false)
    expect(isMarkedCurrent(guests)).toBe(false)

    expect(container.textContent).not.toBe(initialContent)
  })
})

describe('App — no control for a feature this app does not build (KB-1\'s deferred list; TT-31 print, TT-34 share)', () => {
  // This guarded AppHeader alone before TT-35 split the header into AppHeader (identity
  // only) and NavRail (the section rows); a control named export, print, share or sign in
  // could now land in either one, or on a screen itself, and the guarantee this test names
  // was never about one component — it is that nothing in the whole chrome offers a feature
  // this app does not build. Rendering the real App and sweeping every section is what keeps
  // that true regardless of which file a future control is added to.
  it('offers no control named export, print, share or sign in, on any section', async () => {
    useTopTableStore.getState().reset()
    const user = userEvent.setup()
    render(<App />)

    const nav = screen.getByRole('navigation', { name: 'Sections' })
    const { setup, guests, plan } = getNavControls(nav)

    for (const tab of [setup, guests, plan]) {
      await user.click(tab)
      for (const name of [/export/i, /print/i, /share/i, /sign in/i]) {
        expect(screen.queryByRole('button', { name })).not.toBeInTheDocument()
        expect(screen.queryByRole('link', { name })).not.toBeInTheDocument()
      }
    }
  })
})
