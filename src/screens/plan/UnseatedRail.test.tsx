import { describe, expect, it, vi } from 'vitest'
import { createRef, useRef, useState } from 'react'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { UnseatedRail } from './UnseatedRail'
import { NO_FILTERS, filterUnseated } from './unseatedFilter'
import type { UnseatedFilters } from './unseatedFilter'
import type { Guest } from '../../domain/types'

/**
 * TT-12, "Place a guest by clicking". Written from the acceptance criteria and KB-6's rail
 * copy ("Unseated"), without opening UnseatedRail.tsx or UnseatedRail.module.css.
 *
 * Every Guest fixture sets `age` to an AgeBand, matching the pattern already established in
 * PlanTable.test.tsx and PlanScreen.test.tsx.
 *
 * TT-38 adds `totalCount`, `filters` and `onFiltersChange`. `renderRail` below defaults
 * `totalCount` to `guests.length` and `filters` to `NO_FILTERS` so every pre-existing call in
 * this file keeps meaning what it meant before those props existed: a guest list handed in
 * whole, with nothing hiding any of it. Do not open unseatedFilter.ts either — it is imported
 * here only to drive a realistic, already-tested filtering step in the interactive fixtures
 * below, exactly as PlanScreen itself wires the two together.
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

function renderRail(
  overrides: {
    guests?: Guest[]
    totalCount?: number
    filters?: UnseatedFilters
    onFiltersChange?: (filters: UnseatedFilters) => void
    selectedGuestId?: string | null
    onSelect?: (guestId: string) => void
  } = {},
) {
  const guests = overrides.guests ?? []
  const onSelect = overrides.onSelect ?? vi.fn()
  const onFiltersChange = overrides.onFiltersChange ?? vi.fn()
  const headingRef = createRef<HTMLHeadingElement>()
  const utils = render(
    <UnseatedRail
      guests={guests}
      totalCount={overrides.totalCount ?? guests.length}
      filters={overrides.filters ?? NO_FILTERS}
      onFiltersChange={onFiltersChange}
      selectedGuestId={overrides.selectedGuestId ?? null}
      onSelect={onSelect}
      headingRef={headingRef}
    />,
  )
  return { ...utils, onSelect, onFiltersChange, headingRef }
}

/**
 * A controlled fixture for the interactive filter tests: state lives here, exactly as it lives
 * on `PlanScreen` (TT-38 §4), and the visible `guests` are derived with the real, separately
 * tested `filterUnseated` rather than a second, ad hoc narrowing written just for this file.
 */
function ControlledRail(props: {
  allGuests: Guest[]
  selectedGuestId?: string | null
  onSelect?: (guestId: string) => void
}) {
  const [filters, setFilters] = useState<UnseatedFilters>(NO_FILTERS)
  const headingRef = useRef<HTMLHeadingElement>(null)
  return (
    <UnseatedRail
      guests={filterUnseated(props.allGuests, filters)}
      totalCount={props.allGuests.length}
      filters={filters}
      onFiltersChange={setFilters}
      selectedGuestId={props.selectedGuestId ?? null}
      onSelect={props.onSelect ?? vi.fn()}
      headingRef={headingRef}
    />
  )
}

function renderControlledRail(allGuests: Guest[]) {
  return render(<ControlledRail allGuests={allGuests} />)
}

describe('UnseatedRail — every guest it is given is listed, in the order given', () => {
  it('renders one button per guest, named for that guest, in list order', () => {
    const guests = makeGuests(10)
    renderRail({ guests })

    const buttons = screen.getAllByRole('button')
    expect(buttons).toHaveLength(10)
    expect(buttons.map((button) => button.textContent)).toEqual(guests.map((guest) => guest.name))
  })

  it("each guest's own visible name is the button's accessible name — nothing displaces it with an aria-label", () => {
    renderRail({ guests: [makeGuest('g-1', { name: 'Danny Whitaker' })] })

    const button = screen.getByRole('button', { name: 'Danny Whitaker' })
    expect(button.hasAttribute('aria-label')).toBe(false)
    expect(button.hasAttribute('aria-labelledby')).toBe(false)
  })
})

describe('UnseatedRail — an empty rail says so in words, not with an empty list', () => {
  it('renders no list and no guest buttons, with a non-empty line that is not an apology', () => {
    const { container } = renderRail({ guests: [] })

    expect(screen.queryByRole('list')).not.toBeInTheDocument()
    expect(screen.queryAllByRole('button')).toHaveLength(0)
    expect((container.textContent ?? '').trim().length).toBeGreaterThan(0)
    expect(container.textContent ?? '').not.toMatch(/sorry/i)
  })
})

