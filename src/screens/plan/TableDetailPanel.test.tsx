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

/**
 * Review, TT-15 (C7, KB-2): "never merged" means a reader can tell a safety fact (an allergy)
 * from a catering fact (a dietary preference) without already knowing which term was which —
 * KB-2's own "Allergies are not dietary preferences" is explicit that the two "must not be
 * handled the same way". A single flattened run ("Dairy × 1 · Shellfish × 1 · Halal × 1 ·
 * Vegetarian × 1") fails that: the sort order happens to keep every allergy ahead of every
 * dietary term (allergies are concatenated first), but nothing in the rendered text itself marks
 * where one category ends and the other begins — the previous version of this file asserted
 * exactly that concatenated string and called it "two separate counts, never merged", which
 * pinned the sort order, not the thing C7 actually asks for. Every case below instead asserts
 * the two runs as two separate rows, each carrying its own "Allergies" or "Dietary" label.
 */
describe("the table's needs are two separate, labelled rows — an allergy is never handled the same way as a dietary preference (C7, KB-2)", () => {
  /** Each needs row is its own `<p>`; querying by tag rather than by text avoids the ambiguity
   * `findExact`'s exact-text match would otherwise hit when a row is its container's only child
   * (container and row would then share the same `.textContent`, matching both). */
  function needsRowTexts(container: HTMLElement): string[] {
    return Array.from(container.querySelectorAll('p')).map((row) => textOf(row))
  }

  it('labels the allergy run "Allergies" and the dietary run "Dietary", each its own row', () => {
    const table = roundTable({
      seats: [
        seat(makeGuest({ name: 'A', allergies: ['nuts'] }), false),
        seat(makeGuest({ name: 'B', dietaryPreferences: ['vegan'] }), false),
        seat(makeGuest({ name: 'C', dietaryPreferences: ['vegan'] }), false),
        ...new Array<Seat | null>(5).fill(null),
      ],
    })
    const { container } = render(<TableDetailPanel table={table} onRelease={vi.fn()} onDismiss={vi.fn()} />)

    const rows = needsRowTexts(container)
    expect(rows).toContain('Allergies Nuts × 1')
    expect(rows).toContain('Dietary Vegan × 2')
    // The defect this replaces: one flat run with no word telling the two apart.
    expect(rows).not.toContain('Nuts × 1 · Vegan × 2')
  })

  it('keeps every allergy term ahead of every dietary term within its own row — a merged, alphabetical list would read "Dairy, Halal, Shellfish" (H before S)', () => {
    const table = roundTable({
      seats: [
        seat(makeGuest({ name: 'A', allergies: ['shellfish'] }), false),
        seat(makeGuest({ name: 'B', allergies: ['dairy'] }), false),
        seat(makeGuest({ name: 'C', dietaryPreferences: ['halal'] }), false),
        ...new Array<Seat | null>(5).fill(null),
      ],
    })
    const { container } = render(<TableDetailPanel table={table} onRelease={vi.fn()} onDismiss={vi.fn()} />)

    const rows = needsRowTexts(container)
    expect(rows).toContain('Allergies Dairy × 1 · Shellfish × 1')
    expect(rows).toContain('Dietary Halal × 1')
  })

  it('omits the "Dietary" row entirely for a table with allergies but no dietary needs — a label never sits over an empty list', () => {
    const table = roundTable({
      seats: [seat(makeGuest({ name: 'A', allergies: ['nuts'] }), false), ...new Array<Seat | null>(7).fill(null)],
    })
    render(<TableDetailPanel table={table} onRelease={vi.fn()} onDismiss={vi.fn()} />)

    expect(screen.getByText('Allergies')).toBeInTheDocument()
    expect(screen.queryByText('Dietary')).not.toBeInTheDocument()
  })

  it('omits the "Allergies" row entirely for a table with dietary needs but no allergies', () => {
    const table = roundTable({
      seats: [
        seat(makeGuest({ name: 'A', dietaryPreferences: ['vegan'] }), false),
        ...new Array<Seat | null>(7).fill(null),
      ],
    })
    render(<TableDetailPanel table={table} onRelease={vi.fn()} onDismiss={vi.fn()} />)

    expect(screen.getByText('Dietary')).toBeInTheDocument()
    expect(screen.queryByText('Allergies')).not.toBeInTheDocument()
  })

  it('says so in words when the table has no allergies and no dietary needs — unchanged from before this fix', () => {
    const table = roundTable({
      seats: [seat(makeGuest({ name: 'A' }), false), ...new Array<Seat | null>(7).fill(null)],
    })
    const { container } = render(<TableDetailPanel table={table} onRelease={vi.fn()} onDismiss={vi.fn()} />)

    expect(needsRowTexts(container)).toContain('No allergies or dietary needs')
    expect(screen.queryByText('Allergies')).not.toBeInTheDocument()
    expect(screen.queryByText('Dietary')).not.toBeInTheDocument()
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
    render(<TableDetailPanel table={table} onRelease={vi.fn()} onDismiss={vi.fn()} />)

    // The allergy and dietary counts now render as two separate rows (C7, KB-2) rather than one
    // merged line, so both are gathered here rather than located by their old combined text.
    const allergiesRow = screen.getByText('Allergies').closest('p') as HTMLElement
    const dietaryRow = screen.getByText('Dietary').closest('p') as HTMLElement
    const tabularText = [...allergiesRow.querySelectorAll(`.${tabularClass}`), ...dietaryRow.querySelectorAll(`.${tabularClass}`)]
      .map((el) => el.textContent?.trim())
      .join('|')
    expect(tabularText).toContain('1')
    expect(tabularText).toContain('2')
  })
})

