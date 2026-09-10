import { describe, expect, it, vi } from 'vitest'
import { render } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { PlanTable } from './PlanTable'
import type { TableOccupants, TableSlot } from './floorplan'
import type { Guest } from '../../domain/types'

/**
 * TT-11, "Render the floorplan from config", extended by TT-12, "Place a guest by clicking".
 * Written from the acceptance criteria and KB-5, without opening PlanTable.tsx or
 * PlanTable.module.css.
 *
 * Every render wraps `<PlanTable>` in a plain `<ul>`, since a bare `<li>` on its own can fail
 * role queries for reasons that have nothing to do with this ticket — and it's the real context
 * PlanTable renders in. The table root is located via `[data-occupancy]` rather than by role,
 * since a seated table's nested guest names are themselves `<li>` elements.
 *
 * Every Guest fixture sets `age` to an AgeBand, never a number — see floorplan.test.ts's header
 * comment for why KB-3's `number` typing is the stale copy.
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

function roundSlot(overrides: Partial<TableSlot> = {}): TableSlot {
  return { id: 'round-1', kind: 'round', number: 1, label: 'Table 1', capacity: 8, ...overrides }
}

function topSlot(overrides: Partial<TableSlot> = {}): TableSlot {
  return { id: 'top', kind: 'top', number: null, label: 'Top table', capacity: 8, ...overrides }
}

function makeOccupants(overrides: Partial<TableOccupants> = {}): TableOccupants {
  return { guests: [], pinnedCount: 0, inViolation: false, ...overrides }
}

function renderTable(slot: TableSlot, occupants: TableOccupants): HTMLElement {
  const { container } = render(
    <ul>
      <PlanTable slot={slot} occupants={occupants} />
    </ul>,
  )
  const table = container.querySelector('[data-occupancy]')
  if (!table) {
    throw new Error('expected the rendered table to carry a data-occupancy attribute')
  }
  return table as HTMLElement
}

function tabularTexts(table: HTMLElement): string[] {
  return Array.from(table.querySelectorAll('.tt-num')).map((el) => el.textContent?.trim() ?? '')
}

type PlacingProps = {
  placing?: { guestName: string; onPlace: () => void }
  onRelease?: (guestId: string) => void
}

/**
 * Mirrors renderTable above but forwards the two new, optional TT-12 props. A separate helper
 * rather than widening renderTable itself, so the nineteen existing calls above are untouched —
 * their still passing is itself evidence that PlanTable's render change is additive.
 */
function renderTableWithProps(slot: TableSlot, occupants: TableOccupants, extra: PlacingProps = {}): HTMLElement {
  const { container } = render(
    <ul>
      <PlanTable slot={slot} occupants={occupants} {...extra} />
    </ul>,
  )
  const table = container.querySelector('[data-occupancy]')
  if (!table) {
    throw new Error('expected the rendered table to carry a data-occupancy attribute')
  }
  return table as HTMLElement
}

describe('PlanTable — occupancy against capacity (C3, C4)', () => {
  it('no occupants reads empty, and shows "0 of m seats"', () => {
    const table = renderTable(roundSlot({ capacity: 8 }), makeOccupants({ guests: [] }))
    expect(table.getAttribute('data-occupancy')).toBe('empty')
    expect(table.textContent).toContain('0')
    expect(table.textContent).toMatch(/0\s*of\s*8\s*seats/i)
  })

  it('occupants exactly at capacity reads full, and shows "m of m seats"', () => {
    const table = renderTable(roundSlot({ capacity: 8 }), makeOccupants({ guests: makeGuests(8) }))
    expect(table.getAttribute('data-occupancy')).toBe('full')
    expect(table.textContent).toMatch(/8\s*of\s*8\s*seats/i)
  })

  it('occupants above capacity still reads full, and shows the true, over-capacity count', () => {
    const table = renderTable(roundSlot({ capacity: 8 }), makeOccupants({ guests: makeGuests(9) }))
    expect(table.getAttribute('data-occupancy')).toBe('full')
    expect(table.textContent).toMatch(/9\s*of\s*8\s*seats/i)
  })

  it('some but not all seats occupied reads partial', () => {
    const table = renderTable(roundSlot({ capacity: 8 }), makeOccupants({ guests: makeGuests(3) }))
    expect(table.getAttribute('data-occupancy')).toBe('partial')
    expect(table.textContent).toMatch(/3\s*of\s*8\s*seats/i)
  })
})

