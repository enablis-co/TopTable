import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useState } from 'react'
import { NavRail } from './NavRail'
import { NavigationContext, type Tab } from './navigation'
import { useTopTableStore } from '../store/store'

/**
 * TT-42 ("The version in the rail"). A separate file from NavRail.test.tsx (A20: that file
 * "must still pass, untouched" — TT-35's own AC18 already fixes its row count, names and
 * order, and adding version assertions there would put a second requirement in a file this
 * ticket is forbidden from editing). This file builds the same NavigationContext.Provider
 * harness NavRail.test.tsx uses, read there for the pattern only.
 *
 * Never opens appVersion.ts, NavRail.tsx or NavRail.module.css.
 */

function Harness({ initialTab = 'setup' }: { initialTab?: Tab }) {
  const [tab, setTab] = useState<Tab>(initialTab)
  return (
    <NavigationContext.Provider value={{ tab, goTo: setTab }}>
      <NavRail />
    </NavigationContext.Provider>
  )
}

function renderRail() {
  render(<Harness />)
  return screen.getByRole('navigation', { name: 'Sections' })
}

function getRows(nav: HTMLElement) {
  return {
    setup: within(nav).getByRole('button', { name: 'Setup' }),
    guests: within(nav).getByRole('button', { name: 'Guests' }),
    plan: within(nav).getByRole('button', { name: 'Plan' }),
  }
}

beforeEach(() => {
  useTopTableStore.getState().reset()
})

afterEach(() => {
  vi.unstubAllEnvs()
})

describe('NavRail — the version stamp (VITE_APP_VERSION set)', () => {
  beforeEach(() => {
    vi.stubEnv('VITE_APP_VERSION', 'v0.7.0')
  })

  it('T7: shows the version the build was cut at, as exact text (A15)', () => {
    renderRail()
    expect(screen.getByText('v0.7.0')).toBeInTheDocument()
  })

  it('T8: the version is not a button, and the rail still offers exactly three, named Setup, Guests, Plan (A19)', () => {
    const nav = renderRail()
    const buttons = within(nav).getAllByRole('button')
    expect(buttons).toHaveLength(3)
    expect(screen.getByText('v0.7.0').closest('button')).toBeNull()
    const { setup, guests, plan } = getRows(nav)
    expect(setup).toHaveAccessibleName('Setup')
    expect(guests).toHaveAccessibleName('Guests')
    expect(plan).toHaveAccessibleName('Plan')
  })

  it('T9: the version is not inside any of the three nav rows (A19)', () => {
    const nav = renderRail()
    const { setup, guests, plan } = getRows(nav)
    for (const row of [setup, guests, plan]) {
      expect(within(row).queryByText(/^v\d/)).not.toBeInTheDocument()
    }
  })

  it('T10: the version is not focusable — a full tab sweep reaches the three rows and stops there (A19)', async () => {
    const nav = renderRail()
    const { setup, guests, plan } = getRows(nav)
    const user = userEvent.setup()

    await user.tab()
    expect(setup).toHaveFocus()
    await user.tab()
    expect(guests).toHaveFocus()
    await user.tab()
    expect(plan).toHaveFocus()

    // Nothing else in the rail can take focus after the last row: if the version stamp were
    // focusable, this next tab would land on it instead of leaving Plan.
    await user.tab()
    expect(plan).not.toHaveFocus()
    expect(screen.getByText('v0.7.0')).not.toHaveFocus()
  })

  it('T11: the version is not hidden from assistive technology — no aria-hidden="true" on it or any ancestor within the rail (A21)', () => {
    const nav = renderRail()
    let node: HTMLElement | null = screen.getByText('v0.7.0')
    while (node && node !== nav.parentElement) {
      expect(node.getAttribute('aria-hidden')).not.toBe('true')
      if (node === nav) break
      node = node.parentElement
    }
  })

  it('T12: is announced with context — the value sits alongside a visually hidden "Version" label, not bare (A21, A2)', () => {
    renderRail()
    const value = screen.getByText('v0.7.0')
    // The contract fixes the stamp as a <p> containing the "Version " prefix and the value
    // as sibling text nodes, so the paragraph's combined text carries both.
    const stamp = value.closest('p')
    expect(stamp).not.toBeNull()
    expect(stamp?.textContent).toMatch(/Version\s*v0\.7\.0/)
  })
})

describe('NavRail — the version stamp (VITE_APP_VERSION unset, the common case)', () => {
  beforeEach(() => {
    vi.stubEnv('VITE_APP_VERSION', undefined)
  })

  it('T13: renders no version text at all — no v0.7.0, no "undefined", no bare "v", no empty element (A22)', () => {
    renderRail()
    expect(screen.queryByText('v0.7.0')).not.toBeInTheDocument()
    expect(screen.queryByText(/^v\d/)).not.toBeInTheDocument()
    expect(screen.queryByText('undefined')).not.toBeInTheDocument()
    expect(screen.queryByText(/^v$/)).not.toBeInTheDocument()
  })

  it('T14: the three rows and their accessible names are exactly as when a version is set (A19, A20)', () => {
    const nav = renderRail()
    const buttons = within(nav).getAllByRole('button')
    expect(buttons).toHaveLength(3)
    expect(buttons[0]).toHaveAccessibleName('Setup')
    expect(buttons[1]).toHaveAccessibleName('Guests')
    expect(buttons[2]).toHaveAccessibleName('Plan')
  })
})

// T15: "The whole of NavRail.test.tsx and src/App.test.tsx still pass with no edit." Neither
// file is opened or modified by this ticket — that is the point of A20, and of this file
// existing separately. There is no in-process way to assert "another test file still passes"
// from inside this one; it is proved by `npm run verify` running every *.test.tsx file in the
// same pass, unmodified — reported alongside this file's own results, not encoded here.
