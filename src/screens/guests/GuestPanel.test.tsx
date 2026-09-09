import { describe, expect, it, vi, beforeEach } from 'vitest'
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { GuestPanel } from './GuestPanel'
import { useTopTableStore } from '../../store/store'
import type { Guest } from '../../domain/types'

/**
 * TT-5, "Add and edit guests" — C1 through C4, C6, C8, C10, C11, C14, C15. Written from the
 * acceptance criteria and .claude/plans/TT-5.md sections 3 to 5. Does not open GuestPanel.tsx,
 * ConflictPicker.tsx, guestDraft.ts or PillInput.tsx.
 *
 * `GuestPanelProps` is not published in the plan the way `PillInputProps` and `GuestDraft` are
 * (section 4 gives this component's contents and behaviour, not its prop signature). This file's
 * own inferred contract — `{ open, guest, guests, onClose, onSave }`, `guest: Guest | null` for
 * add-vs-edit, `guests` as the full list for the partner/tag/conflict pickers, `onSave(guest)`
 * called once validation passes — is the most direct reading of "GuestsScreen... holds the
 * panel's open/editing state" plus `SlideOver`'s own `open`/`onClose` names, which this component
 * wraps. If the real props differ, every test below fails to render at all: a gap in the plan's
 * component contract to report, not a behavioural defect.
 *
 * C8 needs to observe a genuinely *reciprocal* write (onto a guest other than the one being
 * saved), which nothing passed into an isolated `onSave` spy can show — reciprocity happens where
 * `onSave` is wired to the store's `addGuest`/`updateGuest`, per `docs/state.md` and
 * .claude/plans/TT-5.md section 1 ("no React file computes a reciprocal write"). That test wires
 * `onSave` to the real store directly, the same store `SetupScreen.test.tsx` uses, rather than to
 * a mock — the only way to see reciprocity from outside `src/domain/guests.ts` itself.
 *
 * `ConflictPicker`'s interaction model is not published anywhere beyond "searchable multi-picker"
 * (TT-5) and "[ Search guests ]" (KB-6, a bracket placeholder, given the same loose-substring
 * treatment as every other field label below). The C8 test's guess — type into a field named
 * "search guests", click a resulting `option` — is one reasonable reading of that phrase and no
 * more; a widget-shape mismatch here is exactly that kind of gap, not a behavioural one.
 *
 * Every field label is queried by loose, case-insensitive substring, following
 * SetupScreen.test.tsx's precedent for KB-6's own bracket-drawn field names.
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

function combobox(name: RegExp) {
  return screen.getByRole('combobox', { name })
}

function getPillInput(name: RegExp) {
  return screen.queryByRole('combobox', { name }) ?? screen.getByRole('textbox', { name })
}

function renderPanel(options: { guest?: Guest | null; guests?: Guest[] } = {}) {
  const onSave = vi.fn()
  const onClose = vi.fn()
  render(
    <GuestPanel
      open
      guest={options.guest ?? null}
      guests={options.guests ?? []}
      onClose={onClose}
      onSave={onSave}
    />,
  )
  return { onSave, onClose }
}

beforeEach(() => {
  useTopTableStore.getState().reset()
  localStorage.clear()
})

describe('the panel (C1)', () => {
  it('renders as a dialog named "Add guest" when adding', () => {
    renderPanel({ guest: null })
    expect(screen.getByRole('dialog', { name: 'Add guest' })).toBeInTheDocument()
  })

  it('renders the same component populated with the values of the guest being edited', () => {
    const existing = makeGuest('g-1', { name: 'Priya Kapoor', side: 'bride', household: 'The Kapoors' })
    renderPanel({ guest: existing, guests: [existing] })

    expect(screen.getByRole('dialog')).toBeInTheDocument()
    expect(screen.getByRole('textbox', { name: /name/i })).toHaveValue('Priya Kapoor')
    expect(combobox(/side/i)).toHaveValue('bride')
    expect(screen.getByRole('textbox', { name: /household/i })).toHaveValue('The Kapoors')
  })
})

describe('structure (C2)', () => {
  it('shows all four of KB-6\'s group headings', () => {
    renderPanel()
    expect(screen.getByText('Who they are')).toBeInTheDocument()
    expect(screen.getByText('Who they are with')).toBeInTheDocument()
    expect(screen.getByText('Keep apart from')).toBeInTheDocument()
    expect(screen.getByText('Needs and seating')).toBeInTheDocument()
  })

  it('gives every editable field an accessible name', () => {
    renderPanel()
    expect(screen.getByRole('textbox', { name: /name/i })).toBeInTheDocument()
    expect(combobox(/side/i)).toBeInTheDocument()
    expect(combobox(/role/i)).toBeInTheDocument()
    expect(combobox(/age/i)).toBeInTheDocument()
    expect(screen.getByRole('textbox', { name: /household/i })).toBeInTheDocument()
    expect(combobox(/partner/i)).toBeInTheDocument()
    expect(getPillInput(/tags/i)).toBeInTheDocument()
    expect(getPillInput(/allerg/i)).toBeInTheDocument()
    expect(getPillInput(/diet/i)).toBeInTheDocument()
    expect(getPillInput(/accessib/i)).toBeInTheDocument()
    expect(combobox(/social/i)).toBeInTheDocument()
  })
})

describe('only name and side are required (C3)', () => {
  it('saves with just a name and a side, leaving every other field at what it opened with', async () => {
    const user = userEvent.setup()
    const { onSave } = renderPanel()

    await user.type(screen.getByRole('textbox', { name: /name/i }), 'Jo March')
    await user.selectOptions(combobox(/side/i), 'bride')
    await user.click(screen.getByRole('button', { name: 'Save guest' }))

    expect(onSave).toHaveBeenCalledTimes(1)
    const saved = onSave.mock.calls[0]?.[0] as Guest
    expect(saved.name).toBe('Jo March')
    expect(saved.side).toBe('bride')
    expect(saved.household).toBeNull()
    expect(saved.partnerOf).toBeNull()
    expect(saved.conflictsWith).toEqual([])
    expect(saved.tags).toEqual([])
    expect(saved.allergies).toEqual([])
    expect(saved.dietaryPreferences).toEqual([])
    expect(saved.accessibility).toEqual([])
  })
})

describe('validation blocks an incomplete save (C4)', () => {
  it('does not save or close, and reports a missing name through the name field\'s accessible description', async () => {
    const user = userEvent.setup()
    const { onSave, onClose } = renderPanel()

    await user.selectOptions(combobox(/side/i), 'bride')
    const nameField = screen.getByRole('textbox', { name: /name/i })
    expect(nameField).not.toHaveAccessibleDescription()

    await user.click(screen.getByRole('button', { name: 'Save guest' }))

    expect(onSave).not.toHaveBeenCalled()
    expect(onClose).not.toHaveBeenCalled()
    expect(screen.getByRole('dialog')).toBeInTheDocument()
    expect(nameField).toHaveAccessibleDescription()
    expect(nameField.getAttribute('aria-describedby')).toBeTruthy()
  })

  it('does not save when side is left on its placeholder, and reports it on the side field', async () => {
    const user = userEvent.setup()
    const { onSave } = renderPanel()

    await user.type(screen.getByRole('textbox', { name: /name/i }), 'Jo March')
    const sideField = combobox(/side/i)
    expect(sideField).not.toHaveAccessibleDescription()

    await user.click(screen.getByRole('button', { name: 'Save guest' }))

    expect(onSave).not.toHaveBeenCalled()
    expect(sideField).toHaveAccessibleDescription()
  })
})

describe('partner picker (C6)', () => {
  it('excludes an already-partnered guest and includes the edited guest\'s own current partner', () => {
    const self = makeGuest('self', { name: 'Nora Byrne', partnerOf: 'partner' })
    const partner = makeGuest('partner', { name: 'Owen Firth', partnerOf: 'self' })
    const available = makeGuest('available', { name: 'Priya Shah' })
    const takenA = makeGuest('takenA', { name: 'Quinn Ashby', partnerOf: 'takenB' })
    const takenB = makeGuest('takenB', { name: 'Rosa Neal', partnerOf: 'takenA' })
    const guests = [self, partner, available, takenA, takenB]

    renderPanel({ guest: self, guests })

    const optionNames = within(combobox(/partner/i))
      .getAllByRole('option')
      .map((o) => o.textContent?.trim())

    expect(optionNames).toEqual(expect.arrayContaining(['Owen Firth', 'Priya Shah']))
    expect(optionNames).not.toEqual(expect.arrayContaining(['Quinn Ashby', 'Rosa Neal', 'Nora Byrne']))
  })
})

describe('conflicts (C8)', () => {
  it('writes a selected conflict reciprocally on both guests once the save reaches the store', async () => {
    const self = makeGuest('self', { name: 'Nora Byrne' })
    const otherOne = makeGuest('otherOne', { name: 'Owen Firth' })
    const otherTwo = makeGuest('otherTwo', { name: 'Priya Shah' })
    const guests = [self, otherOne, otherTwo]
    useTopTableStore.getState().setGuests(guests)

    const user = userEvent.setup()
    render(
      <GuestPanel
        open
        guest={self}
        guests={guests}
        onClose={vi.fn()}
        onSave={(saved) => {
          const exists = useTopTableStore.getState().guests.some((g) => g.id === saved.id)
          if (exists) {
            useTopTableStore.getState().updateGuest(saved)
          } else {
            useTopTableStore.getState().addGuest(saved)
          }
        }}
      />,
    )

    // Scoped to the results listbox: "Owen Firth" is also a legitimate option in the native
    // Partner <select> (he is unpartnered in this fixture too), which shares the "option" role
    // with the conflict picker's own results and would otherwise collide on an unscoped query.
    // The listbox is looked up fresh after each search rather than held from before typing —
    // it is reasonable for a "results" region to exist only once there is a query to show
    // results for.
    const conflictField = getPillInput(/search guests/i)
    await user.type(conflictField, 'Owen')
    const firstResults = await screen.findByRole('listbox', { name: /search guests/i })
    await user.click(await within(firstResults).findByRole('option', { name: /Owen Firth/i }))
    await user.clear(conflictField)
    await user.type(conflictField, 'Priya')
    const secondResults = await screen.findByRole('listbox', { name: /search guests/i })
    await user.click(await within(secondResults).findByRole('option', { name: /Priya Shah/i }))

    await user.click(screen.getByRole('button', { name: 'Save guest' }))

    const after = useTopTableStore.getState().guests
    expect(after.find((g) => g.id === 'self')?.conflictsWith).toEqual(
      expect.arrayContaining(['otherOne', 'otherTwo']),
    )
    expect(after.find((g) => g.id === 'otherOne')?.conflictsWith).toContain('self')
    expect(after.find((g) => g.id === 'otherTwo')?.conflictsWith).toContain('self')
  })
})

describe('tags (C10)', () => {
  it('commits a typed tag as a pill, which can then be removed', async () => {
    const user = userEvent.setup()
    renderPanel()

    const tagsField = getPillInput(/tags/i)
    await user.type(tagsField, 'footie{Enter}')
    expect(screen.getByRole('button', { name: 'Remove footie' })).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Remove footie' }))
    expect(screen.queryByRole('button', { name: 'Remove footie' })).not.toBeInTheDocument()
  })

  it('suggests a tag already used elsewhere on the guest list, and not one used nowhere', async () => {
    const other = makeGuest('other', { name: 'Owen Firth', tags: ['uni'] })
    const user = userEvent.setup()
    renderPanel({ guests: [other] })

    await user.type(getPillInput(/tags/i), 'un')

    expect(await screen.findByRole('option', { name: 'uni' })).toBeInTheDocument()
    expect(screen.queryByRole('option', { name: /not-a-real-tag/i })).not.toBeInTheDocument()
  })
})

describe('allergies and dietary preferences never merge (C11)', () => {
  it('keeps a value typed into one field out of the other', async () => {
    const user = userEvent.setup()
    renderPanel()

    await user.type(getPillInput(/allerg/i), 'shellfish{Enter}')
    await user.type(getPillInput(/diet/i), 'halal{Enter}')

    // Each pill exists exactly once. If the two fields shared one underlying list, both values
    // would render under both labels and this would find two matches, not one.
    expect(screen.getAllByRole('button', { name: 'Remove shellfish' })).toHaveLength(1)
    expect(screen.getAllByRole('button', { name: 'Remove halal' })).toHaveLength(1)
  })

  it('saves a guest whose allergies and dietaryPreferences do not cross-contaminate', async () => {
    const user = userEvent.setup()
    const { onSave } = renderPanel()

    await user.type(screen.getByRole('textbox', { name: /name/i }), 'Jo March')
    await user.selectOptions(combobox(/side/i), 'bride')
    await user.type(getPillInput(/allerg/i), 'shellfish{Enter}')
    await user.type(getPillInput(/diet/i), 'halal{Enter}')
    await user.click(screen.getByRole('button', { name: 'Save guest' }))

    const saved = onSave.mock.calls[0]?.[0] as Guest
    expect(saved.allergies).toEqual(['shellfish'])
    expect(saved.dietaryPreferences).toEqual(['halal'])
  })
})

describe('age band (C14, C15)', () => {
  it('offers exactly the four bands, each labelled with its bound', () => {
    renderPanel()
    const options = within(combobox(/age/i))
      .getAllByRole('option')
      .map((o) => o.textContent?.trim())

    expect(options).toEqual([
      'Baby (under 4)',
      'Child (under 10)',
      'Teen (under 18)',
      'Adult (18 and over)',
    ])
  })

  it('preselects Adult on a fresh add-guest panel', () => {
    renderPanel()
    expect(combobox(/age/i)).toHaveValue('adult')
  })

  it('stores \'adult\' when the age field is left untouched', async () => {
    const user = userEvent.setup()
    const { onSave } = renderPanel()

    await user.type(screen.getByRole('textbox', { name: /name/i }), 'Jo March')
    await user.selectOptions(combobox(/side/i), 'bride')
    await user.click(screen.getByRole('button', { name: 'Save guest' }))

    const saved = onSave.mock.calls[0]?.[0] as Guest
    expect(saved.age).toBe('adult')
  })
})
