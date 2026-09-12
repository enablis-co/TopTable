import { describe, expect, it, beforeEach, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { SetupScreen } from './SetupScreen'
import { useTopTableStore } from '../../store/store'
import type { Guest } from '../../domain/types'
import { NavigationContext } from '../../shell/navigation'
import { tabularClass } from '../../ui'

/**
 * TT-4, "Import a scenario". Written from the acceptance criteria in .claude/plans/TT-4.md
 * section 3 and the scenarioImport.test.tsx row-by-row test plan in section 5, under the
 * approved Build B: the three scenario cards, the heading, the subtitle and the divider
 * collapse together after a successful import, behind a "Change scenario" control on the chip
 * row that brings them back. Does not open ScenarioPicker.tsx, ScenarioChip.tsx, CardButton.tsx,
 * scenarioSource.ts, SetupScreen.tsx or scenarios.ts.
 *
 * Harness (render wrapper, beforeEach reset/localStorage.clear pattern) copied from
 * SetupScreen.test.tsx per the plan's explicit exception — that file's own documented
 * convention, not read for anything beyond it.
 *
 * Fetch is stubbed with vi.spyOn(globalThis, 'fetch'), per the plan, not vi.stubGlobal:
 * vite.config.ts's restoreMocks: true restores spies automatically between tests but does not
 * unstub globals. The screen is expected to fetch
 * `${import.meta.env.BASE_URL}scenarios/<id>.json` (`/scenarios/<id>.json` under test) and to
 * read only the response body's `guests` array — the room comes from the domain manifest, not
 * from the fetched file, so the mocked bodies below never need real KB-3 guest data, only the
 * right length.
 *
 * "Primary button" (C25, C32) is a purely visual variant (KB-5 "slate-filled") with no ARIA
 * distinction and no DOM hook of its own — Button.tsx applies it only via a CSS module class,
 * and this codebase's own Button.test.tsx never asserts on that class either, treating variant
 * as untestable in jsdom the same way KB-5's colour-only states are (see R5 in the plan, and
 * scenarioPickerStyles.test.ts). What is black-box testable, and is what the plan's section 4a
 * argues C25/C32 actually reduce to, is the structural claim: the confirmation prompt's primary
 * "Load {name}" button and "Change scenario" are mutually exclusive by construction, and at
 * most one "Load {name}" button ever exists at a time. That is what is asserted below.
 */

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

function renderSetupScreen() {
  return render(
    <NavigationContext.Provider value={{ tab: 'setup', goTo: () => {} }}>
      <SetupScreen allocated={false} clearAllocation={() => {}} />
    </NavigationContext.Provider>,
  )
}

function isBefore(a: Element, b: Element): boolean {
  return (a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING) !== 0
}

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status })
}

function urlOf(input: unknown): string {
  if (typeof input === 'string') return input
  if (input instanceof URL) return input.toString()
  if (input instanceof Request) return input.url
  return String(input)
}

const SCENARIO_GUEST_COUNTS = {
  'small-and-cosy': 40,
  'adding-up': 70,
  'celebrity-scale': 200,
} as const

// Responds to whichever scenario file is requested with a well-formed body of the right guest
// count. The room a successful import ends up with comes from the domain manifest, not from
// this body (Assumed A7), so the guest objects themselves carry no scenario-specific content.
function mockScenarioFetch() {
  return vi.spyOn(globalThis, 'fetch').mockImplementation((input: unknown) => {
    const url = urlOf(input)
    const ids = Object.keys(SCENARIO_GUEST_COUNTS) as Array<keyof typeof SCENARIO_GUEST_COUNTS>
    const match = ids.find((id) => url.includes(id))
    if (!match) return Promise.resolve(new Response('not found', { status: 404 }))
    return Promise.resolve(jsonResponse({ meta: {}, guests: makeGuests(SCENARIO_GUEST_COUNTS[match]) }))
  })
}

