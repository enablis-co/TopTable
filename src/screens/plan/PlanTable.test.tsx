import { describe, expect, it, vi } from 'vitest'
import { render, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { PlanTable } from './PlanTable'
import type { SeatedGuest, TableOccupants } from './floorplan'
import type { Guest } from '../../domain/types'
import type { TableSlot } from '../../domain/seating'
import { MIN_TABLE_SIZE } from './floorplanFit'

/**
 * TT-11, "Render the floorplan from config", extended by TT-12, "Place a guest by clicking",
 * and TT-15, "Table detail panel". Written from the acceptance criteria and KB-5, without
 * opening PlanTable.tsx or PlanTable.module.css.
 *
 * Every render wraps `<PlanTable>` in a plain `<ul>`, since a bare `<li>` on its own can fail
 * role queries for reasons that have nothing to do with this ticket — and it's the real context
 * PlanTable renders in. The table root is located via `[data-occupancy]` rather than by role,
 * since the table's own face is a button, and a `getByRole('listitem')` on a table would collide
 * with the button contained inside it.
 *
 * Every Guest fixture sets `age` to an AgeBand, never a number.
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

function seatedGuests(guests: Guest[], pinned = false): SeatedGuest[] {
  return guests.map((guest) => ({ guest, pinned }))
}

function roundSlot(overrides: Partial<TableSlot> = {}): TableSlot {
  return { id: 'round-1', kind: 'round', number: 1, label: 'Table 1', capacity: 8, ...overrides }
}

function topSlot(overrides: Partial<TableSlot> = {}): TableSlot {
  return { id: 'top', kind: 'top', number: null, label: 'Top table', capacity: 8, ...overrides }
}

// `seats` defaults to `[]`, not to `guests` — a per-seat array built from `guests` directly
// would encode "the first n seats are occupied", which is exactly the compacted model C5 exists
// to forbid (review, TT-44). Every test below that cares about chair occupancy overrides
// `seats` explicitly, via `occupantsFromPattern` (below) or directly.
function makeOccupants(overrides: Partial<TableOccupants> = {}): TableOccupants {
  return { guests: [], seats: [], pinnedCount: 0, inViolation: false, ...overrides }
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
  onSelect?: () => void
  selected?: boolean
}

/**
 * Mirrors renderTable above but forwards the TT-12/TT-15 props. A separate helper rather than
 * widening renderTable itself, so the calls above are untouched — their still passing is itself
 * evidence that PlanTable's render change is additive.
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

/**
 * TT-44. `tableSize` is not one of the TT-12/TT-15 `PlacingProps`, so it gets its own render
 * helper rather than widening `renderTableWithProps` — the same reasoning that helper's own
 * comment gives for not widening `renderTable`.
 */
function renderTableSized(slot: TableSlot, occupants: TableOccupants, tableSize: number): HTMLElement {
  const { container } = render(
    <ul>
      <PlanTable slot={slot} occupants={occupants} tableSize={tableSize} />
    </ul>,
  )
  const table = container.querySelector('[data-occupancy]')
  if (!table) {
    throw new Error('expected the rendered table to carry a data-occupancy attribute')
  }
  return table as HTMLElement
}

/**
 * Builds occupants whose `seats` follow an explicit occupied/empty pattern, index-preserving —
 * the shape a chair reads directly (TT-44, C5/C6/C10). `guests` is derived the same way
 * `seatingViewFrom` builds it: seated occupants in seat order, no nulls.
 */
function occupantsFromPattern(pattern: readonly boolean[]): TableOccupants {
  let cursor = 0
  const seats: (SeatedGuest | null)[] = pattern.map((occupied) => {
    if (!occupied) return null
    const guest = makeGuest(`seat-${cursor}`)
    cursor += 1
    return { guest, pinned: false }
  })
  const guests = seats.filter((seat): seat is SeatedGuest => seat !== null)
  return makeOccupants({ guests, seats })
}

/** Every rendered chair, keyed by its own 0-based `data-seat-index`. */
function chairsByIndex(table: HTMLElement): Map<number, Element> {
  const chairs = Array.from(table.querySelectorAll('[data-seat-index]'))
  return new Map(chairs.map((chair) => [Number(chair.getAttribute('data-seat-index')), chair]))
}

/**
 * TT-36. The table's face `<button>`, located explicitly rather than inline at each call site —
 * every assertion that must hold of *the button itself* (never of a chair, which is an
 * ARIA-button `<circle>`, not a `<button>` element `querySelectorAll('button')` would ever match)
 * reads through this.
 */
function faceButtonOf(table: HTMLElement): HTMLButtonElement {
  const button = table.querySelector('button')
  if (!button) {
    throw new Error('expected the table to render a face button')
  }
  return button
}

describe('PlanTable — occupancy against capacity', () => {
  it('no occupants reads empty, and shows "0 of m seats"', () => {
    const table = renderTable(roundSlot({ capacity: 8 }), makeOccupants({ guests: [] }))
    expect(table.getAttribute('data-occupancy')).toBe('empty')
    expect(table.textContent).toContain('0')
    expect(table.textContent).toMatch(/0\s*of\s*8\s*seats/i)
  })

  it('occupants exactly at capacity reads full, and shows "m of m seats"', () => {
    const table = renderTable(roundSlot({ capacity: 8 }), makeOccupants({ guests: seatedGuests(makeGuests(8)) }))
    expect(table.getAttribute('data-occupancy')).toBe('full')
    expect(table.textContent).toMatch(/8\s*of\s*8\s*seats/i)
  })

  it('occupants above capacity still reads full, and shows the true, over-capacity count', () => {
    const table = renderTable(roundSlot({ capacity: 8 }), makeOccupants({ guests: seatedGuests(makeGuests(9)) }))
    expect(table.getAttribute('data-occupancy')).toBe('full')
    expect(table.textContent).toMatch(/9\s*of\s*8\s*seats/i)
  })

  it('some but not all seats occupied reads partial', () => {
    const table = renderTable(roundSlot({ capacity: 8 }), makeOccupants({ guests: seatedGuests(makeGuests(3)) }))
    expect(table.getAttribute('data-occupancy')).toBe('partial')
    expect(table.textContent).toMatch(/3\s*of\s*8\s*seats/i)
  })
})

describe('PlanTable — pinned and violation are independent flags, absent rather than "false" (load-bearing)', () => {
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

describe('PlanTable — the composition: full, pinned and in violation all at once', () => {
  it('carries data-occupancy="full", data-pinned="true" and data-violation="true" together', () => {
    const table = renderTable(
      roundSlot({ capacity: 8 }),
      makeOccupants({ guests: seatedGuests(makeGuests(8)), pinnedCount: 2, inViolation: true }),
    )

    expect(table.getAttribute('data-occupancy')).toBe('full')
    expect(table.getAttribute('data-pinned')).toBe('true')
    expect(table.getAttribute('data-violation')).toBe('true')
  })
})

describe('PlanTable — no guest content renders here any more (TT-15 moves it to the table detail panel)', () => {
  it('a seated table\'s own text never names a guest, whatever their name is', () => {
    const table = renderTable(
      roundSlot(),
      makeOccupants({
        guests: seatedGuests([
          makeGuest('g-1', { name: 'Danny Whitaker' }),
          makeGuest('g-2', { name: 'Maureen Shah' }),
        ]),
      }),
    )

    expect(table.textContent).not.toContain('Danny Whitaker')
    expect(table.textContent).not.toContain('Maureen Shah')
  })

  it('a table with a pinned guest still names neither the guest nor any release control', () => {
    const table = renderTable(
      roundSlot(),
      makeOccupants({ guests: seatedGuests([makeGuest('g-1', { name: 'Danny Whitaker' })], true), pinnedCount: 1 }),
    )

    expect(table.textContent).not.toContain('Danny Whitaker')
    expect(table.querySelectorAll('button')).toHaveLength(1)
    expect(table.querySelector('button')?.textContent).not.toMatch(/release/i)
  })

  it('an empty table still renders the number and the occupancy pair, not nothing', () => {
    const table = renderTable(roundSlot({ number: 4, label: 'Table 4' }), makeOccupants())
    expect(table.textContent).toContain('4')
    expect(table.textContent).toMatch(/0\s*of\s*8\s*seats/i)
  })
})

describe('PlanTable — both occupancy figures are tabular', () => {
  it('the occupant count and the capacity both carry the tt-num class', () => {
    const table = renderTable(roundSlot({ capacity: 8 }), makeOccupants({ guests: seatedGuests(makeGuests(3)) }))
    expect(tabularTexts(table)).toEqual(expect.arrayContaining(['3', '8']))
  })
})

describe('PlanTable — the top table is distinct from a round table', () => {
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

  it('the top table carries a decorative, aria-hidden middot between its label and its occupancy pair — a round table carries none', () => {
    // Review, TT-44 (amendment): found by its text, not by being the first aria-hidden element —
    // the top table's own chair row (TopTableRow) is aria-hidden too, and renders ahead of the
    // face in DOM order.
    const top = renderTable(topSlot(), makeOccupants())
    const topSeparator = Array.from(top.querySelectorAll('[aria-hidden="true"]')).find(
      (el) => el.textContent === '·',
    )
    expect(topSeparator?.textContent).toBe('·')

    const round = renderTable(roundSlot(), makeOccupants())
    const roundSeparators = Array.from(round.querySelectorAll('[aria-hidden="true"]')).filter(
      (el) => el.textContent === '·',
    )
    expect(roundSeparators).toHaveLength(0)
  })
})

describe('PlanTable — accessible content', () => {
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
    // TT-36: rescoped to the face button itself, which is the element whose accessible name this
    // guards — a chair (now a sibling of the button, not a descendant) legitimately carries its
    // own aria-label (C13) and must not fail this assertion.
    const table = renderTable(roundSlot({ number: 7, label: 'Table 7', capacity: 8 }), makeOccupants())
    const face = faceButtonOf(table)
    expect(table.textContent).toContain('7')
    expect(face.hasAttribute('aria-label')).toBe(false)
    expect(face.hasAttribute('aria-labelledby')).toBe(false)
    expect(face.querySelector('[aria-label]')).toBeNull()
    expect(face.querySelector('[aria-labelledby]')).toBeNull()
  })
})

describe('PlanTable — at rest, with no guest selected, the face offers a select control, not a placing one (TT-12; TT-15 supersedes "no button at all")', () => {
  it('renders exactly one button — a select button, not a placing one', () => {
    const table = renderTable(roundSlot(), makeOccupants({ guests: seatedGuests(makeGuests(2)) }))
    const buttons = table.querySelectorAll('button')
    expect(buttons).toHaveLength(1)
    expect(buttons[0]?.textContent).not.toMatch(/^Place /)
  })

  it('renders exactly one button even with no onSelect handler at all — clicking it does nothing, and does not throw', async () => {
    const user = userEvent.setup()
    const table = renderTable(roundSlot(), makeOccupants())
    const buttons = table.querySelectorAll('button')
    expect(buttons).toHaveLength(1)
    await user.click(buttons[0] as HTMLButtonElement)
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
      makeOccupants({ guests: seatedGuests(makeGuests(3)) }),
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

  it('placing takes priority over onSelect for the same click — onSelect is never called', async () => {
    const user = userEvent.setup()
    const onPlace = vi.fn()
    const onSelect = vi.fn()
    const table = renderTableWithProps(roundSlot(), makeOccupants(), {
      placing: { guestName: 'Priya Shah', onPlace },
      onSelect,
    })

    await user.click(table.querySelector('button') as HTMLButtonElement)

    expect(onPlace).toHaveBeenCalledTimes(1)
    expect(onSelect).not.toHaveBeenCalled()
  })

  /**
   * Review, TT-15. Documented deliberately, not left as a surprise: while a guest is selected on
   * the rail, a table carrying a pinned guest is exactly as unreachable via click as an empty
   * one — `placing` wins regardless of the table's own state, so its release control (which now
   * lives only in `TableDetailPanel`, opened by `onSelect`) cannot be reached this way either.
   * Kept rather than reversed: C15 requires placing-by-click to stay unchanged, and reversing the
   * priority would make the same click sometimes place and sometimes select, depending on a
   * table's selectedness. The gap is temporary — `PlanScreen.tsx`'s Escape handler, or clicking
   * the selected guest's own row again, clears the rail selection and hands the click straight
   * back to `onSelect` — see the header comment above for the fuller account.
   */
  it('still takes priority even when the table already carries a pinned guest — its release control (now in the table detail panel) is unreachable via click until the rail selection ends', async () => {
    const user = userEvent.setup()
    const onPlace = vi.fn()
    const onSelect = vi.fn()
    const table = renderTableWithProps(roundSlot(), makeOccupants({ pinnedCount: 1 }), {
      placing: { guestName: 'Priya Shah', onPlace },
      onSelect,
    })

    await user.click(table.querySelector('button') as HTMLButtonElement)

    expect(onPlace).toHaveBeenCalledTimes(1)
    expect(onSelect).not.toHaveBeenCalled()
  })
})

describe('PlanTable — selecting a table for the detail panel (TT-15)', () => {
  it('with no guest selected, clicking the face calls onSelect once', async () => {
    const user = userEvent.setup()
    const onSelect = vi.fn()
    const table = renderTableWithProps(roundSlot(), makeOccupants(), { onSelect })

    await user.click(table.querySelector('button') as HTMLButtonElement)

    expect(onSelect).toHaveBeenCalledTimes(1)
  })

  it('carries no data-selected attribute at all when selected is absent or false — not the string "false"', () => {
    const table = renderTableWithProps(roundSlot(), makeOccupants())
    expect(table.hasAttribute('data-selected')).toBe(false)

    const tableFalse = renderTableWithProps(roundSlot(), makeOccupants(), { selected: false })
    expect(tableFalse.hasAttribute('data-selected')).toBe(false)
    expect(tableFalse.getAttribute('data-selected')).not.toBe('false')
  })

  it('carries data-selected="true" when selected', () => {
    const table = renderTableWithProps(roundSlot(), makeOccupants(), { selected: true })
    expect(table.getAttribute('data-selected')).toBe('true')
  })

  /**
   * Review, TT-15: `data-selected` and a stroke width alone give a screen reader nothing —
   * `UnseatedRail.tsx`'s own row button already sets this repo's precedent for "many items, one
   * selected" (`aria-pressed`), and `PlanScreen.test.tsx` asserts it there. The face button below
   * carries the same fact the same way.
   */
  it('the face button carries aria-pressed="true" when selected', () => {
    const table = renderTableWithProps(roundSlot(), makeOccupants(), { selected: true })
    const button = table.querySelector('button')
    expect(button?.getAttribute('aria-pressed')).toBe('true')
  })

  it('the face button carries aria-pressed="false" when not selected', () => {
    const table = renderTableWithProps(roundSlot(), makeOccupants(), { selected: false })
    const button = table.querySelector('button')
    expect(button?.getAttribute('aria-pressed')).toBe('false')
  })

  it('is queryable as a pressed toggle button by role, not only by attribute', () => {
    const table = renderTableWithProps(roundSlot(), makeOccupants(), { selected: true })
    expect(within(table).getByRole('button', { pressed: true })).toBeInTheDocument()
  })
})

describe('PlanTable — chairs, one per seat, on a round table (C1, TT-44)', () => {
  it('a round table of 8 seats renders 8 chair elements, each its own element', () => {
    const table = renderTable(roundSlot({ capacity: 8 }), occupantsFromPattern(new Array(8).fill(false)))
    expect(table.querySelectorAll('[data-seat-index]')).toHaveLength(8)
  })

  it('a round table of 6 seats renders 6 chair elements', () => {
    const table = renderTable(roundSlot({ capacity: 6 }), occupantsFromPattern(new Array(6).fill(false)))
    expect(table.querySelectorAll('[data-seat-index]')).toHaveLength(6)
  })
})

/**
 * TT-44 (amendment, C3-C3d). The top table draws chairs too, now — a single row along the edge
 * away from the room, in KB-4's fixed left-to-right order, not a round table's clock face.
 */
describe('PlanTable — the top table draws its own chair row (C3, C3c, C3d, TT-44 amendment)', () => {
  it('an eight-seat top table (Celebrity scale, Small and cosy) renders 8 chair elements', () => {
    const table = renderTable(topSlot({ capacity: 8 }), occupantsFromPattern(new Array(8).fill(false)))
    expect(table.querySelectorAll('[data-seat-index]')).toHaveLength(8)
  })

  it('a six-seat top table (Adding up) renders 6 chair elements — the row spaces to the actual seat count', () => {
    const table = renderTable(topSlot({ capacity: 6 }), occupantsFromPattern(new Array(6).fill(false)))
    expect(table.querySelectorAll('[data-seat-index]')).toHaveLength(6)
  })

  it('a gap at seat index 1, with guests at 0 and 2, draws chair 0 and chair 2 occupied and chair 1 empty — same per-index reading as a round table (C3d, C5)', () => {
    const occupants = occupantsFromPattern([true, false, true])
    const table = renderTable(topSlot({ capacity: 3 }), occupants)
    const chairs = chairsByIndex(table)

    expect(chairs.get(0)?.hasAttribute('data-guest-id')).toBe(true)
    expect(chairs.get(1)?.hasAttribute('data-guest-id')).toBe(false)
    expect(chairs.get(2)?.hasAttribute('data-guest-id')).toBe(true)
  })

  it('an occupied chair carries the data-guest-id of the guest actually in that seat; an empty chair carries none (C3d, C6)', () => {
    const occupants = occupantsFromPattern([true, false, true])
    const table = renderTable(topSlot({ capacity: 3 }), occupants)
    const chairs = chairsByIndex(table)
    const seatedIds = occupants.seats.map((seat) => seat?.guest.id ?? null)

    expect(chairs.get(0)?.getAttribute('data-guest-id')).toBe(seatedIds[0])
    expect(chairs.get(1)?.hasAttribute('data-guest-id')).toBe(false)
    expect(chairs.get(2)?.getAttribute('data-guest-id')).toBe(seatedIds[2])
  })

  /**
   * C3b, and the amendment's own open question with the venue: left to right from the room's
   * side is the stated default, and "nothing on screen would show it" if drawn the wrong way
   * round — this is the one assertion that would actually catch a reversed row, rather than
   * only confirming the chairs are evenly spaced.
   */
  it('seat 1 (index 0) renders to the left of the last seat — KB-4\'s printed order, read from the room\'s side', () => {
    const table = renderTable(topSlot({ capacity: 8 }), occupantsFromPattern(new Array(8).fill(false)))
    const chairs = chairsByIndex(table)
    const first = chairs.get(0)
    const last = chairs.get(7)

    expect(first?.getAttribute('cx')).toBeTruthy()
    expect(last?.getAttribute('cx')).toBeTruthy()
    expect(Number(first?.getAttribute('cx'))).toBeLessThan(Number(last?.getAttribute('cx')))
  })

  it('a seat count dense enough drops the row cleanly rather than blurring it — the same guard a round table\'s chairs have (C7)', () => {
    const table = renderTable(topSlot({ capacity: 100 }), occupantsFromPattern(new Array(100).fill(false)))
    expect(table.querySelectorAll('[data-seat-index]')).toHaveLength(0)
  })

  it('the top table\'s face button still carries no aria-label or aria-labelledby of its own, and its visible label is still in its text, whatever the chair pattern', () => {
    // TT-36: rescoped to the face button — the top table's own occupied chairs now legitimately
    // carry aria-label (C13), and they sit outside the button, so this only ever guards the
    // button's own accessible name.
    const table = renderTable(topSlot({ capacity: 8 }), occupantsFromPattern(new Array(8).fill(true)))
    const face = faceButtonOf(table)
    expect(face.hasAttribute('aria-label')).toBe(false)
    expect(face.hasAttribute('aria-labelledby')).toBe(false)
    expect(face.querySelector('[aria-label]')).toBeNull()
    expect(face.querySelector('[aria-labelledby]')).toBeNull()
    expect(table.textContent).toContain('Top table')
  })

  it('a chair contributes no text of its own — a seated top table\'s own text still names no guest', () => {
    const guest = makeGuest('g-named', { name: 'Danny Whitaker' })
    const table = renderTable(
      topSlot({ capacity: 1 }),
      makeOccupants({ guests: seatedGuests([guest]), seats: seatedGuests([guest]) }),
    )
    expect(table.textContent).not.toContain('Danny Whitaker')
  })

  it('still renders exactly one button, whatever the chair occupancy pattern', () => {
    const table = renderTable(topSlot({ capacity: 8 }), occupantsFromPattern(new Array(8).fill(true)))
    expect(table.querySelectorAll('button')).toHaveLength(1)
  })
})

describe('PlanTable — a chair reflects the occupancy of its own seat index, not of the first k seats (C5, TT-44)', () => {
  it('a gap at seat index 1, with guests at 0 and 2, draws chair 0 and chair 2 occupied and chair 1 empty', () => {
    const occupants = occupantsFromPattern([true, false, true])
    const table = renderTable(roundSlot({ capacity: 3 }), occupants)
    const chairs = chairsByIndex(table)

    expect(chairs.get(0)?.hasAttribute('data-guest-id')).toBe(true)
    expect(chairs.get(1)?.hasAttribute('data-guest-id')).toBe(false)
    expect(chairs.get(2)?.hasAttribute('data-guest-id')).toBe(true)
  })
})

describe('PlanTable — each chair carries a stable address: its seat index, and the guest in it when occupied (C6, C10, TT-44)', () => {
  it("an occupied chair carries the data-guest-id of the guest actually in that seat; an empty chair carries none", () => {
    const occupants = occupantsFromPattern([true, false, true])
    const table = renderTable(roundSlot({ capacity: 3 }), occupants)
    const chairs = chairsByIndex(table)
    const seatedIds = occupants.seats.map((seat) => seat?.guest.id ?? null)

    expect(chairs.get(0)?.getAttribute('data-guest-id')).toBe(seatedIds[0])
    expect(chairs.get(1)?.hasAttribute('data-guest-id')).toBe(false)
    expect(chairs.get(2)?.getAttribute('data-guest-id')).toBe(seatedIds[2])
  })

  it("data-seat-index runs 0..capacity-1, each exactly once — the same order the table detail panel's 1-based rows use", () => {
    const table = renderTable(roundSlot({ capacity: 8 }), occupantsFromPattern(new Array(8).fill(false)))
    const indices = Array.from(table.querySelectorAll('[data-seat-index]'))
      .map((el) => Number(el.getAttribute('data-seat-index')))
      .sort((a, b) => a - b)

    expect(indices).toEqual([0, 1, 2, 3, 4, 5, 6, 7])
  })
})

describe('PlanTable — the chairs change nothing about the table\'s accessible name or its button (C8, C9, TT-44)', () => {
  it('a seated round table\'s face button still carries no aria-label or aria-labelledby of its own, and its visible number is still in its text', () => {
    // TT-36: rescoped to the face button — occupied chairs now legitimately carry aria-label
    // (C13), and they sit outside the button as a sibling, so this only ever guards the button.
    const table = renderTable(roundSlot({ number: 3, label: 'Table 3', capacity: 3 }), occupantsFromPattern([true, false, true]))
    const face = faceButtonOf(table)
    expect(face.hasAttribute('aria-label')).toBe(false)
    expect(face.hasAttribute('aria-labelledby')).toBe(false)
    expect(face.querySelector('[aria-label]')).toBeNull()
    expect(face.querySelector('[aria-labelledby]')).toBeNull()
    expect(table.textContent).toContain('3')
  })

  it('a chair contributes no text of its own — a seated table\'s own text still names no guest', () => {
    const guest = makeGuest('g-named', { name: 'Danny Whitaker' })
    const table = renderTable(
      roundSlot({ capacity: 1 }),
      makeOccupants({ guests: seatedGuests([guest]), seats: seatedGuests([guest]) }),
    )
    expect(table.textContent).not.toContain('Danny Whitaker')
  })

  it('still renders exactly one button, whatever the chair occupancy pattern', () => {
    const table = renderTable(roundSlot({ capacity: 4 }), occupantsFromPattern([true, false, true, false]))
    expect(table.querySelectorAll('button')).toHaveLength(1)
  })
})

describe('PlanTable — chairs survive the scale floor, or drop cleanly rather than blur into a ring (C7, TT-44)', () => {
  it('at MIN_TABLE_SIZE with 8 seats, chairs still render as countable marks', () => {
    const table = renderTableSized(roundSlot({ capacity: 8 }), occupantsFromPattern(new Array(8).fill(false)), MIN_TABLE_SIZE)
    expect(table.querySelectorAll('[data-seat-index]').length).toBeGreaterThan(0)
  })

  it('at MIN_TABLE_SIZE with 80 seats, no chair elements render, and the table still shows its number and its fill count', () => {
    const table = renderTableSized(
      roundSlot({ number: 5, label: 'Table 5', capacity: 80 }),
      occupantsFromPattern(new Array(80).fill(false)),
      MIN_TABLE_SIZE,
    )
    expect(table.querySelectorAll('[data-seat-index]')).toHaveLength(0)
    expect(table.textContent).toContain('5')
    expect(table.textContent).toMatch(/0\s*of\s*80\s*seats/i)
  })
})

/**
 * Regression, review (TT-44, second pass). The first fix for "selecting a table does nothing
 * once chairs replace the dashed ring" kept a plain ring circle drawn unconditionally, at the
 * same radius the chairs' own centres sit on. That collided with C4: the ring's stroke is a
 * constant CSS width regardless of table size, while a chair shrinks with it, so at the scale
 * floor the band was wider than a whole chair and painted straight through an empty chair's
 * hollow, making it read as filled. The ring is back to `!showChairs`-only; selection now widens
 * the chairs' own stroke instead (`--ring-chair-stroke-width`). jsdom applies no CSS, so this
 * cannot assert the widened stroke leaves a hole on screen (`ringGeometry.test.ts`'s
 * `chairDiameterPx` tests are the arithmetic proof of that) — but it can assert the ring
 * circle's DOM presence tracks `showChairs` exactly, which is the structural guarantee the fix
 * actually rests on: no ring is ever drawn at the chairs' own radius while chairs are visible.
 */
describe('PlanTable — the ring circle and the chairs are never both drawn at the chairs\' own radius (regression, TT-44 review)', () => {
  // Review, TT-44 (fourth pass): the inner selection mark is a <path> (an arc), not a <circle>
  // — a plain circle at its radius collides with the pin and the fill-count text — so this
  // counts both element kinds rather than just circles.
  // TT-36: a round table's decorative ring and its chairs now render in two separate <svg>
  // elements (TableRing and TableRingSeats), one on each side of the face button — see
  // PlanTable.tsx's own comment for why — so this counts marks across every svg the table
  // renders, not just the first.
  function svgMarks(table: HTMLElement): Element[] {
    const svgs = table.querySelectorAll('svg')
    if (svgs.length === 0) {
      throw new Error('expected a round table to render at least one <svg>')
    }
    return Array.from(svgs).flatMap((svg) => Array.from(svg.querySelectorAll('circle, path')))
  }

  it('at a size where chairs render, the svg carries the body, the inner selection arc and one circle per chair — no separate ring at the chairs\' own radius', () => {
    const table = renderTable(roundSlot({ capacity: 8 }), occupantsFromPattern(new Array(8).fill(false)))
    const chairs = table.querySelectorAll('[data-seat-index]')
    expect(chairs.length).toBeGreaterThan(0)

    // body + the always-present inner selection arc (review, TT-44 third/fourth pass) + one
    // circle per chair; this table carries no pin, and no dashed fallback ring.
    expect(svgMarks(table)).toHaveLength(2 + chairs.length)
  })

  it('at the scale floor, where chairs drop, the dashed fallback ring is drawn in their place', () => {
    const table = renderTableSized(
      roundSlot({ number: 5, label: 'Table 5', capacity: 80 }),
      occupantsFromPattern(new Array(80).fill(false)),
      MIN_TABLE_SIZE,
    )
    expect(table.querySelectorAll('[data-seat-index]')).toHaveLength(0)

    // dashed ring + body + the inner selection arc, no chairs, no pin.
    expect(svgMarks(table)).toHaveLength(3)
  })
})

/**
 * Regression, review (TT-44, third pass). Widening the chairs' own stroke (previous fix) does
 * not read at a glance on a *full* table: the stroke is the lowest-contrast one in the system
 * (`--rule-strong` against a `--slate` fill) and it is spread across eight ~6px dots rather than
 * one continuous mark — and 24 of Celebrity scale's 26 tables are full. Selection now also
 * widens a dedicated inner ring, well inside the body (`RING.selectionRadius`,
 * `ringGeometry.ts`), which cannot repeat the chairs'-radius collision fixed in the previous
 * pass. jsdom applies no CSS, so this cannot assert the ring reads clearly on screen
 * (`ringGeometry.test.ts` proves the geometry never reaches the chairs or overflows the body;
 * the browser pass is what confirms legibility) — but it can assert the ring element itself is
 * always present, on every table, selected or not, occupied or not: the one DOM fact the fix
 * actually depends on.
 */
describe('PlanTable — the inner selection arc is always drawn, on every round table (regression, TT-44 review, third pass)', () => {
  // Review, TT-44 (fourth pass): the arc is a <path>, not a <circle> — see the other
  // describe block above for why. TT-36: counts across every svg the table renders — see the
  // other describe block's own comment on the same helper.
  function svgMarks(table: HTMLElement): Element[] {
    const svgs = table.querySelectorAll('svg')
    if (svgs.length === 0) {
      throw new Error('expected a round table to render at least one <svg>')
    }
    return Array.from(svgs).flatMap((svg) => Array.from(svg.querySelectorAll('circle, path')))
  }

  it('an unselected, full table still carries the inner selection arc, alongside its body and its chairs', () => {
    const table = renderTable(roundSlot({ capacity: 8 }), occupantsFromPattern(new Array(8).fill(true)))
    const chairs = table.querySelectorAll('[data-seat-index]')
    expect(chairs.length).toBe(8)
    expect(svgMarks(table)).toHaveLength(2 + chairs.length)
  })

  it('a selected, full table renders the same mark count as an unselected one — width is a CSS fact this suite cannot see, but presence is', () => {
    const table = renderTableWithProps(
      roundSlot({ capacity: 8 }),
      occupantsFromPattern(new Array(8).fill(true)),
      { selected: true },
    )
    const chairs = table.querySelectorAll('[data-seat-index]')
    expect(chairs.length).toBe(8)
    expect(svgMarks(table)).toHaveLength(2 + chairs.length)
  })
})

/*
 * TT-36. Chairs become focusable, named controls, reachable by a single roving tab stop per
 * table. Written from the acceptance criteria (C8, C10-C14, C17, C19), without opening
 * TableRing.tsx, TopTableRow.tsx or PlanTable.tsx.
 */
describe('PlanTable — an occupied chair is focusable and named for its seat and guest; an empty one names its seat as empty (C8, C13)', () => {
  it('an occupied chair is reachable by role and its own "Seat n, name" accessible name', () => {
    const table = renderTable(roundSlot({ capacity: 2 }), occupantsFromPattern([true, false]))
    const chair = within(table).getByRole('img', { name: 'Seat 1, Guest seat-0' })
    expect(chair.tagName.toLowerCase()).toBe('circle')
  })

  it('an empty chair is reachable too, and says so in its own name', () => {
    const table = renderTable(roundSlot({ capacity: 2 }), occupantsFromPattern([true, false]))
    expect(within(table).getByRole('img', { name: 'Seat 2, empty' })).toBeInTheDocument()
  })

  it('the top table\'s own row names its chairs the same way, 1-based (C14)', () => {
    const table = renderTable(topSlot({ capacity: 3 }), occupantsFromPattern([true, false, true]))
    expect(within(table).getByRole('img', { name: 'Seat 1, Guest seat-0' })).toBeInTheDocument()
    expect(within(table).getByRole('img', { name: 'Seat 2, empty' })).toBeInTheDocument()
    expect(within(table).getByRole('img', { name: 'Seat 3, Guest seat-1' })).toBeInTheDocument()
  })
})

/*
 * Reviewer, TT-36. A chair carries no activation of its own — it is a fact to read, not a
 * control to press — so it must never claim `role="button"` (a screen reader user hearing
 * "button" and pressing Enter or Space would get nothing, and an unhandled Space falls through
 * to the browser's own page-scroll default). Written from the reviewer's findings, without
 * opening TableRing.tsx or TopTableRow.tsx.
 */
describe('PlanTable — a chair reads as a fact, not a control (reviewer, TT-36)', () => {
  it('an occupied chair is role="img", never role="button"', () => {
    const table = renderTable(roundSlot({ capacity: 2 }), occupantsFromPattern([true, false]))
    expect(within(table).queryByRole('button', { name: /^Seat/ })).not.toBeInTheDocument()
    expect(within(table).getByRole('img', { name: 'Seat 1, Guest seat-0' })).toBeInTheDocument()
  })

  it('the top table\'s own chairs are role="img" too', () => {
    const table = renderTable(topSlot({ capacity: 2 }), occupantsFromPattern([true, false]))
    expect(within(table).queryByRole('button', { name: /^Seat/ })).not.toBeInTheDocument()
    expect(within(table).getByRole('img', { name: 'Seat 1, Guest seat-0' })).toBeInTheDocument()
  })

  it('Space on a focused chair is prevented, so it cannot fall through to the browser\'s page-scroll default', () => {
    const table = renderTable(roundSlot({ capacity: 3 }), occupantsFromPattern([false, false, false]))
    const chair = within(table).getByRole('img', { name: 'Seat 1, empty' })
    const event = new KeyboardEvent('keydown', { key: ' ', bubbles: true, cancelable: true })
    chair.dispatchEvent(event)
    expect(event.defaultPrevented).toBe(true)
  })

  it('Enter on a focused chair does nothing — no click, no navigation — but is not itself an error', () => {
    const table = renderTable(roundSlot({ capacity: 3 }), occupantsFromPattern([false, false, false]))
    const chair = within(table).getByRole('img', { name: 'Seat 1, empty' })
    expect(() => {
      chair.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true }))
    }).not.toThrow()
  })
})

