import { beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import App from '../../App'
import { useTopTableStore } from '../../store/store'
import type { Guest } from '../../domain/types'
import { tabularClass } from '../../ui'

/**
 * TT-37, "Clear the allocation". Written from the acceptance criteria in
 * .claude/plans/TT-37.md section 3, TT-37 itself, KB-1 and KB-5, without opening
 * PlanScreen.tsx, ClearControls.tsx, App.tsx or SetupScreen.tsx. Guest fixtures and the
 * render-through-App-and-navigate-by-tab harness follow planAllocation.test.tsx's own
 * `makeGuest`/`makeGuests`/`renderAppOnPlanTab`/`tables`/`tableLabelled`/`selectTable`/
 * `tableDetailPanel`/`readHeaderFigures` conventions; the scenario-import mock follows
 * scenarioImport.test.tsx's own `mockScenarioFetch` convention (both are test files, not the
 * implementation).
 *
 * "Neither control nor either confirm button is filled" (AC5) is KB-5's slate-filled `primary`
 * Button variant, applied via a CSS module class. That class renders in this suite's jsdom
 * configuration exactly as it does in a browser (verified directly), and this same directory's
 * PlanTable.test.tsx:228-230 already asserts on module class names
 * (`expect(top.className).not.toBe(round.className)`) — precedent for doing so, not against it.
 * So AC5 is guarded on the classes themselves, never on a hashed literal: `assertOnlyAutoAllocateIsFilled`
 * takes every clear-related button on screen plus Auto-allocate, subtracts whatever class token
 * *all* of them share (the Button component's own base class, whatever its hash), and asserts
 * none of the remainder — each button's own variant token — is shared with Auto-allocate's own.
 * Two buttons sharing a token beyond the shared base means they share a variant, which for
 * anything compared against Auto-allocate means "also filled". This runs with a confirm prompt
 * open in each flow, which is the moment AC5 says the rule is easiest to break — the prompt's own
 * `Cancel` button is what keeps the comparison honest there: it is definitely not filled, so it
 * stops "everyone in the set happens to share a token" from reading as "nothing is filled".
 *
 * A confirm prompt is located by climbing from its own `Cancel` button (unique — only one flow
 * is ever `confirming` at a time) to the nearest ancestor whose text also contains "cannot be
 * undone", the sentence common to both prompt bodies per the plan's section 6 copy. This is the
 * same climb-to-nearest-ancestor pattern planAllocation.test.tsx's own `tableDetailPanel` uses,
 * and it scopes queries to the open prompt regardless of whether the two trigger buttons stay
 * mounted alongside it (undocumented in the acceptance criteria either way).
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

function tables(): HTMLElement[] {
  return Array.from(document.querySelectorAll('[data-occupancy]'))
}

// Once a room has a top table it renders first, so tables()[0] is no longer "the table under
// test" — this locates one by its own rendered label instead of DOM position. Matched on a
// leading ", " too, since a pinned or violating table appends that to the same heading text.
function tableLabelled(label: string): HTMLElement {
  const match = tables().find((table) => {
    const heading = table.querySelector('p')?.textContent ?? ''
    return heading === label || heading.startsWith(`${label},`)
  })
  if (!match) {
    throw new Error(`no table labelled "${label}"`)
  }
  return match
}

async function selectTable(user: ReturnType<typeof userEvent.setup>, label: string): Promise<void> {
  const button = tableLabelled(label).querySelector('button')
  if (!button) {
    throw new Error(`expected a select button on the table labelled "${label}"`)
  }
  await user.click(button)
}

// TT-15's pattern: the release control and every guest name live in the table detail panel, so
// this climbs from the table's own heading to the nearest ancestor that also holds the "Close
// table detail" control and a list — the same joint condition planAllocation.test.tsx's helper
// of the same name uses, so a guest left on the rail can't be mistaken for one seated here.
function tableDetailPanel(tableLabel: string): HTMLElement {
  const dismiss = screen.getByRole('button', { name: 'Close table detail' })
  let node: HTMLElement | null = screen.getByRole('heading', { name: tableLabel })
  while (node && (!node.contains(dismiss) || !node.querySelector('ol, ul, [role="list"]'))) {
    node = node.parentElement
  }
  if (!node) {
    throw new Error(`could not locate the table detail panel for "${tableLabel}"`)
  }
  return node
}

// Renders the real app and activates its Plan tab.
async function renderAppOnPlanTab(user: ReturnType<typeof userEvent.setup>) {
  const result = render(<App />)
  await user.click(screen.getByRole('button', { name: 'Plan' }))
  return result
}

// The capacity headline ("N seats for M guests") is safe to read off flattened body text: its
// figures and words are separate JSX children with a literal space between them. The Pinned/
// Unseated stat pair is not — PlanHeader's own qualifier sentence ("...plus a top table of 2")
// sits immediately before the stat pair with no space at the element boundary, so a flattened
// "...of 20Pinned0Unseated..." would let a naive `/(\d+)\s*Pinned/` swallow the qualifier's
// trailing digit too (verified: a room ending "...top table of 2" read back as Pinned: 20, not
// 2, before this was written). The stat figures are read structurally instead, and that is why
// this helper exists at all rather than a flattened-text regex.
//
// TT-16 part two: Unseated stays inert, so its figure and label are still each their own `<p>`.
// Pinned becomes a toggle once one or more guests are pinned, and a `<button>` admits only
// phrasing content, so its figure and label are `<span>`s, not `<p>`s — the selector below reads
// both. Inside that button, tree order gives the value span ("3") before the label span
// ("Pinned"), and a visually-hidden suffix span ("guests") comes after the label, so `.find`
// below reaches "Pinned" first and never that suffix. The score toggle, built the same way,
// contributes a harmless stray "Fit" entry this helper never reads. "Unseated" is not used as
// the anchor — the rail's own column also renders that exact word, so `getByText('Unseated')`
// would be ambiguous; "Pinned" alone is not.
function headerStats(): { pinned: number; unseated: number } {
  const pinnedLabel = screen.getByText('Pinned')
  const statsContainer = pinnedLabel.parentElement?.parentElement
  if (!statsContainer) {
    throw new Error('could not locate the header\'s stats container from the "Pinned" label')
  }

  const figures = new Map<string, number>()
  for (const stat of Array.from(statsContainer.children)) {
    const labelEl = Array.from(stat.querySelectorAll('p, span')).find((p) =>
      /^[A-Za-z]+$/.test(p.textContent?.trim() ?? ''),
    )
    const valueEl = Array.from(stat.querySelectorAll('p, span')).find((p) =>
      /^\d+$/.test(p.textContent?.trim() ?? ''),
    )
    const label = labelEl?.textContent?.trim()
    const value = valueEl?.textContent?.trim()
    if (label && value !== undefined) {
      figures.set(label, Number(value))
    }
  }

  const pinned = figures.get('Pinned')
  const unseated = figures.get('Unseated')
  if (pinned === undefined || unseated === undefined) {
    throw new Error(`expected both "Pinned" and "Unseated" stats; got ${JSON.stringify([...figures])}`)
  }
  return { pinned, unseated }
}

function readHeaderFigures(text: string): { guests: number; seats: number; pinned: number; unseated: number } {
  const headline = /(\d+)\s*seats\s*for\s*(\d+)\s*guests/i.exec(text)
  if (!headline) {
    throw new Error(`expected the header's capacity headline in the rendered text; got: ${JSON.stringify(text)}`)
  }
  const [, seatsText, guestsText] = headline
  if (guestsText === undefined || seatsText === undefined) {
    throw new Error('headline regex matched without both capture groups')
  }
  return {
    guests: Number(guestsText),
    seats: Number(seatsText),
    ...headerStats(),
  }
}

// TT-14's own attribute, already established in ViolationsPanel.test.tsx and PlanScreen.test.tsx.
function violationEntries(): HTMLElement[] {
  return Array.from(document.querySelectorAll('[data-severity]'))
}

// Locates the currently open confirm prompt, scoping every query inside it away from the two
// trigger buttons and the header's own (unrelated) pinned figure. See the file header comment.
function openPrompt(): HTMLElement {
  const cancel = screen.getByRole('button', { name: 'Cancel' })
  let node: HTMLElement | null = cancel.parentElement
  while (node && !(node.textContent ?? '').includes('cannot be undone')) {
    node = node.parentElement
  }
  if (!node) {
    throw new Error('could not locate the open confirm prompt')
  }
  return node
}

function tabularTexts(container: HTMLElement): string[] {
  return Array.from(container.querySelectorAll(`.${tabularClass}`)).map((el) => el.textContent?.trim() ?? '')
}

// AC5's guard. Takes Auto-allocate plus every clear-related button currently on screen (both
// triggers, named "Clear allocation" / "Clear allocation and pins"; and, while a prompt is open,
// its Cancel and its own confirm button, which share the trigger's name — hence
// `queryAllByRole` rather than `getByRole`, and why a query anchored on `/^Clear allocation/`
// finds both a trigger and its confirm button at once). The token every one of them shares
// (Button's own base class, whatever its hash) is subtracted from each one's own classes; what
// is left is that button's variant token(s). A button sharing a variant token with Auto-allocate
// is exactly a button that is also filled. Cancel is the reason this discriminates rather than
// vacuously passing: if it (correctly) does not share Auto-allocate's token, the shared "base"
// subtracted out above cannot have silently absorbed the primary token too — which is what would
// happen, and what would wrongly report "fine", the moment *every* other button on screen were
// filled to match Auto-allocate.
function assertOnlyAutoAllocateIsFilled(): void {
  const autoAllocate = screen.getByRole('button', { name: 'Auto-allocate' })
  const others = [
    ...screen.queryAllByRole('button', { name: /^Clear allocation/ }),
    ...screen.queryAllByRole('button', { name: 'Cancel' }),
  ]
  expect(others.length).toBeGreaterThan(0)

  const all = [autoAllocate, ...others]
  const classSets = all.map((el) => new Set(Array.from(el.classList)))
  const shared = classSets.reduce(
    (common, tokens) => new Set([...common].filter((token) => tokens.has(token))),
    classSets[0]!,
  )
  expect(shared.size).toBeGreaterThan(0) // sanity: there is a real base class to subtract at all

  const autoAllocateOwn = new Set([...classSets[0]!].filter((token) => !shared.has(token)))
  expect(autoAllocateOwn.size).toBeGreaterThan(0) // sanity: Auto-allocate does carry a variant token

  others.forEach((other, index) => {
    const otherOwn = new Set([...classSets[index + 1]!].filter((token) => !shared.has(token)))
    const sharedWithAutoAllocate = [...autoAllocateOwn].filter((token) => otherOwn.has(token))
    expect(sharedWithAutoAllocate, `"${other.textContent}" shares a variant token with Auto-allocate`).toEqual([])
  })
}

// Copied from scenarioImport.test.tsx's own convention (AC9, the import defect, needs a real
// scenario import through the real Setup screen). `vi.spyOn` rather than `vi.stubGlobal`
// because vite.config.ts's `restoreMocks: true` restores spies but not stubbed globals.
const SCENARIO_GUEST_COUNTS = {
  'small-and-cosy': 40,
  'adding-up': 70,
} as const

function urlOf(input: unknown): string {
  if (typeof input === 'string') return input
  if (input instanceof URL) return input.toString()
  if (input instanceof Request) return input.url
  return String(input)
}

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status })
}

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

describe('AC1 — "Clear allocation" returns every unpinned seated guest to the rail', () => {
  it('with spare capacity: after Auto-allocate, clearing empties every table and the rail gains every guest', async () => {
    useTopTableStore.getState().setRoom({ roundTables: 2, seatsEach: 4, topTableSeats: 2 })
    useTopTableStore.getState().setGuests(makeGuests(6))
    const user = userEvent.setup()
    await renderAppOnPlanTab(user)

    await user.click(screen.getByRole('button', { name: 'Auto-allocate' }))
    expect(readHeaderFigures(document.body.textContent ?? '').unseated).toBe(0)

    const trigger = screen.getByRole('button', { name: 'Clear allocation' })
    await user.click(trigger)
    await user.click(within(openPrompt()).getByRole('button', { name: 'Clear allocation' }))

    const figures = readHeaderFigures(document.body.textContent ?? '')
    expect(figures.unseated).toBe(6)
    expect(figures.pinned).toBe(0)
    for (const table of tables()) {
      expect(table.getAttribute('data-occupancy')).toBe('empty')
    }
    expect(screen.getByRole('button', { name: 'Guest g-0' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Guest g-5' })).toBeInTheDocument()
    expect(trigger).toHaveFocus()
  })

  it('capacity that bites exactly on the round tables: 6 guests for 6 round seats, clears the same way', async () => {
    // The top table's own 2 seats stay spare regardless — no guest here holds a protocol role,
    // so Auto-allocate never offers them one — this is the round tables' own capacity biting
    // exactly, at 6 guests for 6 round seats.
    useTopTableStore.getState().setRoom({ roundTables: 2, seatsEach: 3, topTableSeats: 2 })
    useTopTableStore.getState().setGuests(makeGuests(6))
    const user = userEvent.setup()
    await renderAppOnPlanTab(user)

    await user.click(screen.getByRole('button', { name: 'Auto-allocate' }))
    expect(readHeaderFigures(document.body.textContent ?? '').unseated).toBe(0)

    await user.click(screen.getByRole('button', { name: 'Clear allocation' }))
    await user.click(within(openPrompt()).getByRole('button', { name: 'Clear allocation' }))

    const figures = readHeaderFigures(document.body.textContent ?? '')
    expect(figures.unseated).toBe(6)
    for (const table of tables()) {
      expect(table.getAttribute('data-occupancy')).toBe('empty')
    }
  })
})

describe('AC2 — pinned guests keep their table when the allocation is cleared (the criterion the ticket turns on)', () => {
  it('two pinned guests stay at their own tables, by name, and the Pinned figure is unchanged', async () => {
    useTopTableStore.getState().setRoom({ roundTables: 2, seatsEach: 4, topTableSeats: 2 })
    const priya = makeGuest('priya', { name: 'Priya Shah' })
    const tom = makeGuest('tom', { name: 'Tom Okafor' })
    useTopTableStore.getState().setGuests([priya, tom, ...makeGuests(4)])
    useTopTableStore.getState().pinGuest('priya', 'round-1')
    useTopTableStore.getState().pinGuest('tom', 'round-2')

    const user = userEvent.setup()
    await renderAppOnPlanTab(user)
    await user.click(screen.getByRole('button', { name: 'Auto-allocate' }))
    expect(readHeaderFigures(document.body.textContent ?? '').pinned).toBe(2)

    await user.click(screen.getByRole('button', { name: 'Clear allocation' }))
    await user.click(within(openPrompt()).getByRole('button', { name: 'Clear allocation' }))

    expect(readHeaderFigures(document.body.textContent ?? '').pinned).toBe(2)

    await selectTable(user, 'Table 1')
    expect(within(tableDetailPanel('Table 1')).getByRole('list').textContent).toContain('Priya Shah')

    await selectTable(user, 'Table 2')
    expect(within(tableDetailPanel('Table 2')).getByRole('list').textContent).toContain('Tom Okafor')

    // The four unpinned filler guests went to the rail; the two pinned guests did not join them.
    expect(readHeaderFigures(document.body.textContent ?? '').unseated).toBe(4)
    expect(screen.queryByRole('button', { name: 'Priya Shah' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Tom Okafor' })).not.toBeInTheDocument()
  })
})

describe('AC3 — "Clear allocation and pins" leaves every guest unseated and Pinned at zero', () => {
  it('both previously pinned guests return to the rail, by name, and the store\'s pins are empty', async () => {
    useTopTableStore.getState().setRoom({ roundTables: 2, seatsEach: 4, topTableSeats: 2 })
    const priya = makeGuest('priya', { name: 'Priya Shah' })
    const tom = makeGuest('tom', { name: 'Tom Okafor' })
    useTopTableStore.getState().setGuests([priya, tom, ...makeGuests(4)])
    useTopTableStore.getState().pinGuest('priya', 'round-1')
    useTopTableStore.getState().pinGuest('tom', 'round-2')

    const user = userEvent.setup()
    await renderAppOnPlanTab(user)
    await user.click(screen.getByRole('button', { name: 'Auto-allocate' }))

    const trigger = screen.getByRole('button', { name: 'Clear allocation and pins' })
    await user.click(trigger)
    await user.click(within(openPrompt()).getByRole('button', { name: 'Clear allocation and pins' }))

    const figures = readHeaderFigures(document.body.textContent ?? '')
    expect(figures.pinned).toBe(0)
    expect(figures.unseated).toBe(6)
    expect(useTopTableStore.getState().pins).toEqual([])
    for (const table of tables()) {
      expect(table.getAttribute('data-occupancy')).toBe('empty')
    }
    expect(screen.getByRole('button', { name: 'Priya Shah' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Tom Okafor' })).toBeInTheDocument()
    expect(trigger).toHaveFocus()
  })
})

describe('AC4 — both confirm prompts guard the action: opening one, or cancelling it, changes nothing', () => {
  async function setUpAllocatedPlan(user: ReturnType<typeof userEvent.setup>) {
    useTopTableStore.getState().setRoom({ roundTables: 2, seatsEach: 4, topTableSeats: 2 })
    const priya = makeGuest('priya', { name: 'Priya Shah' })
    useTopTableStore.getState().setGuests([priya, ...makeGuests(4)])
    useTopTableStore.getState().pinGuest('priya', 'round-1')
    await renderAppOnPlanTab(user)
    await user.click(screen.getByRole('button', { name: 'Auto-allocate' }))
  }

  it('"Clear allocation": opening the prompt changes no count, and Cancel leaves seating, pins and counts identical', async () => {
    const user = userEvent.setup()
    await setUpAllocatedPlan(user)

    const tablesBefore = tables().map((table) => table.textContent)
    const figuresBefore = readHeaderFigures(document.body.textContent ?? '')
    const pinsBefore = useTopTableStore.getState().pins

    const trigger = screen.getByRole('button', { name: 'Clear allocation' })
    await user.click(trigger)
    expect(readHeaderFigures(document.body.textContent ?? '')).toEqual(figuresBefore)

    await user.click(within(openPrompt()).getByRole('button', { name: 'Cancel' }))

    expect(tables().map((table) => table.textContent)).toEqual(tablesBefore)
    expect(readHeaderFigures(document.body.textContent ?? '')).toEqual(figuresBefore)
    expect(useTopTableStore.getState().pins).toEqual(pinsBefore)
    expect(trigger).toHaveFocus()
    expect(document.activeElement).not.toBe(document.body)
  })

  it('"Clear allocation and pins": opening the prompt changes no count, and Cancel leaves seating, pins and counts identical', async () => {
    const user = userEvent.setup()
    await setUpAllocatedPlan(user)

    const tablesBefore = tables().map((table) => table.textContent)
    const figuresBefore = readHeaderFigures(document.body.textContent ?? '')
    const pinsBefore = useTopTableStore.getState().pins

    const trigger = screen.getByRole('button', { name: 'Clear allocation and pins' })
    await user.click(trigger)
    expect(readHeaderFigures(document.body.textContent ?? '')).toEqual(figuresBefore)

    await user.click(within(openPrompt()).getByRole('button', { name: 'Cancel' }))

    expect(tables().map((table) => table.textContent)).toEqual(tablesBefore)
    expect(readHeaderFigures(document.body.textContent ?? '')).toEqual(figuresBefore)
    expect(useTopTableStore.getState().pins).toEqual(pinsBefore)
    expect(trigger).toHaveFocus()
    expect(document.activeElement).not.toBe(document.body)
  })
})

describe('AC5 — Auto-allocate remains the screen\'s only filled control, including while a prompt is open', () => {
  it('exactly one "Auto-allocate" button exists idle, with either prompt open, and after it closes', async () => {
    useTopTableStore.getState().setRoom({ roundTables: 1, seatsEach: 4, topTableSeats: 2 })
    useTopTableStore.getState().setGuests(makeGuests(2))
    const user = userEvent.setup()
    await renderAppOnPlanTab(user)
    await user.click(screen.getByRole('button', { name: 'Auto-allocate' }))

    expect(screen.getAllByRole('button', { name: 'Auto-allocate' })).toHaveLength(1)

    await user.click(screen.getByRole('button', { name: 'Clear allocation' }))
    expect(screen.getAllByRole('button', { name: 'Auto-allocate' })).toHaveLength(1)
    await user.click(within(openPrompt()).getByRole('button', { name: 'Cancel' }))

    await user.click(screen.getByRole('button', { name: 'Clear allocation and pins' }))
    expect(screen.getAllByRole('button', { name: 'Auto-allocate' })).toHaveLength(1)
    await user.click(within(openPrompt()).getByRole('button', { name: 'Cancel' }))

    expect(screen.getAllByRole('button', { name: 'Auto-allocate' })).toHaveLength(1)
  })

  it('idle: neither trigger shares a variant token with Auto-allocate', async () => {
    useTopTableStore.getState().setRoom({ roundTables: 1, seatsEach: 4, topTableSeats: 2 })
    useTopTableStore.getState().setGuests(makeGuests(2))
    const user = userEvent.setup()
    await renderAppOnPlanTab(user)
    await user.click(screen.getByRole('button', { name: 'Auto-allocate' }))

    assertOnlyAutoAllocateIsFilled()
  })

  it('with the "Clear allocation" prompt open: neither trigger, its own confirm button, nor Cancel shares a variant token with Auto-allocate', async () => {
    useTopTableStore.getState().setRoom({ roundTables: 1, seatsEach: 4, topTableSeats: 2 })
    useTopTableStore.getState().setGuests(makeGuests(2))
    const user = userEvent.setup()
    await renderAppOnPlanTab(user)
    await user.click(screen.getByRole('button', { name: 'Auto-allocate' }))

    await user.click(screen.getByRole('button', { name: 'Clear allocation' }))
    assertOnlyAutoAllocateIsFilled()
  })

  it('with the "Clear allocation and pins" prompt open: neither trigger, its own confirm button, nor Cancel shares a variant token with Auto-allocate', async () => {
    useTopTableStore.getState().setRoom({ roundTables: 1, seatsEach: 4, topTableSeats: 2 })
    useTopTableStore.getState().setGuests(makeGuests(2))
    const user = userEvent.setup()
    await renderAppOnPlanTab(user)
    await user.click(screen.getByRole('button', { name: 'Auto-allocate' }))

    await user.click(screen.getByRole('button', { name: 'Clear allocation and pins' }))
    assertOnlyAutoAllocateIsFilled()
  })
})

describe('AC6 — a hard violation survives "Clear allocation", and clears once the pins are cleared too', () => {
  it('over-pinning a table past capacity: the violation names the table after clearing the allocation, and is gone after clearing the pins', async () => {
    useTopTableStore.getState().setRoom({ roundTables: 1, seatsEach: 2, topTableSeats: 2 })
    useTopTableStore.getState().setGuests(makeGuests(3))
    useTopTableStore.getState().pinGuest('g-0', 'round-1')
    useTopTableStore.getState().pinGuest('g-1', 'round-1')
    useTopTableStore.getState().pinGuest('g-2', 'round-1')

    const user = userEvent.setup()
    await renderAppOnPlanTab(user)
    await user.click(screen.getByRole('button', { name: 'Auto-allocate' }))
    expect(document.body.textContent).toContain('Table 1 over capacity')

    await user.click(screen.getByRole('button', { name: 'Clear allocation' }))
    await user.click(within(openPrompt()).getByRole('button', { name: 'Clear allocation' }))

    expect(document.body.textContent).toContain('Table 1 over capacity')
    expect(readHeaderFigures(document.body.textContent ?? '').pinned).toBe(3)

    await user.click(screen.getByRole('button', { name: 'Clear allocation and pins' }))
    await user.click(within(openPrompt()).getByRole('button', { name: 'Clear allocation and pins' }))

    expect(document.body.textContent).not.toContain('Table 1 over capacity')
    expect(document.body.textContent).toContain('No violations.')
    expect(violationEntries()).toHaveLength(0)
    expect(readHeaderFigures(document.body.textContent ?? '').pinned).toBe(0)
  })
})

describe('AC7 — each trigger\'s label is the exact label of its own confirm button', () => {
  it('"Clear allocation" trigger opens a prompt whose confirm button reads exactly "Clear allocation"', async () => {
    useTopTableStore.getState().setRoom({ roundTables: 1, seatsEach: 4, topTableSeats: 2 })
    useTopTableStore.getState().setGuests(makeGuests(2))
    const user = userEvent.setup()
    await renderAppOnPlanTab(user)
    await user.click(screen.getByRole('button', { name: 'Auto-allocate' }))

    const trigger = screen.getByRole('button', { name: 'Clear allocation' })
    await user.click(trigger)

    const confirmButton = within(openPrompt()).getByRole('button', { name: 'Clear allocation' })
    expect(confirmButton).toBeInTheDocument()
    expect(confirmButton).not.toBe(trigger)
  })

  it('"Clear allocation and pins" trigger opens a prompt whose confirm button reads exactly "Clear allocation and pins"', async () => {
    useTopTableStore.getState().setRoom({ roundTables: 1, seatsEach: 4, topTableSeats: 2 })
    useTopTableStore.getState().setGuests(makeGuests(2))
    const user = userEvent.setup()
    await renderAppOnPlanTab(user)
    await user.click(screen.getByRole('button', { name: 'Auto-allocate' }))

    const trigger = screen.getByRole('button', { name: 'Clear allocation and pins' })
    await user.click(trigger)

    const confirmButton = within(openPrompt()).getByRole('button', { name: 'Clear allocation and pins' })
    expect(confirmButton).toBeInTheDocument()
    expect(confirmButton).not.toBe(trigger)
  })
})

describe('AC8 — the pin figure in each prompt body carries the tabular class', () => {
  it('shows "3" in a tabularClass element inside both prompts, with 3 guests pinned', async () => {
    useTopTableStore.getState().setRoom({ roundTables: 2, seatsEach: 4, topTableSeats: 2 })
    useTopTableStore.getState().setGuests(makeGuests(6))
    useTopTableStore.getState().pinGuest('g-0', 'round-1')
    useTopTableStore.getState().pinGuest('g-1', 'round-1')
    useTopTableStore.getState().pinGuest('g-2', 'round-2')

    const user = userEvent.setup()
    await renderAppOnPlanTab(user)
    await user.click(screen.getByRole('button', { name: 'Auto-allocate' }))
    expect(readHeaderFigures(document.body.textContent ?? '').pinned).toBe(3)

    await user.click(screen.getByRole('button', { name: 'Clear allocation' }))
    expect(tabularTexts(openPrompt())).toContain('3')
    await user.click(within(openPrompt()).getByRole('button', { name: 'Cancel' }))

    await user.click(screen.getByRole('button', { name: 'Clear allocation and pins' }))
    expect(tabularTexts(openPrompt())).toContain('3')
  })
})

// Not itself a numbered AC — a copy defect review found, with no existing test at any pin
// count other than two or three. Every prompt test elsewhere in this file pins two or three
// guests, which is exactly why the suite stayed green while the rendered copy read "Your 1
// pinned guests stay where they are" and "releases all 1 pins". These six cases (zero, one,
// two pins, times each of the two prompts) anchor on the grammatical shape a reader would see
// rather than on one exact sentence, so a wording change that keeps the grammar right still
// passes: singular "guest"/"pin" at one (a word — "the pin" — is an equally valid singular),
// plural "guests"/"pins" at zero and two. Zero is asserted more narrowly for the pins sentence:
// English "0 pins" is standard plural, so nothing here requires the sentence to name a count at
// all, or forbids "0 pins" outright — what is asserted is that today's specific broken reading,
// "all 0 pins", is gone, since "all" quantifying over nothing is what reads wrong, not the
// plural noun itself. That is this file's own reading of an otherwise-unspecified case, chosen
// because the ticket and KB-5 are both silent on zero-pins wording.
//
// Scoped to the open prompt's own text (`openPrompt()`, already used elsewhere in this file for
// exactly this reason) rather than flattened `document.body.textContent` — the header's own
// figures sit outside the prompt so cannot bleed in here regardless, but scoping still stands on
// its own merits. Every regex below spells out the surrounding words rather than relying on
// `\b` at the digit itself: `\b` does not fire between a digit and an adjacent letter (no space),
// only between a `\w` and non-`\w` character, so a digit run straight into a word by a markup
// change would silently defeat a bare `\b\d+\b` the way it did on TT-38 — requiring literal
// whitespace (`\s+`) around the number sidesteps that rather than depending on it.
describe('Copy grammar — the pinned-guest and pin-release sentences read naturally at zero, one and two pins', () => {
  async function setUpWithPins(user: ReturnType<typeof userEvent.setup>, pinnedCount: 0 | 1 | 2): Promise<void> {
    useTopTableStore.getState().setRoom({ roundTables: 1, seatsEach: 4, topTableSeats: 2 })
    useTopTableStore.getState().setGuests(makeGuests(4))
    if (pinnedCount >= 1) useTopTableStore.getState().pinGuest('g-0', 'round-1')
    if (pinnedCount >= 2) useTopTableStore.getState().pinGuest('g-1', 'round-1')
    await renderAppOnPlanTab(user)
    await user.click(screen.getByRole('button', { name: 'Auto-allocate' }))
  }

  describe('"Clear allocation" — the sentence naming the pinned guests who stay', () => {
    it('zero pinned: never claims a lone pinned guest stays', async () => {
      const user = userEvent.setup()
      await setUpWithPins(user, 0)
      await user.click(screen.getByRole('button', { name: 'Clear allocation' }))

      const text = openPrompt().textContent ?? ''
      expect(text).not.toMatch(/\b0\s+pinned\s+guest\b(?!s)/i)
    })

    it('one pinned: reads as a single guest, never "1 pinned guests"', async () => {
      const user = userEvent.setup()
      await setUpWithPins(user, 1)
      await user.click(screen.getByRole('button', { name: 'Clear allocation' }))

      const text = openPrompt().textContent ?? ''
      expect(text).not.toMatch(/\b1\s+pinned\s+guests\b/i)
      expect(text).toMatch(/\bpinned\s+guest\b(?!s)/i)
    })

    it('two pinned: reads as plural guests', async () => {
      const user = userEvent.setup()
      await setUpWithPins(user, 2)
      await user.click(screen.getByRole('button', { name: 'Clear allocation' }))

      const text = openPrompt().textContent ?? ''
      expect(text).toMatch(/\b2\s+pinned\s+guests\b/i)
    })
  })

  describe('"Clear allocation and pins" — the sentence naming how many pins are released', () => {
    it('zero pins: never reads "all 0 pins"', async () => {
      const user = userEvent.setup()
      await setUpWithPins(user, 0)
      await user.click(screen.getByRole('button', { name: 'Clear allocation and pins' }))

      const text = openPrompt().textContent ?? ''
      expect(text).not.toMatch(/\ball\s+0\s+pins\b/i)
    })

    it('one pin: reads as a single pin, never "all 1 pins"', async () => {
      const user = userEvent.setup()
      await setUpWithPins(user, 1)
      await user.click(screen.getByRole('button', { name: 'Clear allocation and pins' }))

      const text = openPrompt().textContent ?? ''
      expect(text).not.toMatch(/\ball\s+1\s+pins\b/i)
      expect(text).toMatch(/\b(?:(?:all\s+)?1\s+pin\b(?!s)|the\s+pin\b(?!s))/i)
    })

    it('two pins: reads as plural pins', async () => {
      const user = userEvent.setup()
      await setUpWithPins(user, 2)
      await user.click(screen.getByRole('button', { name: 'Clear allocation and pins' }))

      const text = openPrompt().textContent ?? ''
      expect(text).toMatch(/\b2\s+pins\b/i)
    })
  })
})

describe('AC9 — the defect: importing a scenario leaves the room unallocated', () => {
  it('allocating one scenario, then importing a different one, seats nobody and resets Setup\'s own status line', async () => {
    mockScenarioFetch()
    const user = userEvent.setup()
    render(<App />)

    await user.click(screen.getByRole('button', { name: /Small and cosy/i }))
    await screen.findByText('Small and cosy loaded')

    await user.click(screen.getByRole('button', { name: 'Plan' }))
    await user.click(screen.getByRole('button', { name: 'Auto-allocate' }))
    // These fixture guests hold no protocol role, so Small and cosy's own top table (8 seats)
    // never fills — 32 round seats for 40 guests leaves 8 unseated. What this line is actually
    // proving is only that Auto-allocate ran at all (fewer unseated than the full guest list),
    // which is what "Allocated" on Setup, asserted next, depends on having happened.
    expect(readHeaderFigures(document.body.textContent ?? '').unseated).toBe(8)

    await user.click(screen.getByRole('button', { name: 'Setup' }))
    expect(document.body.textContent).toContain('Allocated')

    await user.click(screen.getByRole('button', { name: 'Change scenario' }))
    await user.click(screen.getByRole('button', { name: /Adding up/i }))
    await user.click(screen.getByRole('button', { name: 'Load Adding up' }))
    await screen.findByText('Adding up loaded')

    // The defect, fixed at its source: Setup's own status line, with no trip to Plan at all.
    expect(document.body.textContent).toContain('Not generated')
    expect(document.body.textContent).not.toContain('Allocated')

    await user.click(screen.getByRole('button', { name: 'Plan' }))
    const figures = readHeaderFigures(document.body.textContent ?? '')
    expect(figures.guests).toBe(70)
    expect(figures.unseated).toBe(70)
    expect(figures.pinned).toBe(0)
    for (const table of tables()) {
      expect(table.getAttribute('data-occupancy')).toBe('empty')
    }
  })
})

describe('Focus — after confirming, and after cancelling, focus lands on the trigger that opened the prompt', () => {
  it('"Clear allocation": focus returns to its own trigger after confirming', async () => {
    useTopTableStore.getState().setRoom({ roundTables: 1, seatsEach: 4, topTableSeats: 2 })
    useTopTableStore.getState().setGuests(makeGuests(2))
    const user = userEvent.setup()
    await renderAppOnPlanTab(user)
    await user.click(screen.getByRole('button', { name: 'Auto-allocate' }))

    const trigger = screen.getByRole('button', { name: 'Clear allocation' })
    await user.click(trigger)
    await user.click(within(openPrompt()).getByRole('button', { name: 'Clear allocation' }))

    expect(trigger).toHaveFocus()
    expect(document.activeElement).not.toBe(document.body)
  })

  it('"Clear allocation and pins": focus returns to its own trigger after confirming', async () => {
    useTopTableStore.getState().setRoom({ roundTables: 1, seatsEach: 4, topTableSeats: 2 })
    useTopTableStore.getState().setGuests(makeGuests(2))
    const user = userEvent.setup()
    await renderAppOnPlanTab(user)
    await user.click(screen.getByRole('button', { name: 'Auto-allocate' }))

    const trigger = screen.getByRole('button', { name: 'Clear allocation and pins' })
    await user.click(trigger)
    await user.click(within(openPrompt()).getByRole('button', { name: 'Clear allocation and pins' }))

    expect(trigger).toHaveFocus()
    expect(document.activeElement).not.toBe(document.body)
  })

  // Cancel-side focus is already asserted inline in AC4's two tests above; repeated here only
  // for the trigger this file has not yet cancelled, so every (trigger × confirm/cancel)
  // combination is covered somewhere in this file.
  it('"Clear allocation and pins": focus returns to its own trigger after cancelling', async () => {
    useTopTableStore.getState().setRoom({ roundTables: 1, seatsEach: 4, topTableSeats: 2 })
    useTopTableStore.getState().setGuests(makeGuests(2))
    const user = userEvent.setup()
    await renderAppOnPlanTab(user)
    await user.click(screen.getByRole('button', { name: 'Auto-allocate' }))

    const trigger = screen.getByRole('button', { name: 'Clear allocation and pins' })
    await user.click(trigger)
    await user.click(within(openPrompt()).getByRole('button', { name: 'Cancel' }))

    expect(trigger).toHaveFocus()
    expect(document.activeElement).not.toBe(document.body)
  })
})