beforeEach(() => {
  useTopTableStore.getState().reset()
  localStorage.clear()
})

describe('true first visit: the picker section (C1, C12, C13)', () => {
  it('C1: three scenario cards render, each before the event name field in document order', () => {
    renderSetupScreen()

    const eventNameField = screen.getByLabelText(/event name/i)
    for (const name of [/Small and cosy/i, /Adding up/i, /Celebrity scale/i]) {
      const card = screen.getByRole('button', { name })
      expect(isBefore(card, eventNameField)).toBe(true)
    }
  })

  it('C12, C13: the heading, subtitle and divider are present, the divider sitting after the cards and before the event name field', () => {
    renderSetupScreen()

    expect(screen.getByRole('heading', { name: 'Start from a scenario' })).toBeInTheDocument()
    expect(
      screen.getByText('Loads a guest list and a matching room. Change anything after.'),
    ).toBeInTheDocument()

    const lastCard = screen.getByRole('button', { name: /Celebrity scale/i })
    const divider = screen.getByText(/or set it up yourself/i)
    const eventNameField = screen.getByLabelText(/event name/i)

    expect(isBefore(lastCard, divider)).toBe(true)
    expect(isBefore(divider, eventNameField)).toBe(true)
  })

  it('C16: no chip renders', () => {
    const { container } = renderSetupScreen()
    expect(container.textContent).not.toMatch(/loaded/i)
    expect(container.textContent).not.toMatch(/Custom/)
  })

  it('C16, C30: no "Change scenario" control renders', () => {
    const { container } = renderSetupScreen()
    expect(screen.queryByRole('button', { name: 'Change scenario' })).not.toBeInTheDocument()
    expect(container.textContent).not.toMatch(/loaded/i)
    expect(container.textContent).not.toMatch(/Custom/)
  })

  it('Assumed A9: getByLabelText(/top table/i) still resolves to exactly one element with all three cards rendered', () => {
    renderSetupScreen()
    expect(screen.getAllByLabelText(/top table/i)).toHaveLength(1)
  })
})

describe('each card shows its guest count, room and seat arithmetic (C2, C14)', () => {
  it('Small and cosy: 40 guests, 4 tables of 8, top table 8, 40 seats, none spare', () => {
    renderSetupScreen()
    const card = screen.getByRole('button', { name: /Small and cosy/i })
    expect(card.textContent).toContain('Small and cosy')
    expect(card.textContent).toContain('40 guests')
    expect(card.textContent).toContain('4 tables of 8, top table 8')
    expect(card.textContent).toContain('40 seats, none spare')
  })

  it('Adding up: 70 guests, 9 tables of 8, top table 6, 78 seats, 8 spare', () => {
    renderSetupScreen()
    const card = screen.getByRole('button', { name: /Adding up/i })
    expect(card.textContent).toContain('Adding up')
    expect(card.textContent).toContain('70 guests')
    expect(card.textContent).toContain('9 tables of 8, top table 6')
    expect(card.textContent).toContain('78 seats, 8 spare')
  })

  it('Celebrity scale: 200 guests, 26 tables of 8, top table 8, 216 seats, 16 spare', () => {
    renderSetupScreen()
    const card = screen.getByRole('button', { name: /Celebrity scale/i })
    expect(card.textContent).toContain('Celebrity scale')
    expect(card.textContent).toContain('200 guests')
    expect(card.textContent).toContain('26 tables of 8, top table 8')
    expect(card.textContent).toContain('216 seats, 16 spare')
  })
})