/*
 * Reviewer, TT-36. Every table's own chair group used to be named the identical "Seats", so a
 * screen reader user navigating by group across a floorplan of many tables heard the same name
 * over and over with nothing distinguishing one table's seats from another's.
 */
describe('PlanTable — a table\'s own seat group is named for that table, not identically "Seats" everywhere (reviewer, TT-36)', () => {
  it('a round table\'s group is named for its own visible label', () => {
    const table = renderTable(roundSlot({ number: 7, label: 'Table 7', capacity: 2 }), occupantsFromPattern([false, false]))
    expect(within(table).getByRole('group', { name: 'Seats at Table 7' })).toBeInTheDocument()
  })

  it('a different round table\'s group is named differently, from its own label', () => {
    const table = renderTable(roundSlot({ number: 3, label: 'Table 3', capacity: 2 }), occupantsFromPattern([false, false]))
    expect(within(table).getByRole('group', { name: 'Seats at Table 3' })).toBeInTheDocument()
  })

  it('the top table\'s group is named for its own label too', () => {
    const table = renderTable(topSlot({ capacity: 2 }), occupantsFromPattern([false, false]))
    expect(within(table).getByRole('group', { name: 'Seats at Top table' })).toBeInTheDocument()
  })
})

/*
 * Reviewer, TT-36 (the blocker). A round table's chairs now sit above the face button so a real
 * pointer actually reaches one — which means a click that lands on a chair no longer reaches the
 * button underneath it. Clicking a chair has to do what a click on the face itself would have
 * done, or placing/selecting a table becomes impossible through roughly a quarter of its own
 * clickable area (the ring of chairs) on every round table.
 */
