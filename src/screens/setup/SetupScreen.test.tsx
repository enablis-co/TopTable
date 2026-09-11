import { describe, expect, it, beforeEach } from 'vitest'
import { act, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { SetupScreen } from './SetupScreen'
import { useTopTableStore } from '../../store/store'
import type { Guest } from '../../domain/types'
import { NavigationContext } from '../../shell/navigation'
import { tabularClass } from '../../ui'
import App from '../../App'

/**
 * TT-3, "Set up the room". Written from the acceptance criteria, KB-6 ("Screens") and the
 * harness conventions in src/App.test.tsx and src/shell/. Does not open SetupScreen.tsx,
 * RoomForm.tsx, CapacityReadout.tsx, StatusStrip.tsx or SuggestionLine.tsx.
 *
 * Two judgement calls, made from KB-6 rather than from the code, are worth flagging:
 *
 * 1. Field labels ("Event name", "Round tables", "Seats each", "Top table") are queried by
 *    loose, case-insensitive substring. The acceptance criteria given here do not spell out
 *    the exact label copy; these come from KB-6's own wireframe brackets. If SetupScreen
 *    ships different wording, most tests below fail on "unable to find a label" — a real
 *    finding to report, not a bug in the test.
 * 2. useNavigation() throws when called outside a NavigationContext.Provider (it is a bug
 *    guard, per src/shell/navigation.ts). SetupScreen's "Go to guests" control (A14) almost
 *    certainly calls it, and hooks cannot be called conditionally, so every isolated render
 *    below supplies a stub provider — the same pattern AppHeader.test.tsx uses for AppHeader.
 *    KB-6's first-visit wireframe has no "Go to guests" control at all (it appears only in
 *    the "after importing" wireframe, alongside the status strip), so the one test that
 *    exercises it seeds guests first rather than starting from true first visit.
 */

// TT-3 reads only guests.length, so a minimal, locally-built Guest is enough here. TT-6 owns
// the real fixture, and building one in this file would be building ahead of the board.
function makeGuests(count: number): Guest[] {
  return Array.from({ length: count }, (_, index) => ({
    id: `guest-${index}`,
    name: `Guest ${index}`,
    side: 'both',
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
  }))
}

// KB-6's "Adding up" scenario: 70 guests, 9 tables of 8 plus a top table of 6 — 78 seats, 8
// spare. Reused across most of the tests below exactly as KB-6 presents it.
function seedAddingUp(): void {
  useTopTableStore.getState().setGuests(makeGuests(70))
  useTopTableStore.getState().setRoom({ roundTables: 9, seatsEach: 8, topTableSeats: 6 })
}

// SetupScreen is a screen, not the app shell, so it is rendered on its own rather than
// through AppShell — but it still needs a navigation context to satisfy useNavigation's bug
// guard. See judgement call 2 above.
function renderSetupScreen() {
  return render(
    <NavigationContext.Provider value={{ tab: 'setup', goTo: () => {} }}>
      <SetupScreen allocated={false} clearAllocation={() => {}} />
    </NavigationContext.Provider>,
  )
}

// aria-current is not a plain boolean attribute: a control can be marked not current either
// by omitting it or by setting it to the literal "false" (matches src/App.test.tsx).
function isMarkedCurrent(element: HTMLElement): boolean {
  const value = element.getAttribute('aria-current')
  return value !== null && value !== 'false'
}

// A sentence's numbers may sit in their own tabular-figure spans (S10 looks for exactly
// that), so container.textContent — which aggregates every descendant text node regardless
// of nested markup — is used for whole-sentence checks throughout, consistent with
// src/App.test.tsx's own use of container.textContent rather than getByText for prose.
//
// This helper additionally scopes down to the smallest element that still contains a given
// phrase, for the one assertion (S10) that needs to look only inside the suggestion line
// rather than the whole screen. A too-broad match only weakens that check, never breaks it
// (see the arrayContaining use in S10), so it is a safe heuristic there.
function smallestElementContaining(container: HTMLElement, text: string): HTMLElement {
  const candidates: HTMLElement[] = [container, ...container.querySelectorAll<HTMLElement>('*')]
  const matches = candidates.filter((element) => element.textContent?.includes(text))
  if (matches.length === 0) {
    throw new Error(`No element contains the text: ${text}`)
  }
  return matches.reduce((smallest, element) =>
    (element.textContent?.length ?? Infinity) < (smallest.textContent?.length ?? Infinity)
      ? element
      : smallest,
  )
}

beforeEach(() => {
  useTopTableStore.getState().reset()
  localStorage.clear()
})

describe('first visit (A1, A7, A12, A15, A16)', () => {
  it('renders all four fields, with the three number fields empty rather than 0', () => {
    renderSetupScreen()

    expect(screen.getByLabelText(/event name/i)).toHaveValue('')
    expect(screen.getByLabelText<HTMLInputElement>(/round tables/i).value).toBe('')
    expect(screen.getByLabelText<HTMLInputElement>(/seats each/i).value).toBe('')
    expect(screen.getByLabelText<HTMLInputElement>(/top table/i).value).toBe('')
  })

  it('shows no capacity readout anywhere on the screen', () => {
    const { container } = renderSetupScreen()
    expect(container.textContent).not.toMatch(/seats for \d+ guests/i)
  })

  it('shows no status strip when there are no guests and the room is all zeros (true first visit)', () => {
    const { container } = renderSetupScreen()
    expect(container.textContent).not.toMatch(/loaded/i)
    expect(container.textContent).not.toMatch(/configured/i)
    expect(container.textContent).not.toMatch(/not generated/i)
  })

  it('reads "No guests yet, so nothing to work out"', () => {
    const { container } = renderSetupScreen()
    expect(container.textContent).toContain('No guests yet, so nothing to work out')
  })

  // The live region now mounts from first paint rather than only once guests exist, so a
  // screen reader announces content inserted into it in the same commit. Regression target:
  // conditional mounting keyed on guests.length, which would make this element — and the "No
  // guests yet" text inside it — absent on true first visit.
  it('mounts a single, polite aria-live region from first paint, holding "No guests yet, so nothing to work out" (A28)', () => {
    const { container } = renderSetupScreen()

    const liveRegions = Array.from(container.querySelectorAll('[aria-live]'))
    expect(liveRegions).toHaveLength(1)
    expect(liveRegions[0]?.getAttribute('aria-live')).toBe('polite')
    expect(liveRegions[0]?.hasAttribute('aria-atomic')).toBe(false)
    expect(liveRegions[0]?.textContent ?? '').toContain('No guests yet, so nothing to work out')

    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
    expect(screen.queryByRole('status')).not.toBeInTheDocument()
  })
})

describe('editing fields and the live readout (A1, A2, A3, A4, A5, A9, A13, A16)', () => {
  it('keeps a typed event name after re-rendering, because it lives in the store rather than local state', async () => {
    const user = userEvent.setup()
    const first = renderSetupScreen()
    await user.type(screen.getByLabelText(/event name/i), 'Priya and Tom, 14 March')
    first.unmount()

    renderSetupScreen()
    expect(screen.getByLabelText(/event name/i)).toHaveValue('Priya and Tom, 14 March')
  })

  it('reads "78 seats for 70 guests." and "8 spare." for 70 guests and a 9/8/6 room', () => {
    seedAddingUp()
    const { container } = renderSetupScreen()
    expect(container.textContent).toContain('78 seats for 70 guests.')
    expect(container.textContent).toContain('8 spare.')
  })

  it('shows the breakdown "9 × 8, plus a top table of 6"', () => {
    seedAddingUp()
    const { container } = renderSetupScreen()
    expect(container.textContent).toContain('9 × 8, plus a top table of 6')
  })

  it('updates the readout live when seats each changes from 8 to 7, within the same interaction', async () => {
    seedAddingUp()
    const user = userEvent.setup()
    const { container } = renderSetupScreen()
    expect(container.textContent).toContain('78 seats for 70 guests.')

    const seatsEach = screen.getByLabelText(/seats each/i)
    await user.clear(seatsEach)
    await user.type(seatsEach, '7')

    expect(container.textContent).toContain('69 seats for 70 guests.')
    expect(container.textContent).toContain('1 short.')
  })

  it('reads "70 seats for 70 guests. Exactly enough." for 70 guests and an 8/8/6 room', () => {
    useTopTableStore.getState().setGuests(makeGuests(70))
    useTopTableStore.getState().setRoom({ roundTables: 8, seatsEach: 8, topTableSeats: 6 })
    const { container } = renderSetupScreen()
    expect(container.textContent).toContain('70 seats for 70 guests. Exactly enough.')
  })

  it('reads "40 seats for 70 guests. 30 short." for 70 guests and a 4/8/8 room', () => {
    useTopTableStore.getState().setGuests(makeGuests(70))
    useTopTableStore.getState().setRoom({ roundTables: 4, seatsEach: 8, topTableSeats: 8 })
    const { container } = renderSetupScreen()
    expect(container.textContent).toContain('40 seats for 70 guests.')
    expect(container.textContent).toContain('30 short.')
  })

  it('disables no control and raises no alert role in the short state', () => {
    useTopTableStore.getState().setGuests(makeGuests(70))
    useTopTableStore.getState().setRoom({ roundTables: 4, seatsEach: 8, topTableSeats: 8 })
    const { container } = renderSetupScreen()
    expect(container.querySelectorAll('[disabled]')).toHaveLength(0)
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  })

  it('exposes the short state as data-state="short", and the word "short" in the sentence, not colour alone', () => {
    useTopTableStore.getState().setGuests(makeGuests(70))
    useTopTableStore.getState().setRoom({ roundTables: 4, seatsEach: 8, topTableSeats: 8 })
    const { container } = renderSetupScreen()
    expect(container.querySelector('[data-state="short"]')).not.toBeNull()
    expect(container.textContent).toMatch(/short/)
  })

  it('leaves the round tables field empty rather than 0 when cleared, and recomputes live', async () => {
    seedAddingUp()
    const user = userEvent.setup()
    const { container } = renderSetupScreen()

    const roundTables = screen.getByLabelText<HTMLInputElement>(/round tables/i)
    await user.clear(roundTables)

    expect(roundTables.value).toBe('')
    expect(container.textContent).toContain('6 seats for 70 guests.')
    expect(container.textContent).toContain('64 short.')
  })
})

describe('a top table is always required, at a minimum of 2 seats (fix to TT-3, product-owner ruling)', () => {
  it('shows "Add a top table of at least 2 seats." for a 9/8/0 room, even with no guests loaded', () => {
    useTopTableStore.getState().setRoom({ roundTables: 9, seatsEach: 8, topTableSeats: 0 })
    const { container } = renderSetupScreen()

    expect(container.textContent).toContain('Add a top table of at least 2 seats.')
    expect(container.textContent).not.toContain('No guests yet, so nothing to work out')
  })

  it('exposes the incomplete state as data-state="incomplete", not colour alone', () => {
    useTopTableStore.getState().setRoom({ roundTables: 9, seatsEach: 8, topTableSeats: 0 })
    const { container } = renderSetupScreen()

    expect(container.querySelector('[data-state="incomplete"]')).not.toBeNull()
  })

  it('is also incomplete at exactly one top-table seat, not only at zero', () => {
    useTopTableStore.getState().setRoom({ roundTables: 9, seatsEach: 8, topTableSeats: 1 })
    const { container } = renderSetupScreen()

    expect(container.textContent).toContain('Add a top table of at least 2 seats.')
  })

  it('leaves the true first-visit, all-zero room exactly as it was: no readout, still the "no guests yet" line', () => {
    // reset() in beforeEach already leaves the room at {0,0,0} — the blank room KB-6 draws,
    // not an incomplete one, per the ruling's explicit carve-out.
    const { container } = renderSetupScreen()

    expect(container.textContent).toContain('No guests yet, so nothing to work out')
    expect(container.textContent).not.toContain('Add a top table')
  })

  it('is not incomplete once the top table reaches 2, and reads the ordinary capacity sentence instead', () => {
    useTopTableStore.getState().setRoom({ roundTables: 9, seatsEach: 8, topTableSeats: 2 })
    const { container } = renderSetupScreen()

    expect(container.textContent).not.toContain('Add a top table')
    expect(container.textContent).toContain('No guests yet, so nothing to work out')
  })

  it('takes over the readout instead of the ordinary sentence once guests are loaded too, and suppresses the suggestion line', () => {
    useTopTableStore.getState().setGuests(makeGuests(70))
    useTopTableStore.getState().setRoom({ roundTables: 9, seatsEach: 8, topTableSeats: 0 })
    const { container } = renderSetupScreen()

    expect(container.textContent).toContain('Add a top table of at least 2 seats.')
    expect(container.textContent).not.toMatch(/seats for \d+ guests/i)
    expect(container.textContent).not.toMatch(/Drop to|Go up to/)
  })

  it('stays inside the one polite live region, mounted from first paint, with no alert or status role', () => {
    useTopTableStore.getState().setRoom({ roundTables: 9, seatsEach: 8, topTableSeats: 0 })
    const { container } = renderSetupScreen()

    const liveRegions = Array.from(container.querySelectorAll('[aria-live]'))
    expect(liveRegions).toHaveLength(1)
    expect(liveRegions[0]?.getAttribute('aria-live')).toBe('polite')
    expect(liveRegions[0]?.textContent ?? '').toContain('Add a top table of at least 2 seats.')
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
    expect(screen.queryByRole('status')).not.toBeInTheDocument()
  })

  it('disables no control — a warning, not an error, per KB-5', () => {
    useTopTableStore.getState().setRoom({ roundTables: 9, seatsEach: 8, topTableSeats: 0 })
    const { container } = renderSetupScreen()

    expect(container.querySelectorAll('[disabled]')).toHaveLength(0)
  })

  it('never flags a room built from a top-table-only field either, at the same minimum', () => {
    useTopTableStore.getState().setRoom({ roundTables: 0, seatsEach: 0, topTableSeats: 1 })
    const { container } = renderSetupScreen()

    expect(container.textContent).toContain('Add a top table of at least 2 seats.')
  })
})

describe('status strip (A6, A8)', () => {
  it('reads "70 loaded", "78 configured" and "Not generated" with guests loaded', () => {
    seedAddingUp()
    const { container } = renderSetupScreen()
    expect(container.textContent).toContain('70 loaded')
    expect(container.textContent).toContain('78 configured')
    expect(container.textContent).toContain('Not generated')
  })

  // Review finding: the strip was gated on guests.length, but "Seats — 78 configured" is not
  // a comparison against guests, and KB-1's manual-setup journey — set the room up by hand,
  // before any guests are loaded — must not lose the seat total. The strip's gate is now
  // guests.length > 0 OR total seats > 0. The capacity readout and suggestion line stay
  // gated on guests.length > 0 alone, so neither should appear here.
  it('renders once the room is configured even with no guests loaded, reading "0 loaded", "78 configured" and "Not generated"', () => {
    useTopTableStore.getState().setRoom({ roundTables: 9, seatsEach: 8, topTableSeats: 6 })
    const { container } = renderSetupScreen()

    expect(container.textContent).toContain('0 loaded')
    expect(container.textContent).toContain('78 configured')
    expect(container.textContent).toContain('Not generated')

    expect(container.textContent).not.toMatch(/seats for \d+ guests/i)
    expect(container.textContent).not.toMatch(/Drop to|Go up to/)
    expect(container.textContent).toContain('No guests yet, so nothing to work out')

    // The "Go to guests" control rides with the strip, not with guests being loaded.
    expect(screen.getByRole('button', { name: 'Go to guests' })).toBeInTheDocument()
  })

  it('renders on any non-zero total, even a top-table-only room with no round tables configured, reading "6 configured"', () => {
    useTopTableStore.getState().setRoom({ roundTables: 0, seatsEach: 0, topTableSeats: 6 })
    const { container } = renderSetupScreen()

    expect(container.textContent).toContain('0 loaded')
    expect(container.textContent).toContain('6 configured')
    expect(container.textContent).toContain('Not generated')

    expect(container.textContent).not.toMatch(/seats for \d+ guests/i)
    expect(container.textContent).not.toMatch(/Drop to|Go up to/)
    expect(container.textContent).toContain('No guests yet, so nothing to work out')

    expect(screen.getByRole('button', { name: 'Go to guests' })).toBeInTheDocument()
  })
})

describe('navigation, rendered through the real App per the harness note (A14)', () => {
  it('is wired into the setup tab, and activating "Go to guests" makes the Guests section current', async () => {
    // KB-6 shows "Go to guests" only in the "after importing" wireframe, alongside the
    // status strip — not in the first-visit one — so guests are seeded first (see the
    // judgement call noted at the top of this file).
    seedAddingUp()
    const user = userEvent.setup()
    const { container } = render(<App />)

    // Confirms SetupScreen is actually wired into App's setup tab, not merely assumed.
    expect(container.textContent).toContain('70 loaded')

    await user.click(screen.getByRole('button', { name: 'Go to guests' }))

    const nav = screen.getByRole('navigation', { name: 'Sections' })
    const guestsControl = within(nav).getByRole('button', { name: 'Guests' })
    const setupControl = within(nav).getByRole('button', { name: 'Setup' })
    expect(isMarkedCurrent(guestsControl)).toBe(true)
    expect(isMarkedCurrent(setupControl)).toBe(false)
  })
})

describe('suggestions (A17 through A28)', () => {
  it('S1: reads "Drop to 8 tables: 70 seats for 70 guests. Exactly enough." for 70 guests, 9/8/6 (A18)', () => {
    seedAddingUp()
    const { container } = renderSetupScreen()
    expect(container.textContent).toContain(
      'Drop to 8 tables: 70 seats for 70 guests. Exactly enough.',
    )
  })

  it('S2: keeps suggesting "Drop to 8 tables: …" and updates the current total when round tables changes to 10 (A17)', async () => {
    seedAddingUp()
    const user = userEvent.setup()
    const { container } = renderSetupScreen()

    const roundTables = screen.getByLabelText(/round tables/i)
    await user.clear(roundTables)
    await user.type(roundTables, '10')

    expect(container.textContent).toContain(
      'Drop to 8 tables: 70 seats for 70 guests. Exactly enough.',
    )
    expect(container.textContent).toContain('86 seats for 70 guests.')
    expect(container.textContent).toContain('16 spare.')
  })

  it('S3: reads "Go up to 10 tables: 86 seats for 86 guests. Exactly enough." for 86 guests, 8/8/6 (A19)', () => {
    useTopTableStore.getState().setGuests(makeGuests(86))
    useTopTableStore.getState().setRoom({ roundTables: 8, seatsEach: 8, topTableSeats: 6 })
    const { container } = renderSetupScreen()
    expect(container.textContent).toContain(
      'Go up to 10 tables: 86 seats for 86 guests. Exactly enough.',
    )
  })

  it('S4: shows no suggestion for 40 guests, 4/8/8 — already exact (A20)', () => {
    useTopTableStore.getState().setGuests(makeGuests(40))
    useTopTableStore.getState().setRoom({ roundTables: 4, seatsEach: 8, topTableSeats: 8 })
    const { container } = renderSetupScreen()
    expect(container.textContent).not.toMatch(/Drop to|Go up to/)
  })

  it('S5: shows no suggestion for 69 guests, 9/8/6 — slack with no exact landing (A21)', () => {
    useTopTableStore.getState().setGuests(makeGuests(69))
    useTopTableStore.getState().setRoom({ roundTables: 9, seatsEach: 8, topTableSeats: 6 })
    const { container } = renderSetupScreen()
    expect(container.textContent).not.toMatch(/Drop to|Go up to/)
  })

  it('S6: shows no readout and no suggestion with no guests, even with a 9/8/6 room configured (A22)', () => {
    useTopTableStore.getState().setRoom({ roundTables: 9, seatsEach: 8, topTableSeats: 6 })
    const { container } = renderSetupScreen()
    expect(container.textContent).not.toMatch(/seats for \d+ guests/i)
    expect(container.textContent).not.toMatch(/Drop to|Go up to/)
  })

  it('S7: shows no suggestion and renders without throwing when seats each is emptied, for 70 guests (A22)', async () => {
    seedAddingUp()
    const user = userEvent.setup()
    const { container } = renderSetupScreen()

    await user.clear(screen.getByLabelText(/seats each/i))

    expect(container.textContent).not.toMatch(/Drop to|Go up to/)
    expect(container.textContent).toContain('6 seats for 70 guests.')
    expect(container.textContent).toContain('64 short.')
  })

  it('S8: reads "Go up to 8 tables: 70 seats for 70 guests. Exactly enough." for 70 guests, 0/8/6 (A17)', () => {
    useTopTableStore.getState().setGuests(makeGuests(70))
    useTopTableStore.getState().setRoom({ roundTables: 0, seatsEach: 8, topTableSeats: 6 })
    const { container } = renderSetupScreen()
    expect(container.textContent).toContain(
      'Go up to 8 tables: 70 seats for 70 guests. Exactly enough.',
    )
  })

  it('S9: reads "Drop to 1 table: 14 seats for 14 guests. Exactly enough." for 14 guests, 4/8/6 — singular "table" (A27)', () => {
    useTopTableStore.getState().setGuests(makeGuests(14))
    useTopTableStore.getState().setRoom({ roundTables: 4, seatsEach: 8, topTableSeats: 6 })
    const { container } = renderSetupScreen()
    expect(container.textContent).toContain('Drop to 1 table: 14 seats for 14 guests. Exactly enough.')
  })

  it("S10: wraps the suggestion's numbers in a tabularClass element (A24)", () => {
    seedAddingUp()
    const { container } = renderSetupScreen()

    const suggestion = smallestElementContaining(
      container,
      'Drop to 8 tables: 70 seats for 70 guests. Exactly enough.',
    )
    const numberElements = suggestion.querySelectorAll(`.${tabularClass}`)
    const texts = Array.from(numberElements).map((element) => element.textContent?.trim())

    expect(numberElements.length).toBeGreaterThanOrEqual(3)
    expect(texts).toEqual(expect.arrayContaining(['8', '70']))
  })

  it('S11: the suggestion offers no button, link or checkbox role (A25)', () => {
    seedAddingUp()
    renderSetupScreen()

    // Filters by content rather than by scoping to a container element: this screen also has
    // a real "Go to guests" button once guests are loaded (A14), and an over-broad container
    // match must never be able to catch that button and misreport it as part of the
    // suggestion.
    const interactive = [
      ...screen.queryAllByRole('button'),
      ...screen.queryAllByRole('link'),
      ...screen.queryAllByRole('checkbox'),
    ]
    const suggestionLike = interactive.filter((element) =>
      /drop to \d|go up to \d/i.test(element.textContent ?? ''),
    )
    expect(suggestionLike).toHaveLength(0)
  })

  it('S12: exactly one polite aria-live element, with no aria-atomic, holds both the readout and the suggestion; nothing is alert or status (A28)', () => {
    seedAddingUp()
    const { container } = renderSetupScreen()

    const liveRegions = Array.from(container.querySelectorAll('[aria-live]'))
    expect(liveRegions).toHaveLength(1)
    expect(liveRegions[0]?.getAttribute('aria-live')).toBe('polite')
    expect(liveRegions[0]?.hasAttribute('aria-atomic')).toBe(false)
    expect(liveRegions[0]?.textContent ?? '').toContain('78 seats for 70 guests.')
    expect(liveRegions[0]?.textContent ?? '').toContain(
      'Drop to 8 tables: 70 seats for 70 guests. Exactly enough.',
    )
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
    expect(screen.queryByRole('status')).not.toBeInTheDocument()
  })

  it('S13: the suggestion leaves while the readout stays when the guest count changes to 69 (A21, A28)', () => {
    seedAddingUp()
    const { container } = renderSetupScreen()
    expect(container.textContent).toContain(
      'Drop to 8 tables: 70 seats for 70 guests. Exactly enough.',
    )

    act(() => {
      useTopTableStore.getState().setGuests(makeGuests(69))
    })

    expect(container.textContent).not.toMatch(/Drop to|Go up to/)
    expect(container.textContent).toContain('78 seats for 69 guests.')
  })
})
