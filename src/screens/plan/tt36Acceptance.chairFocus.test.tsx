import { describe, expect, it } from 'vitest'
import { render, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { PlanTable } from './PlanTable'
import type { SeatedGuest, TableOccupants } from './floorplan'
import type { Guest } from '../../domain/types'
import type { TableSlot } from '../../domain/seating'
import { MIN_TABLE_SIZE } from './floorplanFit'

/**
 * TT-36 — independent second pass on the acceptance criteria, written without opening
 * PlanTable.tsx, TableRing.tsx, TopTableRow.tsx or their stylesheets. This is a separate reading
 * of the same criteria the developer's own `PlanTable.test.tsx` covers, in a new file rather than
 * an addition to theirs, so the two suites stay independent of each other.
 *
 * Weighted toward the criteria most likely to be silently wrong:
 *   - C10/C12: exactly one tab stop per table, at any seat count, and a table remembers the
 *     chair it was left on when re-entered.
 *   - C11: arrow wrapping at both ends, Home/End, and an unhandled key doing nothing.
 *   - C17: the face button's accessible name, asserted as an exact string rather than a loose
 *     regex — the plan's own warning is that an unanchored match would let a chair's label leak
 *     into the button's name and still pass.
 *   - C19: at MIN_TABLE_SIZE with a seat count dense enough to drop chairs, nothing renders and
 *     nothing is focusable in their place.
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

function roundSlot(overrides: Partial<TableSlot> = {}): TableSlot {
  return { id: 'round-1', kind: 'round', number: 1, label: 'Table 1', capacity: 8, ...overrides }
}

function topSlot(overrides: Partial<TableSlot> = {}): TableSlot {
  return { id: 'top', kind: 'top', number: null, label: 'Top table', capacity: 8, ...overrides }
}

function makeOccupants(overrides: Partial<TableOccupants> = {}): TableOccupants {
  return { guests: [], seats: [], pinnedCount: 0, inViolation: false, ...overrides }
}

/** Seats built from an explicit occupied/empty pattern, index-preserving. */
function occupantsFromPattern(pattern: readonly boolean[]): TableOccupants {
  let cursor = 0
  const seats: (SeatedGuest | null)[] = pattern.map((occupied) => {
    if (!occupied) return null
    const guest = makeGuest(`seat-${cursor}`, { name: `Occupant ${cursor}` })
    cursor += 1
    return { guest, pinned: false }
  })
  const guests = seats.filter((seat): seat is SeatedGuest => seat !== null)
  return makeOccupants({ guests, seats })
}

type PlacingProps = {
  placing?: { guestName: string; onPlace: () => void }
  onSelect?: () => void
  selected?: boolean
  tableSize?: number
}

function renderTable(slot: TableSlot, occupants: TableOccupants, extra: PlacingProps = {}): HTMLElement {
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

function chairsByIndex(table: HTMLElement): Map<number, SVGElement> {
  const chairs = Array.from(table.querySelectorAll<SVGElement>('[data-seat-index]'))
  return new Map(chairs.map((chair) => [Number(chair.getAttribute('data-seat-index')), chair]))
}

function tabStopCount(table: HTMLElement): number {
  return Array.from(table.querySelectorAll<SVGElement>('[data-seat-index]')).filter(
    (chair) => chair.tabIndex === 0,
  ).length
}

describe('TT-36 C10 — exactly one tab stop per table, whatever the seat count', () => {
  it('a single-seat table still has exactly one tab stop, not zero and not per-chair', () => {
    const table = renderTable(roundSlot({ capacity: 1 }), occupantsFromPattern([false]))
    expect(tabStopCount(table)).toBe(1)
  })

  it('a five-seat table with a scattered occupancy pattern has exactly one tab stop', () => {
    const table = renderTable(roundSlot({ capacity: 5 }), occupantsFromPattern([true, false, true, false, false]))
    const chairs = Array.from(table.querySelectorAll<SVGElement>('[data-seat-index]'))
    expect(chairs).toHaveLength(5)
    expect(tabStopCount(table)).toBe(1)
    expect(chairs.filter((chair) => chair.tabIndex === -1)).toHaveLength(4)
  })

  it('a top table of six seats (the "Adding up" shape) has exactly one tab stop', () => {
    const table = renderTable(topSlot({ capacity: 6 }), occupantsFromPattern(new Array(6).fill(false)))
    expect(tabStopCount(table)).toBe(1)
  })

  it('two tables rendered side by side each carry their own single tab stop, independently', () => {
    const { container } = render(
      <ul>
        <PlanTable slot={roundSlot({ id: 'round-1', number: 1, label: 'Table 1' })} occupants={occupantsFromPattern([false, false, false])} />
        <PlanTable slot={roundSlot({ id: 'round-2', number: 2, label: 'Table 2' })} occupants={occupantsFromPattern([false, false, false])} />
      </ul>,
    )
    const tables = Array.from(container.querySelectorAll<HTMLElement>('[data-occupancy]'))
    expect(tables).toHaveLength(2)
    const [firstTable, secondTable] = tables
    if (!firstTable || !secondTable) {
      throw new Error('expected two tables to render')
    }
    expect(tabStopCount(firstTable)).toBe(1)
    expect(tabStopCount(secondTable)).toBe(1)
  })
})

describe('TT-36 C11 — arrow keys move the roving stop, wrapping at both ends; Home/End jump; an unhandled key does nothing', () => {
  it('ArrowRight steps forward through a four-seat table and wraps from the last seat to the first', async () => {
    const user = userEvent.setup()
    const table = renderTable(roundSlot({ capacity: 4 }), occupantsFromPattern(new Array(4).fill(false)))
    const chairs = chairsByIndex(table)
    chairs.get(0)?.focus()

    await user.keyboard('{ArrowRight}{ArrowRight}{ArrowRight}')
    expect(document.activeElement).toBe(chairs.get(3))

    await user.keyboard('{ArrowRight}')
    expect(document.activeElement).toBe(chairs.get(0))
  })

  it('ArrowLeft from the first seat wraps to the last, mirroring ArrowRight', async () => {
    const user = userEvent.setup()
    const table = renderTable(roundSlot({ capacity: 4 }), occupantsFromPattern(new Array(4).fill(false)))
    const chairs = chairsByIndex(table)
    chairs.get(0)?.focus()

    await user.keyboard('{ArrowLeft}')
    expect(document.activeElement).toBe(chairs.get(3))
  })

  it('ArrowUp/ArrowDown move exactly like ArrowLeft/ArrowRight', async () => {
    const user = userEvent.setup()
    const table = renderTable(roundSlot({ capacity: 4 }), occupantsFromPattern(new Array(4).fill(false)))
    const chairs = chairsByIndex(table)
    chairs.get(1)?.focus()

    await user.keyboard('{ArrowDown}')
    expect(document.activeElement).toBe(chairs.get(2))

    await user.keyboard('{ArrowUp}{ArrowUp}')
    expect(document.activeElement).toBe(chairs.get(0))
  })

  it('Home moves to the first seat and End to the last, from an arbitrary middle seat', async () => {
    const user = userEvent.setup()
    const table = renderTable(roundSlot({ capacity: 6 }), occupantsFromPattern(new Array(6).fill(false)))
    const chairs = chairsByIndex(table)
    chairs.get(3)?.focus()

    await user.keyboard('{End}')
    expect(document.activeElement).toBe(chairs.get(5))

    await user.keyboard('{Home}')
    expect(document.activeElement).toBe(chairs.get(0))
  })

  it('an unhandled character key leaves focus, and the tab-stop assignment, exactly where it was', async () => {
    const user = userEvent.setup()
    const table = renderTable(roundSlot({ capacity: 4 }), occupantsFromPattern(new Array(4).fill(false)))
    const chairs = chairsByIndex(table)
    chairs.get(2)?.focus()

    await user.keyboard('q')

    expect(document.activeElement).toBe(chairs.get(2))
    expect((chairs.get(2) as SVGElement).tabIndex).toBe(0)
    expect((chairs.get(0) as SVGElement).tabIndex).toBe(-1)
    expect((chairs.get(1) as SVGElement).tabIndex).toBe(-1)
    expect((chairs.get(3) as SVGElement).tabIndex).toBe(-1)
  })

  it('an unhandled non-printable key (PageDown) is equally a no-op', async () => {
    const user = userEvent.setup()
    const table = renderTable(roundSlot({ capacity: 4 }), occupantsFromPattern(new Array(4).fill(false)))
    const chairs = chairsByIndex(table)
    chairs.get(1)?.focus()

    await user.keyboard('{PageDown}')

    expect(document.activeElement).toBe(chairs.get(1))
    expect(tabStopCount(table)).toBe(1)
    expect((chairs.get(1) as SVGElement).tabIndex).toBe(0)
  })
})

describe('TT-36 C12 — a table re-entered returns focus to the chair it was left on, not to seat 1', () => {
  it('after moving to seat 3 and leaving, the tab stop stays on seat 3 rather than resetting to seat 0', async () => {
    const user = userEvent.setup()
    const table = renderTable(roundSlot({ capacity: 5 }), occupantsFromPattern(new Array(5).fill(false)))
    const chairs = chairsByIndex(table)
    chairs.get(0)?.focus()

    await user.keyboard('{ArrowRight}{ArrowRight}{ArrowRight}')
    expect(document.activeElement).toBe(chairs.get(3))

    ;(chairs.get(3) as SVGElement).blur()

    // Re-entering the group by Tab lands wherever tabIndex is 0 — this is that element.
    expect((chairs.get(3) as SVGElement).tabIndex).toBe(0)
    ;(chairs.get(3) as SVGElement).focus()
    expect(document.activeElement).toBe(chairs.get(3))
  })

  it('leaving and re-entering twice, at two different seats, remembers the most recent one each time', async () => {
    const user = userEvent.setup()
    const table = renderTable(roundSlot({ capacity: 5 }), occupantsFromPattern(new Array(5).fill(false)))
    const chairs = chairsByIndex(table)
    chairs.get(0)?.focus()

    await user.keyboard('{ArrowRight}{ArrowRight}')
    ;(chairs.get(2) as SVGElement).blur()
    expect((chairs.get(2) as SVGElement).tabIndex).toBe(0)

    ;(chairs.get(2) as SVGElement).focus()
    await user.keyboard('{ArrowLeft}')
    ;(chairs.get(1) as SVGElement).blur()

    expect((chairs.get(1) as SVGElement).tabIndex).toBe(0)
    expect((chairs.get(2) as SVGElement).tabIndex).toBe(-1)
    expect((chairs.get(0) as SVGElement).tabIndex).toBe(-1)
  })

  it('the top table remembers its own last-focused chair independently of a round table', async () => {
    const user = userEvent.setup()
    const table = renderTable(topSlot({ capacity: 4 }), occupantsFromPattern(new Array(4).fill(false)))
    const chairs = chairsByIndex(table)
    chairs.get(0)?.focus()

    await user.keyboard('{End}')
    ;(chairs.get(3) as SVGElement).blur()

    expect((chairs.get(3) as SVGElement).tabIndex).toBe(0)
    expect((chairs.get(0) as SVGElement).tabIndex).toBe(-1)
  })
})

describe('TT-36 C19 — where chairs are not drawn, the table contributes no chair tab stop at all', () => {
  it('at MIN_TABLE_SIZE with a dense seat count, no chair element renders', () => {
    const table = renderTable(
      roundSlot({ number: 9, label: 'Table 9', capacity: 60 }),
      occupantsFromPattern(new Array(60).fill(false)),
      { tableSize: MIN_TABLE_SIZE },
    )
    expect(table.querySelectorAll('[data-seat-index]')).toHaveLength(0)
  })

  it('at that same size, nothing inside the table — chair or otherwise — carries a tabIndex of 0', () => {
    const table = renderTable(
      roundSlot({ number: 9, label: 'Table 9', capacity: 60 }),
      occupantsFromPattern(new Array(60).fill(false)),
      { tableSize: MIN_TABLE_SIZE },
    )
    const zeroTabIndexElements = Array.from(table.querySelectorAll('*')).filter(
      (el) => (el as HTMLElement | SVGElement).tabIndex === 0,
    )
    // The face button is the one legitimate tabIndex-0 element left; nothing else qualifies.
    expect(zeroTabIndexElements).toHaveLength(1)
    expect(zeroTabIndexElements[0]?.tagName.toLowerCase()).toBe('button')
  })

  it('the same guard holds for a dense top table, not only a round one', () => {
    const table = renderTable(topSlot({ capacity: 60 }), occupantsFromPattern(new Array(60).fill(false)), {
      tableSize: MIN_TABLE_SIZE,
    })
    expect(table.querySelectorAll('[data-seat-index]')).toHaveLength(0)
    const zeroTabIndexElements = Array.from(table.querySelectorAll('*')).filter(
      (el) => (el as HTMLElement | SVGElement).tabIndex === 0,
    )
    expect(zeroTabIndexElements).toHaveLength(1)
  })

  it('a table just large enough to draw chairs still shows them, as a contrast case', () => {
    const table = renderTable(roundSlot({ capacity: 8 }), occupantsFromPattern(new Array(8).fill(false)), {
      tableSize: MIN_TABLE_SIZE,
    })
    expect(table.querySelectorAll('[data-seat-index]').length).toBeGreaterThan(0)
  })
})

describe('TT-36 C17 — the face button\'s accessible name, queried by role and name and asserted exactly', () => {
  it('at rest, with a mix of occupied and empty seats, the name is exactly the visible label and fill count — no chair label folded in', () => {
    const table = renderTable(
      roundSlot({ number: 4, label: 'Table 4', capacity: 5 }),
      occupantsFromPattern([true, true, false, false, false]),
    )
    // Exact-match (the default for a string, not a regex) against the accessible name,
    // normalised for whitespace by testing-library — this is the assertion the plan calls out
    // as the one an unanchored regex would silently let pass even with a chair's label leaking
    // into the button's own name. No space between the visually-hidden "Table" prefix and the
    // bare visible digit — confirmed against the actual computed name, not assumed; the existing
    // suite's own regexes use `\s*` rather than `\s+` in exactly this spot for the same reason.
    const button = within(table).getByRole('button', { name: 'Table4 2 of 5 seats' })
    expect(button.tagName.toLowerCase()).toBe('button')
  })

  it('a differently-named occupant does not appear anywhere in the face button\'s name', () => {
    // A distinctive occupant name, checked to never show up in the button's own accessible name.
    const namedGuest = makeGuest('named', { name: 'Zsazsa Okonkwo' })
    const seats = [{ guest: namedGuest, pinned: false }, null]
    const occupants = makeOccupants({ guests: [{ guest: namedGuest, pinned: false }], seats })
    const table = renderTable(roundSlot({ number: 2, label: 'Table 2', capacity: 2 }), occupants)
    const button = within(table).getByRole('button', { name: 'Table2 1 of 2 seats' })
    expect(button.textContent).not.toContain('Zsazsa Okonkwo')
    expect(button.textContent).not.toMatch(/Seat \d/)
  })

  it('while placing, the name is exactly "Place {guest} at {table}" plus the table\'s own figures', () => {
    const table = renderTable(
      roundSlot({ number: 4, label: 'Table 4', capacity: 5 }),
      occupantsFromPattern([true, true, false, false, false]),
      { placing: { guestName: 'Zsazsa Okonkwo', onPlace: () => {} } },
    )
    const button = within(table).getByRole('button', { name: 'Place Zsazsa Okonkwo at Table 4 2 of 5 seats' })
    expect(button.tagName.toLowerCase()).toBe('button')
  })

  it('while placing, at the top table, the name still reads exactly, with the top table\'s own label', () => {
    const table = renderTable(topSlot({ capacity: 3 }), occupantsFromPattern([true, false, false]), {
      placing: { guestName: 'Zsazsa Okonkwo', onPlace: () => {} },
    })
    const button = within(table).getByRole('button', { name: 'Place Zsazsa Okonkwo at Top table 1 of 3 seats' })
    expect(button.tagName.toLowerCase()).toBe('button')
  })
})

describe('TT-36 C13/C14 — a chair names its own seat and occupant, 1-based, top table left to right', () => {
  it('an occupied chair is reachable by its own "Seat n, name" accessible name, distinct from the face button', () => {
    const table = renderTable(
      roundSlot({ capacity: 3 }),
      occupantsFromPattern([false, true, false]),
    )
    expect(within(table).getByRole('button', { name: 'Seat 2, Occupant 0' })).toBeInTheDocument()
    expect(within(table).getByRole('button', { name: 'Seat 1, empty' })).toBeInTheDocument()
    expect(within(table).getByRole('button', { name: 'Seat 3, empty' })).toBeInTheDocument()
  })

  it('the top table\'s first seat (index 0) sits to the left of its last seat, matching KB-4\'s printed left-to-right order', () => {
    const table = renderTable(topSlot({ capacity: 4 }), occupantsFromPattern(new Array(4).fill(false)))
    const chairs = chairsByIndex(table)
    const first = chairs.get(0)
    const last = chairs.get(3)
    expect(Number(first?.getAttribute('cx'))).toBeLessThan(Number(last?.getAttribute('cx')))
  })
})