describe('PlanTable — clicking a chair forwards to the same action the face button would take (reviewer, TT-36)', () => {
  it('with a guest selected, clicking a chair places them, exactly as clicking the face would', async () => {
    const user = userEvent.setup()
    const onPlace = vi.fn()
    const table = renderTableWithProps(roundSlot({ capacity: 3 }), occupantsFromPattern([false, false, false]), {
      placing: { guestName: 'Priya Shah', onPlace },
    })
    const chair = within(table).getByRole('img', { name: 'Seat 1, empty' })

    await user.click(chair)

    expect(onPlace).toHaveBeenCalledTimes(1)
  })

  it('with no guest selected, clicking a chair selects the table, exactly as clicking the face would', async () => {
    const user = userEvent.setup()
    const onSelect = vi.fn()
    const table = renderTableWithProps(roundSlot({ capacity: 3 }), occupantsFromPattern([false, false, false]), {
      onSelect,
    })
    const chair = within(table).getByRole('img', { name: 'Seat 1, empty' })

    await user.click(chair)

    expect(onSelect).toHaveBeenCalledTimes(1)
  })

  it('a chair click never places and selects both — placing still wins, exactly as it does on the face', async () => {
    const user = userEvent.setup()
    const onPlace = vi.fn()
    const onSelect = vi.fn()
    const table = renderTableWithProps(roundSlot({ capacity: 3 }), occupantsFromPattern([false, false, false]), {
      placing: { guestName: 'Priya Shah', onPlace },
      onSelect,
    })
    const chair = within(table).getByRole('img', { name: 'Seat 1, empty' })

    await user.click(chair)

    expect(onPlace).toHaveBeenCalledTimes(1)
    expect(onSelect).not.toHaveBeenCalled()
  })
})