describe('PlanTable — pinned and violation are independent flags, absent rather than "false" (C4, load-bearing)', () => {
  it('an unpinned table carries no data-pinned attribute at all — not the string "false"', () => {
    const table = renderTable(roundSlot(), makeOccupants({ pinnedCount: 0 }))
    expect(table.hasAttribute('data-pinned')).toBe(false)
    expect(table.getAttribute('data-pinned')).toBe(null)
    expect(table.getAttribute('data-pinned')).not.toBe('false')
  })

  it('a table with at least one pin carries data-pinned="true"', () => {
    const table = renderTable(roundSlot(), makeOccupants({ pinnedCount: 1 }))
    expect(table.getAttribute('data-pinned')).toBe('true')
  })

  it('a clean table carries no data-violation attribute at all — not the string "false"', () => {
    const table = renderTable(roundSlot(), makeOccupants({ inViolation: false }))
    expect(table.hasAttribute('data-violation')).toBe(false)
    expect(table.getAttribute('data-violation')).toBe(null)
    expect(table.getAttribute('data-violation')).not.toBe('false')
  })

  it('a table in violation carries data-violation="true"', () => {
    const table = renderTable(roundSlot(), makeOccupants({ inViolation: true }))
    expect(table.getAttribute('data-violation')).toBe('true')
  })
})

describe('PlanTable — the composition: full, pinned and in violation all at once (C4, A1)', () => {
  it('carries data-occupancy="full", data-pinned="true" and data-violation="true" together', () => {
    const table = renderTable(
      roundSlot({ capacity: 8 }),
      makeOccupants({ guests: makeGuests(8), pinnedCount: 2, inViolation: true }),
    )

    expect(table.getAttribute('data-occupancy')).toBe('full')
    expect(table.getAttribute('data-pinned')).toBe('true')
    expect(table.getAttribute('data-violation')).toBe('true')
  })
})

describe('PlanTable — content (C3)', () => {
  it('the guest names are in the DOM, whether or not the container query would currently reveal them', () => {
    const table = renderTable(
      roundSlot(),
      makeOccupants({ guests: [makeGuest('g-1', { name: 'Danny Whitaker' }), makeGuest('g-2', { name: 'Maureen Shah' })] }),
    )

    expect(table.textContent).toContain('Danny Whitaker')
    expect(table.textContent).toContain('Maureen Shah')
  })

  it('an empty table still renders its (empty) guest list, not nothing', () => {
    // "the names of the guests at it" — an empty table has none, but the number and the
    // occupancy pair must still be there.
    const table = renderTable(roundSlot({ number: 4, label: 'Table 4' }), makeOccupants())
    expect(table.textContent).toContain('4')
    expect(table.textContent).toMatch(/0\s*of\s*8\s*seats/i)
  })
})

describe('PlanTable — both occupancy figures are tabular (C9)', () => {
  it('the occupant count and the capacity both carry the tt-num class', () => {
    const table = renderTable(roundSlot({ capacity: 8 }), makeOccupants({ guests: makeGuests(3) }))
    expect(tabularTexts(table)).toEqual(expect.arrayContaining(['3', '8']))
  })
})

describe('PlanTable — the top table is distinct from a round table (C2)', () => {
  it('a top slot renders its label, not a bare number, and never leaks the literal "null"', () => {
    const table = renderTable(topSlot({ capacity: 8 }), makeOccupants())
    expect(table.textContent).toContain('Top table')
    expect(table.textContent).not.toContain('null')
    // Contrast: a round table with number 1 does show a bare, visible "1" — the top table (whose
    // number is null) must not coincidentally produce the same text.
    expect(table.textContent?.trim()).not.toBe('1')
  })

  it('a round slot shows its bare number, distinguishing it from the top table', () => {
    const table = renderTable(roundSlot({ number: 1, label: 'Table 1', capacity: 8 }), makeOccupants())
    expect(table.textContent).not.toContain('Top table')
  })

  it('the top and round kinds are not styled identically — some class distinguishes the shapes', () => {
    const top = renderTable(topSlot(), makeOccupants())
    const round = renderTable(roundSlot(), makeOccupants())
    expect(top.className).not.toBe('')
    expect(round.className).not.toBe('')
    expect(top.className).not.toBe(round.className)
  })
})

describe('PlanTable — accessible content (A10)', () => {
  it('a pinned table\'s accessible text names the pin', () => {
    const table = renderTable(roundSlot(), makeOccupants({ pinnedCount: 1 }))
    expect(table.textContent).toMatch(/pinned/i)
  })

  it('a violating table\'s accessible text names the violation', () => {
    const table = renderTable(roundSlot(), makeOccupants({ inViolation: true }))
    expect(table.textContent).toMatch(/in violation/i)
  })

  it('a clean, unpinned table\'s accessible text names neither', () => {
    const table = renderTable(roundSlot(), makeOccupants())
    expect(table.textContent).not.toMatch(/pinned/i)
    expect(table.textContent).not.toMatch(/violation/i)
  })

  it('the visible table number remains part of the accessible name — no aria-label displaces it', () => {
    // Guards against an aria-label swallowing the visible text (WCAG 2.5.3) — not a role/name
    // query, which dom-accessibility-api can't compute for a listitem or paragraph role.
    const table = renderTable(roundSlot({ number: 7, label: 'Table 7', capacity: 8 }), makeOccupants())
    expect(table.textContent).toContain('7')
    expect(table.querySelector('[aria-label]')).toBeNull()
    expect(table.querySelector('[aria-labelledby]')).toBeNull()
  })
})