describe('UnseatedRail — the selected guest is marked, and only the selected guest', () => {
  it('carries aria-pressed="true" on the selected guest\'s button and "false" on every other', () => {
    renderRail({ guests: makeGuests(3), selectedGuestId: 'g-1' })

    expect(screen.getByRole('button', { name: 'Guest g-0' })).toHaveAttribute('aria-pressed', 'false')
    expect(screen.getByRole('button', { name: 'Guest g-1' })).toHaveAttribute('aria-pressed', 'true')
    expect(screen.getByRole('button', { name: 'Guest g-2' })).toHaveAttribute('aria-pressed', 'false')
  })

  it('with no guest selected, every button carries aria-pressed="false" — never absent', () => {
    renderRail({ guests: makeGuests(3), selectedGuestId: null })

    const buttons = screen.getAllByRole('button')
    expect(buttons).toHaveLength(3)
    for (const button of buttons) {
      expect(button).toHaveAttribute('aria-pressed', 'false')
    }
  })
})

describe('UnseatedRail — clicking a guest reports the selection', () => {
  it('clicking a guest calls onSelect with their id', async () => {
    const user = userEvent.setup()
    const { onSelect } = renderRail({ guests: makeGuests(2) })

    await user.click(screen.getByRole('button', { name: 'Guest g-1' }))

    expect(onSelect).toHaveBeenCalledTimes(1)
    expect(onSelect).toHaveBeenCalledWith('g-1')
  })

  it('clicking the already-selected guest still calls onSelect with their id — this component reports every click, unconditionally', async () => {
    const user = userEvent.setup()
    const { onSelect } = renderRail({ guests: makeGuests(2), selectedGuestId: 'g-0' })

    await user.click(screen.getByRole('button', { name: 'Guest g-0' }))

    expect(onSelect).toHaveBeenCalledTimes(1)
    expect(onSelect).toHaveBeenCalledWith('g-0')
  })
})

describe('UnseatedRail — the heading ref reaches the real heading, for focus to land on it later', () => {
  it('headingRef.current is the "Unseated" heading element', () => {
    const { headingRef } = renderRail({ guests: [] })

    const heading = screen.getByRole('heading', { name: 'Unseated' })
    expect(headingRef.current).toBe(heading)
  })
})

/*
 * TT-38, "Scroll and filter the unseated list" — C3 through C10. C1, C2 and C12 (the scroll
 * bound, the pinned heading and tabular figures) are covered in railStyles.test.ts, not here.
 */

describe('UnseatedRail — the filter controls appear only once there is something unseated', () => {
  it('renders no search field, no selects and no Clear button when totalCount is zero', () => {
    renderRail({ guests: [], totalCount: 0 })

    expect(screen.queryByRole('textbox')).not.toBeInTheDocument()
    expect(screen.queryAllByRole('combobox')).toHaveLength(0)
    expect(screen.queryByRole('button', { name: 'Clear filters' })).not.toBeInTheDocument()
  })

  it('renders the search field and three selects once totalCount is above zero, even when the filtered guest list is itself empty', () => {
    renderRail({ guests: [], totalCount: 5 })

    expect(screen.getByRole('textbox', { name: /search/i })).toBeInTheDocument()
    expect(screen.getAllByRole('combobox')).toHaveLength(3)
  })
})

describe('UnseatedRail — the search field and the three selects are reachable by accessible name', () => {
  it('exposes a search field and "Filter by side", "Filter by role" and "Filter by need" selects', () => {
    renderRail({ guests: makeGuests(2) })

    expect(screen.getByRole('textbox', { name: /search/i })).toBeInTheDocument()
    expect(screen.getByRole('combobox', { name: 'Filter by side' })).toBeInTheDocument()
    expect(screen.getByRole('combobox', { name: 'Filter by role' })).toBeInTheDocument()
    expect(screen.getByRole('combobox', { name: 'Filter by need' })).toBeInTheDocument()
  })
})