describe('PlanTable — exactly one tab stop per table for its chairs, whatever the seat count, never one per chair (C10)', () => {
  it('a round table of 8 seats has exactly one chair with tabIndex 0, every other at -1', () => {
    const table = renderTable(roundSlot({ capacity: 8 }), occupantsFromPattern(new Array(8).fill(false)))
    const chairs = Array.from(table.querySelectorAll<SVGElement>('[data-seat-index]'))
    expect(chairs.filter((chair) => chair.tabIndex === 0)).toHaveLength(1)
    expect(chairs.filter((chair) => chair.tabIndex === -1)).toHaveLength(chairs.length - 1)
  })

  it('a round table of 6 seats also has exactly one tab stop', () => {
    const table = renderTable(roundSlot({ capacity: 6 }), occupantsFromPattern(new Array(6).fill(false)))
    const chairs = Array.from(table.querySelectorAll<SVGElement>('[data-seat-index]'))
    expect(chairs.filter((chair) => chair.tabIndex === 0)).toHaveLength(1)
  })

  it('the top table\'s own row has exactly one tab stop too', () => {
    const table = renderTable(topSlot({ capacity: 8 }), occupantsFromPattern(new Array(8).fill(false)))
    const chairs = Array.from(table.querySelectorAll<SVGElement>('[data-seat-index]'))
    expect(chairs.filter((chair) => chair.tabIndex === 0)).toHaveLength(1)
  })

  it('with a table full of occupants, still exactly one tab stop — a name on every chair does not add a stop per chair', () => {
    const table = renderTable(roundSlot({ capacity: 8 }), occupantsFromPattern(new Array(8).fill(true)))
    const chairs = Array.from(table.querySelectorAll<SVGElement>('[data-seat-index]'))
    expect(chairs.filter((chair) => chair.tabIndex === 0)).toHaveLength(1)
  })
})