/**
 * TT-44. Each occupied guest row gets a second line under the name: role, tags and social
 * type, joined "Role · tag, tag · socialtype" with role capitalised (KB-6 table detail
 * wireframe, TT-44's own acceptance criteria C11-C14). `findExact` (defined above) locates the
 * element whose own full text is exactly the target string — the same technique this file
 * already uses for the occupancy figure and the needs rows.
 */
describe('the second line under each occupied guest names their role, tags and social type (C11, C12, C13, C14)', () => {
  it('reads "Best man · uni, footie · livewire" — role capitalised, tags and social type as stored', () => {
    const guest = makeGuest({ name: 'Danny Whitaker', role: 'best man', tags: ['uni', 'footie'], socialType: 'livewire' })
    const table = roundTable({ seats: [seat(guest, false), ...new Array<Seat | null>(7).fill(null)] })
    const { container } = render(<TableDetailPanel table={table} onRelease={vi.fn()} onDismiss={vi.fn()} />)

    expect(findExact(container, 'Best man · uni, footie · livewire')).toBeInTheDocument()
  })

  it('a guest with no tags renders no empty segment and no stray separator — "Guest · sociable"', () => {
    const guest = makeGuest({ name: 'Kev Braithwaite', role: 'guest', tags: [], socialType: 'sociable' })
    const table = roundTable({ seats: [seat(guest, false), ...new Array<Seat | null>(7).fill(null)] })
    const { container } = render(<TableDetailPanel table={table} onRelease={vi.fn()} onDismiss={vi.fn()} />)

    expect(findExact(container, 'Guest · sociable')).toBeInTheDocument()
    // Guards the doubled-or-trailing-separator failure mode directly, not only via the exact match above.
    expect(container.textContent).not.toMatch(/·\s*·/)
  })

  it('an empty seat row renders the seat number and "Empty", and no facts line at all', () => {
    const table = roundTable({ seats: [null, ...new Array<Seat | null>(7).fill(null)] })
    render(<TableDetailPanel table={table} onRelease={vi.fn()} onDismiss={vi.fn()} />)

    const rows = within(screen.getByRole('list')).getAllByRole('listitem')
    const rowText = textOf(rows[0])
    expect(seatNumberIsPresent(rowText, 1)).toBe(true)
    expect(rowText).toContain('Empty')
    expect(rowText).not.toMatch(/·/)
  })

  it('an over-capacity overflow row is a guest like any other, and carries a facts line too', () => {
    const overflowGuest = makeGuest({ name: 'Overflow Guest', role: 'usher', tags: ['work'], socialType: 'quiet' })
    const table = roundTable({
      seats: SAMPLE_NAMES.map((name) => seat(makeGuest({ name }), true)),
      overflow: [seat(overflowGuest, true)],
    })
    const { container } = render(<TableDetailPanel table={table} onRelease={vi.fn()} onDismiss={vi.fn()} />)

    expect(findExact(container, 'Usher · work · quiet')).toBeInTheDocument()
  })
})

describe('the facts line never joins the release control\'s accessible name (C17)', () => {
  it('the release control\'s accessible name is still exactly "Release {name} from {label}", found by role and name alone', () => {
    const pinnedGuest = makeGuest({
      name: 'Maureen Shah',
      role: 'mother of the bride',
      tags: ['family'],
      socialType: 'sociable',
    })
    const table = roundTable({ seats: [seat(pinnedGuest, true), ...new Array<Seat | null>(7).fill(null)] })
    render(<TableDetailPanel table={table} onRelease={vi.fn()} onDismiss={vi.fn()} />)

    // If the facts line were nested inside the button rather than beside it, its extra text
    // would change the computed accessible name and this exact-name query would find nothing.
    const releaseButton = screen.getByRole('button', { name: `Release Maureen Shah from ${table.label}` })
    expect(releaseButton).toBeInTheDocument()
    // The facts text is real and present in the row — just not inside this control.
    expect(within(screen.getByRole('list')).getByText(/Mother of the bride/)).toBeInTheDocument()
  })
})

describe('the auto marker on a solver-seated guest is unchanged, and now also carries a facts line (C18, regression: TT-15)', () => {
  it('a solver-seated guest still reads "auto", and its row also carries the role/tags/social-type line', () => {
    const guest = makeGuest({ name: 'Tom Fenwick', role: 'groomsman', tags: ['uni'], socialType: 'quiet' })
    const table = roundTable({ seats: [seat(guest, false), ...new Array<Seat | null>(7).fill(null)] })
    const { container } = render(<TableDetailPanel table={table} onRelease={vi.fn()} onDismiss={vi.fn()} />)

    const rows = within(screen.getByRole('list')).getAllByRole('listitem')
    expect(textOf(rows[0])).toContain('auto')
    expect(findExact(container, 'Groomsman · uni · quiet')).toBeInTheDocument()
  })
})