describe('every figure on a card is tabular (C18)', () => {
  it("wraps Small and cosy's figures in a tabularClass element", () => {
    renderSetupScreen()
    const card = screen.getByRole('button', { name: /Small and cosy/i })
    const numbers = Array.from(card.querySelectorAll(`.${tabularClass}`)).map((el) => el.textContent?.trim())
    expect(numbers.length).toBeGreaterThan(0)
    expect(numbers).toEqual(expect.arrayContaining(['40', '4', '8']))
  })

  it("wraps Adding up's figures in a tabularClass element", () => {
    renderSetupScreen()
    const card = screen.getByRole('button', { name: /Adding up/i })
    const numbers = Array.from(card.querySelectorAll(`.${tabularClass}`)).map((el) => el.textContent?.trim())
    expect(numbers.length).toBeGreaterThan(0)
    expect(numbers).toEqual(expect.arrayContaining(['70', '9', '6', '78']))
  })

  it("wraps Celebrity scale's figures in a tabularClass element", () => {
    renderSetupScreen()
    const card = screen.getByRole('button', { name: /Celebrity scale/i })
    const numbers = Array.from(card.querySelectorAll(`.${tabularClass}`)).map((el) => el.textContent?.trim())
    expect(numbers.length).toBeGreaterThan(0)
    expect(numbers).toEqual(expect.arrayContaining(['200', '26', '216']))
  })
})

describe('importing without existing data asks nothing first (C6)', () => {
  it('clicking a card on a true first visit imports immediately', async () => {
    const user = userEvent.setup()
    mockScenarioFetch()
    renderSetupScreen()

    await user.click(screen.getByRole('button', { name: /Adding up/i }))

    expect(screen.queryByText(/over your current setup\?/i)).not.toBeInTheDocument()
    await screen.findByText('Adding up loaded')

    const state = useTopTableStore.getState()
    expect(state.guests).toHaveLength(70)
    expect(state.room).toEqual({ roundTables: 9, seatsEach: 8, topTableSeats: 6 })
  })
})

describe('confirmation is required over existing data (C4)', () => {
  it('asks first when guests are already seeded', async () => {
    const user = userEvent.setup()
    mockScenarioFetch()
    useTopTableStore.getState().setGuests(makeGuests(5))
    renderSetupScreen()

    await user.click(screen.getByRole('button', { name: /Adding up/i }))

    expect(screen.getByText('Load Adding up over your current setup?')).toBeInTheDocument()
    expect(useTopTableStore.getState().guests).toHaveLength(5)
    expect(useTopTableStore.getState().scenario).toBeNull()
  })

  it('asks first when a room is configured by hand, even with no guests', async () => {
    const user = userEvent.setup()
    mockScenarioFetch()
    useTopTableStore.getState().setRoom({ roundTables: 4, seatsEach: 8, topTableSeats: 8 })
    renderSetupScreen()

    await user.click(screen.getByRole('button', { name: /Adding up/i }))

    expect(screen.getByText('Load Adding up over your current setup?')).toBeInTheDocument()
  })

  // A half-typed room can total zero seats, so anything keyed off the seat total reads it
  // as empty and imports straight over it. Round tables is the first of the three fields
  // and the cards sit directly above it, so this is the ordinary way to arrive here — not
  // an edge case. Only the first two cases are regressions: round tables and seats each
  // are multiplied together, so either alone totals zero, while top table seats is added
  // and so was always caught. The third case is here to hold that asymmetry in place.
  it.each([
    ['round tables alone', { roundTables: 5, seatsEach: 0, topTableSeats: 0 }],
    ['seats each alone', { roundTables: 0, seatsEach: 8, topTableSeats: 0 }],
    ['top table seats alone', { roundTables: 0, seatsEach: 0, topTableSeats: 6 }],
  ])('asks first with %s typed, which totals zero seats', async (_label, room) => {
    const user = userEvent.setup()
    const fetchSpy = mockScenarioFetch()
    useTopTableStore.getState().setRoom(room)
    renderSetupScreen()

    await user.click(screen.getByRole('button', { name: /Small and cosy/i }))

    expect(screen.getByText('Load Small and cosy over your current setup?')).toBeInTheDocument()
    expect(fetchSpy).not.toHaveBeenCalled()
    expect(useTopTableStore.getState().room).toEqual(room)
    expect(useTopTableStore.getState().scenario).toBeNull()
  })
})