describe('UnseatedRail — typing in the search field narrows the visible rows (C3)', () => {
  it('narrows to the guest matching the query and hides the one that does not', async () => {
    const user = userEvent.setup()
    const allGuests = [makeGuest('g-1', { name: 'Ana Ferreira' }), makeGuest('g-2', { name: 'Ben Ojo' })]
    renderControlledRail(allGuests)

    await user.type(screen.getByRole('textbox', { name: /search/i }), 'Ana')

    expect(screen.getByRole('button', { name: 'Ana Ferreira' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Ben Ojo' })).not.toBeInTheDocument()
  })
})

// A digit that must stand alone: a `\b` boundary doesn't do this on its own, because two DOM
// text nodes rendered back to back flatten with no space between them (a digit is a word
// character, so "5Click" is one unbroken word to `\b` — the same trap a TT-37 regex fell into).
// A lookaround that only excludes an adjacent *digit* is the check that actually isolates the
// figure from a longer number, regardless of what letters happen to sit against it.
function containsStandaloneNumber(text: string, value: number): boolean {
  return new RegExp(`(?<!\\d)${value}(?!\\d)`).test(text)
}

describe('UnseatedRail — the count states shown and hidden only once a filter narrows the list (C9)', () => {
  it('reads the plain total, with no mention of hiding anything, when no filter is active', () => {
    renderRail({ guests: makeGuests(5) })

    expect(containsStandaloneNumber(document.body.textContent ?? '', 5)).toBe(true)
    expect(document.body.textContent).not.toMatch(/hid(e|den|ing)/i)
  })

  it('states both how many are shown and how many are hidden once the search narrows the list', async () => {
    const user = userEvent.setup()
    // "Ann Field", "Anthea Cole" and "Diana Cruz" all contain "an"; "Bee Otter" and "Cy Dune"
    // do not — 3 shown, 2 hidden. Names carry no digits, so the shown/hidden figures below
    // can't be satisfied by a stray guest name instead of the count itself.
    const allGuests = [
      makeGuest('one', { name: 'Ann Field' }),
      makeGuest('two', { name: 'Bee Otter' }),
      makeGuest('three', { name: 'Anthea Cole' }),
      makeGuest('four', { name: 'Cy Dune' }),
      makeGuest('five', { name: 'Diana Cruz' }),
    ]
    renderControlledRail(allGuests)

    await user.type(screen.getByRole('textbox', { name: /search/i }), 'an')

    const text = document.body.textContent ?? ''
    expect(containsStandaloneNumber(text, 3)).toBe(true)
    expect(containsStandaloneNumber(text, 2)).toBe(true)
    expect(text).toMatch(/hid(e|den|ing)/i)
  })
})

describe('UnseatedRail — three distinct body states, not two (C8)', () => {
  it('reads "Everyone has a seat." — the existing empty-rail copy — when there is nothing unseated at all', () => {
    renderRail({ guests: [], totalCount: 0 })

    expect(screen.getByText('Everyone has a seat.')).toBeInTheDocument()
    expect(screen.queryByRole('list')).not.toBeInTheDocument()
  })

  it('reads "No one matches those filters." — a different line, not an apology — when a filter hides everyone but somebody is still unseated', () => {
    renderRail({ guests: [], totalCount: 4, filters: { ...NO_FILTERS, query: 'zzz-nothing-matches' } })

    expect(screen.getByText('No one matches those filters.')).toBeInTheDocument()
    expect(screen.queryByText('Everyone has a seat.')).not.toBeInTheDocument()
    expect(screen.queryByRole('list')).not.toBeInTheDocument()
    expect(document.body.textContent ?? '').not.toMatch(/sorry/i)
  })

  it('renders the list itself, neither empty line, when a filter narrows the rail without emptying it', () => {
    renderRail({ guests: makeGuests(2), totalCount: 5, filters: { ...NO_FILTERS, query: 'guest' } })

    expect(screen.getByRole('list')).toBeInTheDocument()
    expect(screen.queryByText('Everyone has a seat.')).not.toBeInTheDocument()
    expect(screen.queryByText('No one matches those filters.')).not.toBeInTheDocument()
  })
})

describe('UnseatedRail — one action clears every filter (C10)', () => {
  it('the Clear filters button is absent while no filter is active', () => {
    renderRail({ guests: makeGuests(3) })

    expect(screen.queryByRole('button', { name: 'Clear filters' })).not.toBeInTheDocument()
  })

  it('appears once a filter narrows the search, carries no data-guest-id, and restores every row when used', async () => {
    const user = userEvent.setup()
    const allGuests = [makeGuest('g-1', { name: 'Ana Ferreira' }), makeGuest('g-2', { name: 'Ben Ojo' })]
    renderControlledRail(allGuests)

    await user.type(screen.getByRole('textbox', { name: /search/i }), 'Ana')
    expect(screen.queryByRole('button', { name: 'Ben Ojo' })).not.toBeInTheDocument()

    const clearButton = screen.getByRole('button', { name: 'Clear filters' })
    // railButtons() (PlanScreen/UnseatedRail) queries [data-guest-id] to find guest rows —
    // this button must never be mistaken for one.
    expect(clearButton.hasAttribute('data-guest-id')).toBe(false)

    await user.click(clearButton)

    expect(screen.getByRole('button', { name: 'Ana Ferreira' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Ben Ojo' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Clear filters' })).not.toBeInTheDocument()
    expect(screen.getByRole('textbox', { name: /search/i })).toHaveValue('')
  })
})