describe('PlanTable — arrow keys move the roving tab stop between chairs, wrapping at both ends (C11)', () => {
  it('ArrowRight moves to the next chair; ArrowLeft moves back to the one before it', async () => {
    const user = userEvent.setup()
    const table = renderTable(roundSlot({ capacity: 3 }), occupantsFromPattern([false, false, false]))
    const chairs = chairsByIndex(table)
    ;(chairs.get(0) as SVGElement).focus()

    await user.keyboard('{ArrowRight}')
    expect(document.activeElement).toBe(chairs.get(1))

    await user.keyboard('{ArrowLeft}')
    expect(document.activeElement).toBe(chairs.get(0))
  })

  it('ArrowUp and ArrowDown behave exactly like ArrowLeft and ArrowRight', async () => {
    const user = userEvent.setup()
    const table = renderTable(roundSlot({ capacity: 3 }), occupantsFromPattern([false, false, false]))
    const chairs = chairsByIndex(table)
    ;(chairs.get(0) as SVGElement).focus()

    await user.keyboard('{ArrowDown}')
    expect(document.activeElement).toBe(chairs.get(1))

    await user.keyboard('{ArrowUp}')
    expect(document.activeElement).toBe(chairs.get(0))
  })

  it('ArrowLeft from the first chair wraps to the last; ArrowRight from the last wraps to the first', async () => {
    const user = userEvent.setup()
    const table = renderTable(roundSlot({ capacity: 3 }), occupantsFromPattern([false, false, false]))
    const chairs = chairsByIndex(table)
    ;(chairs.get(0) as SVGElement).focus()

    await user.keyboard('{ArrowLeft}')
    expect(document.activeElement).toBe(chairs.get(2))

    await user.keyboard('{ArrowRight}')
    expect(document.activeElement).toBe(chairs.get(0))
  })

  it('Home jumps to the first chair; End jumps to the last', async () => {
    const user = userEvent.setup()
    const table = renderTable(roundSlot({ capacity: 3 }), occupantsFromPattern([false, false, false]))
    const chairs = chairsByIndex(table)
    ;(chairs.get(1) as SVGElement).focus()

    await user.keyboard('{End}')
    expect(document.activeElement).toBe(chairs.get(2))

    await user.keyboard('{Home}')
    expect(document.activeElement).toBe(chairs.get(0))
  })

  it('moving the roving tab stop also moves which chair carries tabIndex 0', async () => {
    const user = userEvent.setup()
    const table = renderTable(roundSlot({ capacity: 3 }), occupantsFromPattern([false, false, false]))
    const chairs = chairsByIndex(table)
    ;(chairs.get(0) as SVGElement).focus()

    await user.keyboard('{ArrowRight}')

    expect((chairs.get(1) as SVGElement).tabIndex).toBe(0)
    expect((chairs.get(0) as SVGElement).tabIndex).toBe(-1)
    expect((chairs.get(2) as SVGElement).tabIndex).toBe(-1)
  })
})