describe('cancelling (C5, Assumed A10, A15)', () => {
  it('leaves the guests, room and chip exactly as they were, and issues no fetch', async () => {
    const user = userEvent.setup()
    const fetchSpy = mockScenarioFetch()
    useTopTableStore.getState().setGuests(makeGuests(5))
    renderSetupScreen()

    await user.click(screen.getByRole('button', { name: /Adding up/i }))
    await user.click(screen.getByRole('button', { name: 'Cancel' }))

    const state = useTopTableStore.getState()
    expect(state.guests).toHaveLength(5)
    expect(state.room).toEqual({ roundTables: 0, seatsEach: 0, topTableSeats: 0 })
    expect(state.scenario).toBeNull()
    expect(fetchSpy).not.toHaveBeenCalled()
  })

  it('leaves all three cards on screen (A15)', async () => {
    const user = userEvent.setup()
    mockScenarioFetch()
    useTopTableStore.getState().setGuests(makeGuests(5))
    renderSetupScreen()

    await user.click(screen.getByRole('button', { name: /Adding up/i }))
    await user.click(screen.getByRole('button', { name: 'Cancel' }))

    expect(screen.getByRole('button', { name: /Small and cosy/i })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Adding up/i })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Celebrity scale/i })).toBeInTheDocument()
  })

  it('Assumed A10: opening the prompt puts focus on "Load Adding up"', async () => {
    const user = userEvent.setup()
    mockScenarioFetch()
    useTopTableStore.getState().setGuests(makeGuests(5))
    renderSetupScreen()

    await user.click(screen.getByRole('button', { name: /Adding up/i }))

    expect(screen.getByRole('button', { name: 'Load Adding up' })).toHaveFocus()
  })

  it('Assumed A10: cancelling returns focus to the card that was clicked', async () => {
    const user = userEvent.setup()
    mockScenarioFetch()
    useTopTableStore.getState().setGuests(makeGuests(5))
    renderSetupScreen()

    const card = screen.getByRole('button', { name: /Adding up/i })
    await user.click(card)
    await user.click(screen.getByRole('button', { name: 'Cancel' }))

    expect(card).toHaveFocus()
  })
})

describe('confirming replaces guests and room together, and the chip names the scenario (C3, C7, C15, C17, C18)', () => {
  it('C3, C7: replaces the guests and room together, and the store records "adding-up"', async () => {
    const user = userEvent.setup()
    mockScenarioFetch()
    useTopTableStore.getState().setGuests(makeGuests(5))
    renderSetupScreen()

    await user.click(screen.getByRole('button', { name: /Adding up/i }))
    await user.click(screen.getByRole('button', { name: 'Load Adding up' }))
    await screen.findByText('Adding up loaded')

    const state = useTopTableStore.getState()
    expect(state.guests).toHaveLength(70)
    expect(state.room).toEqual({ roundTables: 9, seatsEach: 8, topTableSeats: 6 })
    expect(state.scenario).toBe('adding-up')
  })

  it('C15, C17: the chip reads "Small and cosy loaded" and precedes the event name field', async () => {
    const user = userEvent.setup()
    mockScenarioFetch()
    renderSetupScreen()

    await user.click(screen.getByRole('button', { name: /Small and cosy/i }))
    const chip = await screen.findByText('Small and cosy loaded')

    const eventNameField = screen.getByLabelText(/event name/i)
    expect(isBefore(chip, eventNameField)).toBe(true)
  })

  it('C18: the current guest count inside the confirmation prompt sits in a tabularClass element', async () => {
    const user = userEvent.setup()
    mockScenarioFetch()
    useTopTableStore.getState().setGuests(makeGuests(5))
    renderSetupScreen()

    await user.click(screen.getByRole('button', { name: /Adding up/i }))

    // Scoped to the prompt's own sentence, not the whole screen: with guests present but no
    // room configured, the (unrelated) capacity readout may also render a "5" of its own, and
    // this must not be mistaken for the prompt's figure.
    const promptSentence = screen.getByText(/replaces the/i)
    expect(promptSentence.textContent).toContain('5')
    const numbers = Array.from(promptSentence.querySelectorAll(`.${tabularClass}`)).map((el) =>
      el.textContent?.trim(),
    )
    expect(numbers).toContain('5')
  })
})

