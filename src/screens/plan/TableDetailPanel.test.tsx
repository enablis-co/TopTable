import { describe, expect, it, vi } from 'vitest'
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { Guest } from '../../domain/types'
import type { Seat, SeatedTable } from '../../domain/seating'
import { TOP_TABLE_ID, roundTableId } from '../../domain/seating'
import { tabularClass } from '../../ui/tabular'
import { TableDetailPanel } from './TableDetailPanel'

/**
 * TT-15's table detail panel, from the plan's §4.4 props contract:
 * `{ table: SeatedTable; onRelease: (guestId: string) => void; onDismiss: () => void }`.
 * Built against that contract only — this file never imports the component's own
 * implementation details, only its public props.
 *
 * `SeatedTable` fixtures are typed against the real `src/domain/seating.ts` shapes rather
 * than hand-rolled, so a change to that shape breaks this file loudly rather than silently.
 */

let guestCounter = 0

function makeGuest(overrides: Partial<Guest> = {}): Guest {
  guestCounter += 1
  return {
    id: `guest-${guestCounter}`,
    name: `Guest ${guestCounter}`,
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

function seat(guest: Guest, pinned: boolean): Seat {
  return { guest, pinned }
}

function roundTable(overrides: Partial<SeatedTable> = {}): SeatedTable {
  return {
    id: roundTableId(8),
    kind: 'round',
    number: 8,
    label: 'Table 8',
    capacity: 8,
    seats: new Array<Seat | null>(8).fill(null),
    overflow: [],
    ...overrides,
  }
}

function topTable(overrides: Partial<SeatedTable> = {}): SeatedTable {
  return {
    id: TOP_TABLE_ID,
    kind: 'top',
    number: null,
    label: 'Top table',
    capacity: 6,
    seats: new Array<Seat | null>(6).fill(null),
    overflow: [],
    ...overrides,
  }
}

/** Full normalised text of an element, collapsing the whitespace JSX can introduce between
 * sibling text nodes. Used only for plain visible copy — never for an accessible name, which
 * is queried by role and name instead (see the release-control tests below). */
function textOf(element: Element | null | undefined): string {
  return element?.textContent?.replace(/\s+/g, ' ').trim() ?? ''
}

/** The tightest element whose full text is exactly `text`, however many nodes it is split
 * across (a figure and its surrounding words are commonly separate elements). */
function findExact(container: HTMLElement, text: string): HTMLElement {
  return within(container).getByText((_content, element) => textOf(element) === text)
}

function seatNumberIsPresent(rowText: string, seatNumber: number): boolean {
  return new RegExp(`(?:^|\\D)${seatNumber}(?:\\D|$)`).test(rowText)
}

const SAMPLE_NAMES = [
  'Kev Braithwaite',
  'Jodie Ramsden',
  'Owen Firth',
  'Danny Whitaker',
  'Maureen Shah',
  'Priya Malhotra',
  'Tom Fenwick',
  'Sanjay Shah',
]

describe('opening and dismissing the panel (C1, C9)', () => {
  it("shows the given table's own title and its seat list", () => {
    const table = roundTable({
      seats: [seat(makeGuest({ name: 'Kev Braithwaite' }), false), ...new Array<Seat | null>(7).fill(null)],
    })
    render(<TableDetailPanel table={table} onRelease={vi.fn()} onDismiss={vi.fn()} />)

    expect(screen.getByRole('heading', { name: 'Table 8' })).toBeInTheDocument()
    expect(within(screen.getByRole('list')).getAllByRole('listitem')).toHaveLength(8)
  })

  it("shows a different table's own list when the table prop changes", () => {
    const tableA = roundTable({
      id: roundTableId(1),
      number: 1,
      label: 'Table 1',
      seats: [seat(makeGuest({ name: 'Kev Braithwaite' }), false), ...new Array<Seat | null>(7).fill(null)],
    })
    const tableB = roundTable({
      id: roundTableId(2),
      number: 2,
      label: 'Table 2',
      seats: [seat(makeGuest({ name: 'Jodie Ramsden' }), false), ...new Array<Seat | null>(7).fill(null)],
    })
    const { rerender } = render(<TableDetailPanel table={tableA} onRelease={vi.fn()} onDismiss={vi.fn()} />)
    expect(screen.getByRole('heading', { name: 'Table 1' })).toBeInTheDocument()
    expect(screen.getByText('Kev Braithwaite')).toBeInTheDocument()

    rerender(<TableDetailPanel table={tableB} onRelease={vi.fn()} onDismiss={vi.fn()} />)
    expect(screen.getByRole('heading', { name: 'Table 2' })).toBeInTheDocument()
    expect(screen.queryByText('Kev Braithwaite')).not.toBeInTheDocument()
    expect(screen.getByText('Jodie Ramsden')).toBeInTheDocument()
  })

  it('calls onDismiss, and never onRelease, when the panel is dismissed', async () => {
    const user = userEvent.setup()
    const onDismiss = vi.fn()
    const onRelease = vi.fn()
    render(<TableDetailPanel table={roundTable()} onRelease={onRelease} onDismiss={onDismiss} />)

    await user.click(screen.getByRole('button', { name: 'Close table detail' }))

    expect(onDismiss).toHaveBeenCalledTimes(1)
    expect(onRelease).not.toHaveBeenCalled()
  })
})

describe('the panel titles the table by its label (C2)', () => {
  it('titles a round table "Table 8"', () => {
    render(<TableDetailPanel table={roundTable()} onRelease={vi.fn()} onDismiss={vi.fn()} />)
    expect(screen.getByRole('heading', { name: 'Table 8' })).toBeInTheDocument()
  })

  it('titles the top table "Top table"', () => {
    render(<TableDetailPanel table={topTable()} onRelease={vi.fn()} onDismiss={vi.fn()} />)
    expect(screen.getByRole('heading', { name: 'Top table' })).toBeInTheDocument()
  })
})

describe('the occupancy figure (C3)', () => {
  it('reads "8 of 8 seats" for a full table', () => {
    const table = roundTable({ seats: SAMPLE_NAMES.map((name) => seat(makeGuest({ name }), false)) })
    const { container } = render(<TableDetailPanel table={table} onRelease={vi.fn()} onDismiss={vi.fn()} />)
    expect(findExact(container, '8 of 8 seats')).toBeInTheDocument()
  })

  it('reads "3 of 8 seats" for a table with five empty seats', () => {
    const table = roundTable({
      seats: [
        seat(makeGuest({ name: 'Kev Braithwaite' }), false),
        null,
        seat(makeGuest({ name: 'Jodie Ramsden' }), false),
        null,
        null,
        seat(makeGuest({ name: 'Owen Firth' }), false),
        null,
        null,
      ],
    })
    const { container } = render(<TableDetailPanel table={table} onRelease={vi.fn()} onDismiss={vi.fn()} />)
    expect(findExact(container, '3 of 8 seats')).toBeInTheDocument()
  })

  it('reads "9 of 8 seats" when a hand pin has overfilled the table', () => {
    const table = roundTable({
      seats: SAMPLE_NAMES.map((name) => seat(makeGuest({ name }), true)),
      overflow: [seat(makeGuest({ name: 'Overflow Guest' }), true)],
    })
    const { container } = render(<TableDetailPanel table={table} onRelease={vi.fn()} onDismiss={vi.fn()} />)
    expect(findExact(container, '9 of 8 seats')).toBeInTheDocument()
  })
})

describe('every seat position is listed, in order (C4, C5)', () => {
  it('lists eight numbered rows in seat order for a full table', () => {
    const table = roundTable({ seats: SAMPLE_NAMES.map((name) => seat(makeGuest({ name }), false)) })
    render(<TableDetailPanel table={table} onRelease={vi.fn()} onDismiss={vi.fn()} />)

    const rows = within(screen.getByRole('list')).getAllByRole('listitem')
    expect(rows).toHaveLength(8)
    rows.forEach((row, index) => {
      const rowText = textOf(row)
      expect(seatNumberIsPresent(rowText, index + 1)).toBe(true)
      expect(rowText).toContain(SAMPLE_NAMES[index])
    })
  })

  it('still lists all eight seats for a half-filled table, empty ones shown rather than omitted', () => {
    const table = roundTable({
      seats: [
        seat(makeGuest({ name: 'Kev Braithwaite' }), false),
        null,
        seat(makeGuest({ name: 'Jodie Ramsden' }), false),
        null,
        null,
        seat(makeGuest({ name: 'Owen Firth' }), false),
        null,
        null,
      ],
    })
    render(<TableDetailPanel table={table} onRelease={vi.fn()} onDismiss={vi.fn()} />)

    const rows = within(screen.getByRole('list')).getAllByRole('listitem')
    expect(rows).toHaveLength(8)
    const rowTexts = rows.map((row) => textOf(row))
    expect(rowTexts[0]).toContain('Kev Braithwaite')
    expect(rowTexts[1]).toContain('Empty')
    expect(rowTexts[2]).toContain('Jodie Ramsden')
    expect(rowTexts[3]).toContain('Empty')
    expect(rowTexts[4]).toContain('Empty')
    expect(rowTexts[5]).toContain('Owen Firth')
    expect(rowTexts[6]).toContain('Empty')
    expect(rowTexts[7]).toContain('Empty')
  })
})

describe('pinned and unpinned occupants are distinguishable to a screen reader, not by colour alone (C6)', () => {
  it('exposes a pinned occupant as a release control, and an unpinned one as plain "auto" text', () => {
    const table = roundTable({
      seats: [
        seat(makeGuest({ name: 'Maureen Shah' }), true),
        seat(makeGuest({ name: 'Sanjay Shah' }), false),
        ...new Array<Seat | null>(6).fill(null),
      ],
    })
    render(<TableDetailPanel table={table} onRelease={vi.fn()} onDismiss={vi.fn()} />)

    // The distinction has to survive with every colour stripped out (KB-5), so it is asserted
    // through role and accessible name — a control exists for the pinned guest — and through
    // visible text for the unpinned guest, never through a class name or a style.
    expect(screen.getByRole('button', { name: `Release Maureen Shah from ${table.label}` })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /Sanjay Shah/ })).not.toBeInTheDocument()

    const rows = within(screen.getByRole('list')).getAllByRole('listitem')
    expect(textOf(rows[1])).toContain('auto')
  })
})