describe('PlanTable — at rest, with no guest selected, the floorplan is inert (TT-12)', () => {
  it('renders no button at all when the placing prop is absent', () => {
    const table = renderTable(roundSlot(), makeOccupants({ guests: makeGuests(2) }))
    expect(table.querySelectorAll('button')).toHaveLength(0)
  })
})

describe('PlanTable — with a guest selected, the face becomes one placing button (TT-12)', () => {
  it('exactly one button exists, and clicking it calls onPlace once', async () => {
    const user = userEvent.setup()
    const onPlace = vi.fn()
    const table = renderTableWithProps(roundSlot({ number: 7, label: 'Table 7', capacity: 8 }), makeOccupants(), {
      placing: { guestName: 'Priya Shah', onPlace },
    })

    const buttons = table.querySelectorAll('button')
    expect(buttons).toHaveLength(1)

    await user.click(buttons[0] as HTMLButtonElement)
    expect(onPlace).toHaveBeenCalledTimes(1)
  })

  it("the button's accessible text names the guest and the table", () => {
    const table = renderTableWithProps(roundSlot({ number: 7, label: 'Table 7', capacity: 8 }), makeOccupants(), {
      placing: { guestName: 'Priya Shah', onPlace: () => {} },
    })

    const placingButton = table.querySelector('button')
    if (!placingButton) {
      throw new Error('expected a placing button')
    }
    expect(placingButton.textContent).toMatch(/Place\s+Priya Shah\s+at\s+Table\s+7/i)
  })

  it('the visible table number and the "n of m seats" pair remain part of the placing button, not left outside it', () => {
    const table = renderTableWithProps(
      roundSlot({ number: 7, label: 'Table 7', capacity: 8 }),
      makeOccupants({ guests: makeGuests(3) }),
      { placing: { guestName: 'Priya Shah', onPlace: () => {} } },
    )

    const placingButton = table.querySelector('button')
    if (!placingButton) {
      throw new Error('expected a placing button')
    }
    expect(placingButton.textContent).toContain('7')
    expect(placingButton.textContent).toMatch(/3\s*of\s*8\s*seats/i)
  })

  it('for a top slot, the placing button names the top table by its label, and never renders the literal "null"', () => {
    const table = renderTableWithProps(topSlot({ capacity: 8 }), makeOccupants(), {
      placing: { guestName: 'Priya Shah', onPlace: () => {} },
    })

    const placingButton = table.querySelector('button')
    if (!placingButton) {
      throw new Error('expected a placing button')
    }
    expect(placingButton.textContent).toMatch(/Place\s+Priya Shah\s+at/i)
    expect(placingButton.textContent).toContain('Top table')
    expect(placingButton.textContent).not.toContain('null')
  })
})

describe('PlanTable — with a pinned guest, their name becomes a release button (TT-12)', () => {
  it('two seated guests each become their own release button, naming the guest and the table; activating one calls onRelease with that guest\'s id', async () => {
    const user = userEvent.setup()
    const onRelease = vi.fn()
    const table = renderTableWithProps(
      roundSlot({ number: 3, label: 'Table 3', capacity: 8 }),
      makeOccupants({
        guests: [
          makeGuest('g-1', { name: 'Danny Whitaker' }),
          makeGuest('g-2', { name: 'Maureen Shah' }),
        ],
        pinnedCount: 2,
      }),
      { onRelease },
    )

    const releaseButtons = Array.from(table.querySelectorAll('button'))
    expect(releaseButtons).toHaveLength(2)

    const dannyButton = releaseButtons.find((button) => /Danny Whitaker/.test(button.textContent ?? ''))
    if (!dannyButton) {
      throw new Error('expected a release button naming Danny Whitaker')
    }
    expect(dannyButton.textContent).toMatch(/Release\s+Danny Whitaker\s+from\s+Table\s+3/i)

    const maureenButton = releaseButtons.find((button) => /Maureen Shah/.test(button.textContent ?? ''))
    if (!maureenButton) {
      throw new Error('expected a release button naming Maureen Shah')
    }
    expect(maureenButton.textContent).toMatch(/Release\s+Maureen Shah\s+from\s+Table\s+3/i)

    await user.click(dannyButton)
    expect(onRelease).toHaveBeenCalledTimes(1)
    expect(onRelease).toHaveBeenCalledWith('g-1')
  })

  it('with onRelease absent, guest names render as plain text and are not buttons', () => {
    const table = renderTable(
      roundSlot(),
      makeOccupants({ guests: [makeGuest('g-1', { name: 'Danny Whitaker' })], pinnedCount: 1 }),
    )

    expect(table.textContent).toContain('Danny Whitaker')
    expect(table.querySelectorAll('button')).toHaveLength(0)
  })
})