describe('editing the room detaches from the scenario (C8, Assumed A3)', () => {
  async function importSmallAndCosy(user: ReturnType<typeof userEvent.setup>) {
    await user.click(screen.getByRole('button', { name: /Small and cosy/i }))
    await screen.findByText('Small and cosy loaded')
  }

  it('typing into Round tables detaches: the chip reads Custom', async () => {
    const user = userEvent.setup()
    mockScenarioFetch()
    renderSetupScreen()
    await importSmallAndCosy(user)

    await user.type(screen.getByLabelText(/round tables/i), '8')

    expect(screen.getByText('Custom')).toBeInTheDocument()
    expect(screen.queryByText('Small and cosy loaded')).not.toBeInTheDocument()
  })

  it('clearing Round tables entirely also detaches: the chip reads Custom', async () => {
    const user = userEvent.setup()
    mockScenarioFetch()
    renderSetupScreen()
    await importSmallAndCosy(user)

    await user.clear(screen.getByLabelText(/round tables/i))

    expect(screen.getByText('Custom')).toBeInTheDocument()
  })

  it('Assumed A3: typing into Event name leaves the chip reading "Small and cosy loaded"', async () => {
    const user = userEvent.setup()
    mockScenarioFetch()
    renderSetupScreen()
    await importSmallAndCosy(user)

    await user.type(screen.getByLabelText(/event name/i), 'Priya and Tom, 14 March')

    expect(screen.getByText('Small and cosy loaded')).toBeInTheDocument()
  })
})

describe('a failed import (C21, C22, C23, A15)', () => {
  it('C21, C22: leaves the store untouched and shows "Adding up could not be loaded."', async () => {
    const user = userEvent.setup()
    vi.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('network down'))
    useTopTableStore.getState().setGuests(makeGuests(5))
    renderSetupScreen()

    await user.click(screen.getByRole('button', { name: /Adding up/i }))
    await user.click(screen.getByRole('button', { name: 'Load Adding up' }))
    await screen.findByText('Adding up could not be loaded.')

    const state = useTopTableStore.getState()
    expect(state.guests).toHaveLength(5)
    expect(state.scenario).toBeNull()
  })

  it('C21: the failure message contains neither "sorry" nor "error"', async () => {
    const user = userEvent.setup()
    vi.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('network down'))
    useTopTableStore.getState().setGuests(makeGuests(5))
    renderSetupScreen()

    await user.click(screen.getByRole('button', { name: /Adding up/i }))
    await user.click(screen.getByRole('button', { name: 'Load Adding up' }))
    const message = await screen.findByText('Adding up could not be loaded.')

    expect(message.textContent ?? '').not.toMatch(/sorry/i)
    expect(message.textContent ?? '').not.toMatch(/error/i)
  })

  it('C23: the failure message carries data-severity="hard"', async () => {
    const user = userEvent.setup()
    vi.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('network down'))
    useTopTableStore.getState().setGuests(makeGuests(5))
    renderSetupScreen()

    await user.click(screen.getByRole('button', { name: /Adding up/i }))
    await user.click(screen.getByRole('button', { name: 'Load Adding up' }))
    await screen.findByText('Adding up could not be loaded.')

    expect(screen.getByRole('alert')).toHaveAttribute('data-severity', 'hard')
  })

  it('the failure line is the only role="alert" on the screen, and is absent before any import is attempted', async () => {
    const user = userEvent.setup()
    vi.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('network down'))
    useTopTableStore.getState().setGuests(makeGuests(5))
    renderSetupScreen()

    expect(screen.queryByRole('alert')).not.toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: /Adding up/i }))
    await user.click(screen.getByRole('button', { name: 'Load Adding up' }))
    await screen.findByText('Adding up could not be loaded.')

    expect(screen.getAllByRole('alert')).toHaveLength(1)
  })

  it('A15: leaves all three cards on screen alongside the failure message', async () => {
    const user = userEvent.setup()
    vi.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('network down'))
    useTopTableStore.getState().setGuests(makeGuests(5))
    renderSetupScreen()

    await user.click(screen.getByRole('button', { name: /Adding up/i }))
    await user.click(screen.getByRole('button', { name: 'Load Adding up' }))
    await screen.findByText('Adding up could not be loaded.')

    expect(screen.getByRole('button', { name: /Small and cosy/i })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Adding up/i })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Celebrity scale/i })).toBeInTheDocument()
  })
})