describe("the table's needs are read as two separate counts, never merged (C7, KB-3)", () => {
  it('reads "Nuts × 1 · Vegan × 2" for one nut allergy and two vegans', () => {
    const table = roundTable({
      seats: [
        seat(makeGuest({ name: 'A', allergies: ['nuts'] }), false),
        seat(makeGuest({ name: 'B', dietaryPreferences: ['vegan'] }), false),
        seat(makeGuest({ name: 'C', dietaryPreferences: ['vegan'] }), false),
        ...new Array<Seat | null>(5).fill(null),
      ],
    })
    const { container } = render(<TableDetailPanel table={table} onRelease={vi.fn()} onDismiss={vi.fn()} />)
    expect(findExact(container, 'Nuts × 1 · Vegan × 2')).toBeInTheDocument()
  })

  it('keeps allergy terms ahead of dietary terms even where merging them would sort otherwise', () => {
    // A merged, alphabetically-sorted list would read "Dairy, Halal, Shellfish" (H before S).
    // Two counts read separately — allergies, then dietary, each internally alphabetical —
    // read "Dairy × 1 · Shellfish × 1 · Halal × 1" instead. This is the case that tells the
    // two readings apart; the nuts/vegan example above cannot, because it only has one term
    // per category.
    const table = roundTable({
      seats: [
        seat(makeGuest({ name: 'A', allergies: ['shellfish'] }), false),
        seat(makeGuest({ name: 'B', allergies: ['dairy'] }), false),
        seat(makeGuest({ name: 'C', dietaryPreferences: ['halal'] }), false),
        ...new Array<Seat | null>(5).fill(null),
      ],
    })
    const { container } = render(<TableDetailPanel table={table} onRelease={vi.fn()} onDismiss={vi.fn()} />)
    expect(findExact(container, 'Dairy × 1 · Shellfish × 1 · Halal × 1')).toBeInTheDocument()
  })

  it('says so in words when the table has no allergies and no dietary needs', () => {
    const table = roundTable({
      seats: [seat(makeGuest({ name: 'A' }), false), ...new Array<Seat | null>(7).fill(null)],
    })
    const { container } = render(<TableDetailPanel table={table} onRelease={vi.fn()} onDismiss={vi.fn()} />)
    expect(findExact(container, 'No allergies or dietary needs')).toBeInTheDocument()
  })
})

