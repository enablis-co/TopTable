import { describe, expect, it, beforeEach } from 'vitest'
import { act, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { GuestsScreen } from './GuestsScreen'
import { useTopTableStore } from '../../store/store'
import type { Guest } from '../../domain/types'
import { NavigationContext } from '../../shell/navigation'
import App from '../../App'

/**
 * TT-6, "The guest list" — C23 through C27, and C30. Written from the acceptance criteria, KB-6
 * and the harness conventions in src/screens/setup/SetupScreen.test.tsx (the store-backed screen
 * pattern: GuestsScreen takes no props and reads `guests` from the store, per
 * .claude/plans/TT-5.md section 4). Does not open GuestsScreen.tsx, GuestSummary.tsx,
 * GuestsEmpty.tsx or guestFilter.ts.
 *
 * A7/A8 (task instructions): KB-6's summary figures ("70 guests · 34 bride · 33 groom · 3 both ·
 * 9 with needs") are illustrative and do not match any real scenario file, so every fixture here
 * is built locally with counts this file controls and checks against directly — never KB-6's
 * numbers, and never against a loaded scenario.
 *
 * Two judgement calls:
 *
 * 1. The search field's accessible name is queried loosely (`/search/i`), the same treatment
 *    SetupScreen.test.tsx gives its own KB-6-bracket-derived field names — `docs/style-guide.html`
 *    shows "Search name or tag" only as a *placeholder* example ("Placeholders are a real example
 *    of valid input, never a repeat of the label"), which is explicit that the placeholder is not
 *    the label.
 * 2. C30's route back to Setup is queried by a name matching /scenario|setup/i rather than an
 *    exact string: neither TT-6 nor KB-6 publishes the control's copy. The one-line message itself
 *    *is* published — `docs/style-guide.html`'s "Words" table gives "No guests yet" -> "Start from
 *    a scenario, or add your first guest" verbatim — and is asserted exactly.
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

// 6 guests: 3 bride, 2 groom, 1 both. 2 carry a need (one allergy, one accessibility); one
// carries only a dietary preference, deliberately, so a summary that (wrongly) folded dietary
// preferences into "with needs" would read 3, not 2 — pinning C11's rule down at the summary
// level as well as the column's.
function seedGuests(): Guest[] {
  const guests = [
    makeGuest('g-1', { name: 'Ana Ferreira', side: 'bride', allergies: ['nuts'] }),
    makeGuest('g-2', { name: 'Ben Ojo', side: 'bride', accessibility: ['near an exit'] }),
    makeGuest('g-3', { name: 'Cara Lindqvist', side: 'bride', dietaryPreferences: ['vegan'] }),
    makeGuest('g-4', { name: 'Dev Patel', side: 'groom', tags: ['uni'] }),
    makeGuest('g-5', { name: 'Eli Stone', side: 'groom' }),
    makeGuest('g-6', { name: 'Fay Whitcombe', side: 'both' }),
  ]
  useTopTableStore.getState().setGuests(guests)
  return guests
}

function renderGuestsScreen() {
  return render(
    <NavigationContext.Provider value={{ tab: 'guests', goTo: () => {} }}>
      <GuestsScreen />
    </NavigationContext.Provider>,
  )
}

function isMarkedCurrent(element: HTMLElement): boolean {
  const value = element.getAttribute('aria-current')
  return value !== null && value !== 'false'
}

// Reads the Needs column straight off the rendered table, per row, rather than off a guest
// list — the point of C27 is that the column and the summary cannot be allowed to drift apart,
// which a count taken from a fixture instead of the DOM could never catch.
function renderedNeedsCount(): number {
  const table = screen.getByRole('table')
  const headerText = within(table)
    .getAllByRole('columnheader')
    .map((h) => h.textContent?.trim())
  const needsIndex = headerText.indexOf('Needs')
  if (needsIndex === -1) {
    throw new Error('expected a "Needs" column header')
  }
  const bodyRows = within(table)
    .getAllByRole('row')
    .filter((row) => row.closest('tbody') !== null)
  return bodyRows.filter((row) => {
    const cells = within(row).getAllByRole('cell')
    return cells[needsIndex]?.textContent?.trim() !== '—'
  }).length
}

beforeEach(() => {
  useTopTableStore.getState().reset()
  localStorage.clear()
})

describe('search (C23)', () => {
  it('filters to the row matching a name substring, case-insensitively', async () => {
    seedGuests()
    const user = userEvent.setup()
    renderGuestsScreen()

    await user.type(screen.getByRole('textbox', { name: /search/i }), 'ANA')

    expect(screen.getByText('Ana Ferreira')).toBeInTheDocument()
    expect(screen.queryByText('Ben Ojo')).not.toBeInTheDocument()
    expect(screen.queryByText('Dev Patel')).not.toBeInTheDocument()
  })

  it('filters to the row matching a tag substring', async () => {
    seedGuests()
    const user = userEvent.setup()
    renderGuestsScreen()

    await user.type(screen.getByRole('textbox', { name: /search/i }), 'uni')

    expect(screen.getByText('Dev Patel')).toBeInTheDocument()
    expect(screen.queryByText('Ana Ferreira')).not.toBeInTheDocument()
  })

  it('shows no rows for a query that matches nothing, without falling back to the empty state', async () => {
    seedGuests()
    const user = userEvent.setup()
    renderGuestsScreen()

    await user.type(screen.getByRole('textbox', { name: /search/i }), 'zzz-nothing-matches')

    const table = screen.getByRole('table')
    const bodyRows = within(table)
      .getAllByRole('row')
      .filter((row) => row.closest('tbody') !== null)
    expect(bodyRows).toHaveLength(0)
    // C30 is about an empty guest list, not an empty search result — the table itself must
    // still be the thing rendered, not GuestsEmpty's "no guests at all" message.
    expect(screen.queryByText('Start from a scenario, or add your first guest')).not.toBeInTheDocument()
  })
})

describe('summary line (C24, C25, C26, C27)', () => {
  it('shows the total, the bride/groom/both breakdown and the count with a need', () => {
    seedGuests()
    const { container } = renderGuestsScreen()

    expect(container.textContent).toContain('6 guests')
    expect(container.textContent).toContain('3 bride')
    expect(container.textContent).toContain('2 groom')
    expect(container.textContent).toContain('1 both')
    expect(container.textContent).toContain('2 with needs')
  })

  it('recalculates when a guest is added', () => {
    seedGuests()
    const { container } = renderGuestsScreen()

    act(() => {
      useTopTableStore.getState().addGuest(makeGuest('g-7', { name: 'Gus Adeyemi', side: 'groom' }))
    })

    expect(container.textContent).toContain('7 guests')
    expect(container.textContent).toContain('3 groom')
  })

  it('recalculates when a guest is edited', () => {
    const guests = seedGuests()
    const { container } = renderGuestsScreen()
    const ana = guests[0]
    if (!ana) {
      throw new Error('expected a seeded guest')
    }

    act(() => {
      useTopTableStore.getState().updateGuest({ ...ana, side: 'groom' })
    })

    expect(container.textContent).toContain('6 guests')
    expect(container.textContent).toContain('2 bride')
    expect(container.textContent).toContain('3 groom')
  })

  it('recalculates when a guest is removed', () => {
    seedGuests()
    const { container } = renderGuestsScreen()

    act(() => {
      useTopTableStore.getState().removeGuest('g-1')
    })

    expect(container.textContent).toContain('5 guests')
    expect(container.textContent).toContain('2 bride')
    expect(container.textContent).toContain('1 with needs')
  })

  it('does not change while a search is narrowing the visible rows', async () => {
    seedGuests()
    const user = userEvent.setup()
    const { container } = renderGuestsScreen()

    await user.type(screen.getByRole('textbox', { name: /search/i }), 'Ana')

    expect(container.textContent).toContain('6 guests')
    expect(container.textContent).toContain('3 bride')
    expect(container.textContent).toContain('2 groom')
    expect(container.textContent).toContain('1 both')
    expect(container.textContent).toContain('2 with needs')
  })

  it('the "with needs" figure equals the number of rows showing something other than an em dash in Needs', () => {
    seedGuests()
    const { container } = renderGuestsScreen()

    const match = /(\d+)\s*with needs/i.exec(container.textContent ?? '')
    if (!match?.[1]) {
      throw new Error('expected a "N with needs" figure in the summary')
    }
    expect(Number(match[1])).toBe(renderedNeedsCount())
    // And, as a check on this file's own fixture bookkeeping rather than a substitute for the
    // cross-check above: the rendered count is the 2 this fixture was built to produce.
    expect(renderedNeedsCount()).toBe(2)
  })
})

describe('empty state (C30)', () => {
  it('names the space and does not render the table when there are no guests', () => {
    const { container } = renderGuestsScreen()

    expect(container.textContent).toContain('Start from a scenario, or add your first guest')
    expect(screen.queryByRole('table')).not.toBeInTheDocument()
  })

  it('offers a control that returns to Setup', async () => {
    const user = userEvent.setup()
    let requestedTab: string | null = null
    render(
      <NavigationContext.Provider value={{ tab: 'guests', goTo: (tab) => { requestedTab = tab } }}>
        <GuestsScreen />
      </NavigationContext.Provider>,
    )

    await user.click(screen.getByRole('button', { name: /scenario|setup/i }))

    expect(requestedTab).toBe('setup')
  })

  it('rendered through the real App, the route back actually makes Setup the current section', async () => {
    const user = userEvent.setup()
    render(<App />)

    const header = screen.getByRole('banner')
    await user.click(within(header).getByRole('button', { name: 'Guests' }))
    expect(screen.queryByRole('table')).not.toBeInTheDocument()

    // Scoped to <main>: the header's own "Setup" tab also matches /scenario|setup/i, and is a
    // different, legitimate control from the one this criterion is about.
    const main = screen.getByRole('main')
    await user.click(within(main).getByRole('button', { name: /scenario|setup/i }))

    const guestsControl = within(header).getByRole('button', { name: 'Guests' })
    const setupControl = within(header).getByRole('button', { name: 'Setup' })
    expect(isMarkedCurrent(setupControl)).toBe(true)
    expect(isMarkedCurrent(guestsControl)).toBe(false)
  })
})