describe('at most one "Load" control exists at a time, and it never coexists with "Change scenario" (C25, C32)', () => {
  it('across a full flow: idle, confirming and after-import', async () => {
    const user = userEvent.setup()
    mockScenarioFetch()
    useTopTableStore.getState().setGuests(makeGuests(5))
    renderSetupScreen()

    expect(screen.queryAllByRole('button', { name: /^Load /i })).toHaveLength(0)
    expect(screen.queryByRole('button', { name: 'Change scenario' })).not.toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: /Adding up/i }))
    expect(screen.getAllByRole('button', { name: /^Load /i })).toHaveLength(1)
    expect(screen.queryByRole('button', { name: 'Change scenario' })).not.toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Load Adding up' }))
    await screen.findByText('Adding up loaded')

    expect(screen.queryAllByRole('button', { name: /^Load /i })).toHaveLength(0)
    expect(screen.getByRole('button', { name: 'Change scenario' })).toBeInTheDocument()
  })
})

// The window between activating a load and the import committing. Both TT-4's routes into a
// load destroy the element the user was operating, so without care focus lands on <body> and
// a keyboard user's next Tab restarts from the top of the document. Needs a fetch that never
// settles, or the window closes before anything can be observed.
describe('focus survives the load window', () => {
  function pendingScenarioFetch() {
    return vi.spyOn(globalThis, 'fetch').mockImplementation(() => new Promise(() => {}))
  }

  // Documents intent; guards little. jsdom does not implement blurring an element that
  // becomes disabled, so this passes even with `disabled` back on the loading card — which
  // is exactly how the defect stayed invisible. The three cases below do guard. Verified by
  // hand in Chrome via document.activeElement.
  it('keeps focus on the invoking card while a direct first-visit load is in flight', async () => {
    const user = userEvent.setup()
    pendingScenarioFetch()
    renderSetupScreen()

    const card = screen.getByRole('button', { name: /Adding up/i })
    await user.click(card)

    await screen.findByText(/Loading Adding up/i)
    expect(document.activeElement).toBe(card)
    expect(document.activeElement).not.toBe(document.body)
  })

  it('returns focus to the invoking card when a load starts from the confirmation prompt', async () => {
    const user = userEvent.setup()
    pendingScenarioFetch()
    useTopTableStore.getState().setGuests(makeGuests(5))
    renderSetupScreen()

    const card = screen.getByRole('button', { name: /Adding up/i })
    await user.click(card)
    await user.click(screen.getByRole('button', { name: 'Load Adding up' }))

    await screen.findByText(/Loading Adding up/i)
    expect(document.activeElement).toBe(card)
  })

  it('leaves no card disabled during a load, so none of them can be blurred by it', async () => {
    const user = userEvent.setup()
    pendingScenarioFetch()
    renderSetupScreen()

    await user.click(screen.getByRole('button', { name: /Adding up/i }))

    await screen.findByText(/Loading Adding up/i)
    expect(document.querySelectorAll('[disabled]')).toHaveLength(0)
  })

  it('ignores a second card click while a load is in flight', async () => {
    const user = userEvent.setup()
    const fetchSpy = pendingScenarioFetch()
    renderSetupScreen()

    await user.click(screen.getByRole('button', { name: /Adding up/i }))
    await screen.findByText(/Loading Adding up/i)
    await user.click(screen.getByRole('button', { name: /Celebrity scale/i }))

    expect(fetchSpy).toHaveBeenCalledTimes(1)
    expect(screen.getByText(/Loading Adding up/i)).toBeInTheDocument()
  })
})