describe('releasing a pin from the panel (C8)', () => {
  it("calls onRelease with the released guest's id", async () => {
    const user = userEvent.setup()
    const onRelease = vi.fn()
    const pinnedGuest = makeGuest({ id: 'guest-pinned', name: 'Priya Malhotra' })
    const table = roundTable({ seats: [seat(pinnedGuest, true), ...new Array<Seat | null>(7).fill(null)] })
    render(<TableDetailPanel table={table} onRelease={onRelease} onDismiss={vi.fn()} />)

    await user.click(screen.getByRole('button', { name: `Release Priya Malhotra from ${table.label}` }))

    expect(onRelease).toHaveBeenCalledTimes(1)
    expect(onRelease).toHaveBeenCalledWith('guest-pinned')
  })

  it('offers no release control for a guest the solver seated', () => {
    const table = roundTable({
      seats: [seat(makeGuest({ name: 'Tom Fenwick' }), false), ...new Array<Seat | null>(7).fill(null)],
    })
    render(<TableDetailPanel table={table} onRelease={vi.fn()} onDismiss={vi.fn()} />)

    expect(screen.queryByRole('button', { name: /^Release Tom Fenwick from/ })).not.toBeInTheDocument()
  })
})

describe('every changing figure carries the tabular class (C13)', () => {
  it("wraps each seat's number in the tabular class", () => {
    const table = roundTable({ seats: SAMPLE_NAMES.map((name) => seat(makeGuest({ name }), false)) })
    render(<TableDetailPanel table={table} onRelease={vi.fn()} onDismiss={vi.fn()} />)

    const rows = within(screen.getByRole('list')).getAllByRole('listitem')
    rows.forEach((row, index) => {
      const numbersInRow = Array.from(row.querySelectorAll(`.${tabularClass}`)).map((el) => el.textContent?.trim())
      expect(numbersInRow).toContain(String(index + 1))
    })
  })

  it('wraps both occupancy figures in the tabular class', () => {
    const table = roundTable({
      seats: SAMPLE_NAMES.map((name) => seat(makeGuest({ name }), true)),
      overflow: [seat(makeGuest({ name: 'Overflow Guest' }), true)],
    })
    const { container } = render(<TableDetailPanel table={table} onRelease={vi.fn()} onDismiss={vi.fn()} />)

    const occupancyLine = findExact(container, '9 of 8 seats')
    const tabularText = Array.from(occupancyLine.querySelectorAll(`.${tabularClass}`))
      .map((el) => el.textContent?.trim())
      .join('|')
    expect(tabularText).toContain('9')
    expect(tabularText).toContain('8')
  })

  it('wraps the needs counts in the tabular class', () => {
    const table = roundTable({
      seats: [
        seat(makeGuest({ name: 'A', allergies: ['nuts'] }), false),
        seat(makeGuest({ name: 'B', dietaryPreferences: ['vegan'] }), false),
        seat(makeGuest({ name: 'C', dietaryPreferences: ['vegan'] }), false),
        ...new Array<Seat | null>(5).fill(null),
      ],
    })
    const { container } = render(<TableDetailPanel table={table} onRelease={vi.fn()} onDismiss={vi.fn()} />)

    const needsLine = findExact(container, 'Nuts × 1 · Vegan × 2')
    const tabularText = Array.from(needsLine.querySelectorAll(`.${tabularClass}`))
      .map((el) => el.textContent?.trim())
      .join('|')
    expect(tabularText).toContain('1')
    expect(tabularText).toContain('2')
  })
})