describe('PlanTable — a table remembers the chair it was left on, not seat 1 (C12)', () => {
  it('moving focus to a later chair, then away, leaves that chair holding the table\'s one tab stop', async () => {
    const user = userEvent.setup()
    const table = renderTable(roundSlot({ capacity: 3 }), occupantsFromPattern([false, false, false]))
    const chairs = chairsByIndex(table)
    ;(chairs.get(0) as SVGElement).focus()

    await user.keyboard('{ArrowRight}{ArrowRight}')
    expect(document.activeElement).toBe(chairs.get(2))

    ;(chairs.get(2) as SVGElement).blur()

    expect((chairs.get(2) as SVGElement).tabIndex).toBe(0)
    expect((chairs.get(0) as SVGElement).tabIndex).toBe(-1)
    expect((chairs.get(1) as SVGElement).tabIndex).toBe(-1)
  })
})

describe('PlanTable — where chairs are not drawn, the table contributes no chair tab stop and no focusable chair at all (C19)', () => {
  it('at MIN_TABLE_SIZE with 80 seats, no chair renders, nothing inside the table carries a tabIndex, and no "Seats" group exists', () => {
    const table = renderTableSized(
      roundSlot({ number: 5, label: 'Table 5', capacity: 80 }),
      occupantsFromPattern(new Array(80).fill(false)),
      MIN_TABLE_SIZE,
    )

    expect(table.querySelectorAll('[data-seat-index]')).toHaveLength(0)
    expect(within(table).queryByRole('group', { name: /^Seats at/ })).not.toBeInTheDocument()

    const face = faceButtonOf(table)
    const tabbable = Array.from(table.querySelectorAll('*')).filter(
      (el) => el !== face && (el as SVGElement | HTMLElement).tabIndex === 0,
    )
    expect(tabbable).toHaveLength(0)
  })
})

describe('PlanTable — the face button\'s own accessible name, queried by role and name, never gains a chair\'s label (C17)', () => {
  it('at rest, with every chair occupied, the face button\'s name is exactly its own visible number and fill count', () => {
    const table = renderTable(roundSlot({ number: 7, label: 'Table 7', capacity: 3 }), occupantsFromPattern([true, true, true]))
    const button = within(table).getByRole('button', { name: /^Table\s*7\s+3\s*of\s*3\s*seats$/i })
    expect(button.tagName.toLowerCase()).toBe('button')
  })

  it('while placing, with every chair occupied, the face button\'s name is exactly "Place {guest} at {table}" plus its own figures', () => {
    const table = renderTableWithProps(
      roundSlot({ number: 7, label: 'Table 7', capacity: 3 }),
      occupantsFromPattern([true, true, true]),
      { placing: { guestName: 'Priya Shah', onPlace: () => {} } },
    )
    const button = within(table).getByRole('button', {
      name: /^Place\s+Priya Shah\s+at\s+Table\s+7\s+3\s*of\s*3\s*seats$/i,
    })
    expect(button.tagName.toLowerCase()).toBe('button')
  })
})