describe('two rapid clicks on different cards produce one import, matching the last confirmation accepted', () => {
  it('re-targets the prompt, and only the second scenario is imported', async () => {
    const user = userEvent.setup()
    mockScenarioFetch()
    useTopTableStore.getState().setGuests(makeGuests(5))
    renderSetupScreen()

    await user.click(screen.getByRole('button', { name: /Adding up/i }))
    await user.click(screen.getByRole('button', { name: /Celebrity scale/i }))

    expect(screen.getByRole('button', { name: 'Load Celebrity scale' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Load Adding up' })).not.toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Load Celebrity scale' }))
    await screen.findByText('Celebrity scale loaded')

    const state = useTopTableStore.getState()
    expect(state.guests).toHaveLength(200)
    expect(state.room).toEqual({ roundTables: 26, seatsEach: 8, topTableSeats: 8 })
    expect(state.scenario).toBe('celebrity-scale')
  })
})

describe('Build B: the picker collapses after a successful import, behind "Change scenario" (C29, C30, C31, C33, Assumed A14)', () => {
  it('C29: the cards, heading, subtitle and divider are all absent after a successful import', async () => {
    const user = userEvent.setup()
    mockScenarioFetch()
    renderSetupScreen()

    await user.click(screen.getByRole('button', { name: /Small and cosy/i }))
    await screen.findByText('Small and cosy loaded')

    expect(screen.queryByRole('button', { name: /Small and cosy/i })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /Adding up/i })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /Celebrity scale/i })).not.toBeInTheDocument()
    expect(screen.queryByRole('heading', { name: 'Start from a scenario' })).not.toBeInTheDocument()
    expect(
      screen.queryByText('Loads a guest list and a matching room. Change anything after.'),
    ).not.toBeInTheDocument()
    expect(screen.queryByText(/or set it up yourself/i)).not.toBeInTheDocument()
  })

  it('C30: "Change scenario" follows the chip, and both precede the event name field', async () => {
    const user = userEvent.setup()
    mockScenarioFetch()
    renderSetupScreen()

    await user.click(screen.getByRole('button', { name: /Small and cosy/i }))
    const chip = await screen.findByText('Small and cosy loaded')

    const changeScenario = screen.getByRole('button', { name: 'Change scenario' })
    const eventNameField = screen.getByLabelText(/event name/i)

    expect(isBefore(chip, changeScenario)).toBe(true)
    expect(isBefore(chip, eventNameField)).toBe(true)
    expect(isBefore(changeScenario, eventNameField)).toBe(true)
  })

  it('C31: clicking "Change scenario" brings back the cards, heading, subtitle and divider, and the control itself is then absent', async () => {
    const user = userEvent.setup()
    mockScenarioFetch()
    renderSetupScreen()

    await user.click(screen.getByRole('button', { name: /Small and cosy/i }))
    await screen.findByText('Small and cosy loaded')

    await user.click(screen.getByRole('button', { name: 'Change scenario' }))

    expect(screen.getByRole('button', { name: /Small and cosy/i })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Adding up/i })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Celebrity scale/i })).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Start from a scenario' })).toBeInTheDocument()
    expect(
      screen.getByText('Loads a guest list and a matching room. Change anything after.'),
    ).toBeInTheDocument()
    expect(screen.getByText(/or set it up yourself/i)).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Change scenario' })).not.toBeInTheDocument()
  })

  it('C31: clicking "Change scenario" leaves focus on the first card, Small and cosy', async () => {
    const user = userEvent.setup()
    mockScenarioFetch()
    renderSetupScreen()

    await user.click(screen.getByRole('button', { name: /Small and cosy/i }))
    await screen.findByText('Small and cosy loaded')

    await user.click(screen.getByRole('button', { name: 'Change scenario' }))

    expect(screen.getByRole('button', { name: /Small and cosy/i })).toHaveFocus()
  })

  it('C33, Assumed A14: after a successful import, focus is on "Change scenario", not document.body', async () => {
    const user = userEvent.setup()
    mockScenarioFetch()
    renderSetupScreen()

    await user.click(screen.getByRole('button', { name: /Small and cosy/i }))
    await screen.findByText('Small and cosy loaded')

    expect(screen.getByRole('button', { name: 'Change scenario' })).toHaveFocus()
    expect(document.body).not.toHaveFocus()
  })

  it('Assumed A15: the flow state does not survive a collapse — a stale failure message does not reappear on a later reveal', async () => {
    const user = userEvent.setup()
    const fetchSpy = vi.spyOn(globalThis, 'fetch')
    fetchSpy.mockResolvedValueOnce(jsonResponse({ meta: {}, guests: makeGuests(40) }))
    fetchSpy.mockRejectedValueOnce(new Error('network down'))
    fetchSpy.mockResolvedValue(jsonResponse({ meta: {}, guests: makeGuests(70) }))

    renderSetupScreen()

    // 1. a true first-visit import of Small and cosy succeeds and the picker collapses.
    await user.click(screen.getByRole('button', { name: /Small and cosy/i }))
    await screen.findByText('Small and cosy loaded')

    // 2. reveal the cards again.
    await user.click(screen.getByRole('button', { name: 'Change scenario' }))
    await screen.findByRole('button', { name: /Adding up/i })

    // 3. existing data now means a confirm step; this attempt fails.
    await user.click(screen.getByRole('button', { name: /Adding up/i }))
    await user.click(screen.getByRole('button', { name: 'Load Adding up' }))
    await screen.findByText('Adding up could not be loaded.')

    // 4. retry the same card; this time it succeeds and the picker collapses again.
    await user.click(screen.getByRole('button', { name: /Adding up/i }))
    await user.click(screen.getByRole('button', { name: 'Load Adding up' }))
    await screen.findByText('Adding up loaded')

    // 5. reveal again — the stale failure message must not reappear.
    await user.click(screen.getByRole('button', { name: 'Change scenario' }))
    await screen.findByRole('button', { name: /Small and cosy/i })

    expect(screen.queryByText(/could not be loaded/i)).not.toBeInTheDocument()
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  })
})

describe('accessibility gate at the after-import render (no existing test reaches this render)', () => {
  it('exactly one polite aria-live region with no aria-atomic; no role="status"; no role="alert" after a successful import', async () => {
    const user = userEvent.setup()
    mockScenarioFetch()
    const { container } = renderSetupScreen()

    await user.click(screen.getByRole('button', { name: /Small and cosy/i }))
    await screen.findByText('Small and cosy loaded')

    const liveRegions = Array.from(container.querySelectorAll('[aria-live]'))
    expect(liveRegions).toHaveLength(1)
    expect(liveRegions[0]?.getAttribute('aria-live')).toBe('polite')
    expect(liveRegions[0]?.hasAttribute('aria-atomic')).toBe(false)
    expect(screen.queryByRole('status')).not.toBeInTheDocument()
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  })
})
