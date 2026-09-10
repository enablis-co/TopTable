import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest'
import { act, fireEvent, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { GuestsScreen } from './GuestsScreen'
import { useTopTableStore } from '../../store/store'
import type { Guest } from '../../domain/types'
import { NavigationContext } from '../../shell/navigation'

/**
 * TT-5, "Add and edit guests" — C12, C13 and TT-1's C33, all tested through the real screen and
 * the real store (not a mocked save), because C12 and C13 are claims about what a save or a
 * delete does to *other* rows and to reciprocal data, which only the full path — panel to store
 * to table — can show. Written from the acceptance criteria and .claude/plans/TT-5.md sections
 * 3 to 5. Does not open GuestsScreen.tsx, GuestPanel.tsx, GuestTable.tsx or guestDraft.ts.
 *
 * Save button text ("Save guest") and field labels are as in GuestPanel.test.tsx and
 * GuestsScreen.test.tsx's own header comments — see those for the sourcing. The row menu's
 * actions are queried via `findAction`, accepting either a `menuitem` or a `button` role, as in
 * GuestTable.test.tsx.
 *
 * C12 (A16): the highlight's duration is not published anywhere (R1) and nothing here asserts
 * one. What *is* asserted is presence-then-absence, read off the row's own class list and
 * `data-*` attributes compared to itself before and after a long fake-timer advance — the same
 * kind of observable state change `data-state="short"` gives the capacity readout in
 * SetupScreen.test.tsx, just without assuming this component picked the same attribute name. A
 * second, unrelated row is checked across the same advance as a control, so a spurious pass
 * (every row's signature drifting for reasons unrelated to highlighting) would be caught rather
 * than mistaken for the real thing.
 *
 * Environment note, not a product finding: with `vi.useFakeTimers()` active, this project's
 * pinned `@testing-library/user-event` (14.6.7) hangs indefinitely on its first `await
 * user.click(...)` — reproduced down to a bare `<button onClick>` with no relation to this
 * screen or to Top Table at all, so it is a version incompatibility between fake timers and
 * user-event's own internals here, not anything about GuestsScreen. Filling the form therefore
 * happens with a real-timer `user`, and only the save click — the one interaction that must
 * happen once fake timers are active, so its `setTimeout` is a fake one — uses `fireEvent`
 * instead, which dispatches the click directly rather than through user-event's Promise-driven
 * simulation.
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

function renderGuestsScreen() {
  return render(
    <NavigationContext.Provider value={{ tab: 'guests', goTo: () => {} }}>
      <GuestsScreen />
    </NavigationContext.Provider>,
  )
}

function requireRow(name: string): HTMLElement {
  const row = screen.getByText(name).closest('tr')
  if (!row) {
    throw new Error(`expected "${name}" to render inside a table row`)
  }
  return row
}

function rowSignature(row: HTMLElement): string {
  const dataAttrs = Array.from(row.attributes)
    .filter((attr) => attr.name.startsWith('data-'))
    .map((attr) => `${attr.name}=${attr.value}`)
    .sort()
    .join(' ')
  return `${row.className} | ${dataAttrs}`
}

function findAction(name: RegExp) {
  return screen.queryByRole('menuitem', { name }) ?? screen.getByRole('button', { name })
}

async function addGuestThroughThePanel(user: ReturnType<typeof userEvent.setup>, name: string) {
  await user.click(screen.getByRole('button', { name: 'Add guest' }))
  await user.type(screen.getByRole('textbox', { name: /name/i }), name)
  await user.selectOptions(screen.getByRole('combobox', { name: /side/i }), 'bride')
  await user.click(screen.getByRole('button', { name: 'Save guest' }))
}

beforeEach(() => {
  useTopTableStore.getState().reset()
  localStorage.clear()
})

afterEach(() => {
  vi.useRealTimers()
})

describe('a valid save closes the panel and briefly highlights the row (C12)', () => {
  it('closes the panel and shows the new row', async () => {
    const user = userEvent.setup()
    renderGuestsScreen()

    await addGuestThroughThePanel(user, 'New Guest')

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(screen.getByText('New Guest')).toBeInTheDocument()
  })

  it('marks the saved row, and the mark is gone after the interval elapses — with a control row proving the change is not just incidental drift', async () => {
    useTopTableStore.getState().setGuests([makeGuest('control', { name: 'Ana Ferreira' })])
    const user = userEvent.setup()
    renderGuestsScreen()

    // Filled under real timers (see the header comment on fake timers vs user-event); only the
    // save itself needs fake time in effect.
    await user.click(screen.getByRole('button', { name: 'Add guest' }))
    await user.type(screen.getByRole('textbox', { name: /name/i }), 'New Guest')
    await user.selectOptions(screen.getByRole('combobox', { name: /side/i }), 'bride')

    vi.useFakeTimers()
    fireEvent.click(screen.getByRole('button', { name: 'Save guest' }))

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()

    const controlBefore = rowSignature(requireRow('Ana Ferreira'))
    const newRowDuring = rowSignature(requireRow('New Guest'))

    act(() => {
      vi.advanceTimersByTime(60_000)
    })

    const controlAfter = rowSignature(requireRow('Ana Ferreira'))
    const newRowAfter = rowSignature(requireRow('New Guest'))

    // The control row's own signature is unmoved by the same time advance...
    expect(controlAfter).toBe(controlBefore)
    // ...while the just-saved row's signature was different immediately after saving...
    expect(newRowDuring).not.toBe(controlBefore)
    // ...and has changed again since, consistent with a mark that was applied and then cleared.
    expect(newRowAfter).not.toBe(newRowDuring)
  })
})

describe('deleting a guest leaves nothing dangling (C13)', () => {
  it('clears the ex-partner\'s partnerOf and drops the id from every conflictsWith, with the remaining rows still rendering cleanly', async () => {
    const partner = makeGuest('partner', { name: 'Ben Ojo', partnerOf: 'leaving' })
    const leaving = makeGuest('leaving', {
      name: 'Ana Ferreira',
      partnerOf: 'partner',
      conflictsWith: ['bystander'],
    })
    const bystander = makeGuest('bystander', { name: 'Cara Lindqvist', conflictsWith: ['leaving'] })
    useTopTableStore.getState().setGuests([partner, leaving, bystander])

    const user = userEvent.setup()
    const { container } = renderGuestsScreen()

    await user.click(screen.getByRole('button', { name: 'Actions for Ana Ferreira' }))
    await user.click(findAction(/^remove$/i))

    expect(screen.queryByText('Ana Ferreira')).not.toBeInTheDocument()
    expect(screen.getByText('Ben Ojo')).toBeInTheDocument()
    expect(screen.getByText('Cara Lindqvist')).toBeInTheDocument()
    // A loose guard against a dangling reference rendering literally, e.g. an unresolved id or
    // a lookup miss printed as text — the five columns have no field where "undefined" or "null"
    // is ever legitimate content.
    expect(container.textContent).not.toMatch(/undefined|null/i)

    const after = useTopTableStore.getState().guests
    expect(after.find((g) => g.id === 'partner')?.partnerOf).toBeNull()
    expect(after.find((g) => g.id === 'bystander')?.conflictsWith).not.toContain('leaving')
  })

  it('removing an id absent from the store leaves the list unchanged, per the domain contract (C13 bug guard, observed through the screen)', () => {
    useTopTableStore.getState().setGuests([makeGuest('g-1', { name: 'Dev Patel' })])
    renderGuestsScreen()

    act(() => {
      useTopTableStore.getState().removeGuest('not-a-real-id')
    })

    expect(screen.getByText('Dev Patel')).toBeInTheDocument()
    expect(useTopTableStore.getState().guests).toHaveLength(1)
  })
})

describe('nothing is seated by either ticket (C33)', () => {
  it('adding, editing and removing a guest through the screen writes no seat, plan or violation key to the store, and leaves pins empty', async () => {
    useTopTableStore.getState().setGuests([makeGuest('existing', { name: 'Dev Patel' })])
    const user = userEvent.setup()
    renderGuestsScreen()

    // TT-12 gave the store a real `pins` key, so this guest-only guard now checks that key's
    // *value* stays empty (none of these guests are ever pinned) rather than its absence.
    function assertNoSeatingState() {
      const state = useTopTableStore.getState() as unknown as Record<string, unknown>
      expect(state.pins).toEqual([])
      expect(state).not.toHaveProperty('plan')
      expect(state).not.toHaveProperty('seats')
      expect(state).not.toHaveProperty('violations')
    }

    assertNoSeatingState()

    await addGuestThroughThePanel(user, 'New Guest')
    assertNoSeatingState()

    await user.click(screen.getByRole('button', { name: 'Actions for Dev Patel' }))
    await user.click(findAction(/^edit$/i))
    await user.click(screen.getByRole('button', { name: 'Save guest' }))
    assertNoSeatingState()

    await user.click(screen.getByRole('button', { name: 'Actions for Dev Patel' }))
    await user.click(findAction(/^remove$/i))
    assertNoSeatingState()
  })
})
