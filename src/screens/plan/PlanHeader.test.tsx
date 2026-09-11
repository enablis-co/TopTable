import { describe, expect, it } from 'vitest'
import { render } from '@testing-library/react'
import { PlanHeader } from './PlanHeader'
import { NOTHING_SEATED } from './floorplan'
import type { SeatedGuest, SeatingView, TableOccupants } from './floorplan'
import type { Guest, RoomConfig } from '../../domain/types'
import type { ScenarioState } from '../../store/store'

/**
 * TT-35, KB-6 "Plan". `PlanHeader` becomes the canvas header — a capacity headline ("78 seats
 * for 70 guests") plus a qualifier line, and a right-hand stat pair (pinned, unseated). Written
 * from the acceptance criteria and the handoff's "Canvas header" section, without opening
 * PlanHeader.tsx or PlanHeader.module.css.
 *
 * `scenarioLabel` is local to PlanHeader and not exported, so it is exercised only through the
 * component's rendered text, never called directly.
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

function occupantsFixture(overrides: Partial<TableOccupants> = {}): TableOccupants {
  return { guests: [], pinnedCount: 0, inViolation: false, ...overrides }
}

function seatedGuests(guests: Guest[], pinned = false): SeatedGuest[] {
  return guests.map((guest) => ({ guest, pinned }))
}

function tabularTexts(container: HTMLElement): string[] {
  return Array.from(container.querySelectorAll('.tt-num')).map((el) => el.textContent?.trim() ?? '')
}

describe('PlanHeader — the capacity headline (handoff "Canvas header": "78 seats for 70 guests")', () => {
  it('reads "78 seats for 70 guests", seats before guests, for a configured room with nothing seated', () => {
    // Adding up's own room: 9 × 8 + 6 = 78 seats.
    const room: RoomConfig = { roundTables: 9, seatsEach: 8, topTableSeats: 6 }
    const guests = makeGuests(70)
    const { container } = render(
      <PlanHeader scenario={null} room={room} guests={guests} seating={NOTHING_SEATED} unseatedCount={70} />,
    )

    const text = container.textContent ?? ''
    expect(text).toContain('78')
    expect(text).toContain('seats for')
    expect(text).toContain('70')
    expect(text).toContain('guests')
    expect(text.indexOf('78')).toBeLessThan(text.indexOf('70'))
  })

  it('an unconfigured, guestless room reads all zeroes, not a blank or a throw', () => {
    const room: RoomConfig = { roundTables: 0, seatsEach: 0, topTableSeats: 0 }
    const { container } = render(
      <PlanHeader scenario={null} room={room} guests={[]} seating={NOTHING_SEATED} unseatedCount={0} />,
    )

    const text = container.textContent ?? ''
    expect(text).toContain('0 seats for 0 guests')
  })
})

describe('PlanHeader — the seat figure is normalised, agreeing with the grid (regression, TT-11 review)', () => {
  it('a room with a negative roundTables reads the normalised seat count, not 0', () => {
    // Raw totalSeats is -1 * 8 + 8 = 0; normalised, roundTables becomes 0 and the room keeps
    // its 8-seat top table — the figure this line must show.
    const room: RoomConfig = { roundTables: -1, seatsEach: 8, topTableSeats: 8 }
    const { container } = render(
      <PlanHeader scenario={null} room={room} guests={[]} seating={NOTHING_SEATED} unseatedCount={0} />,
    )

    expect(container.textContent).toContain('8 seats for 0 guests')
  })
})

describe('PlanHeader — the qualifier line: three calm states, one of them a warning (handoff "Canvas header")', () => {
  it('reads "8 spare" when seats exceed guests', () => {
    const room: RoomConfig = { roundTables: 9, seatsEach: 8, topTableSeats: 6 } // 78 seats
    const { container } = render(
      <PlanHeader scenario={null} room={room} guests={makeGuests(70)} seating={NOTHING_SEATED} unseatedCount={70} />,
    )
    expect(container.textContent).toContain('8 spare')
  })

  it('reads "Exactly enough" when seats equal guests, with no spare/short figure', () => {
    const room: RoomConfig = { roundTables: 9, seatsEach: 8, topTableSeats: 6 } // 78 seats
    const { container } = render(
      <PlanHeader scenario={null} room={room} guests={makeGuests(78)} seating={NOTHING_SEATED} unseatedCount={78} />,
    )
    const text = container.textContent ?? ''
    expect(text).toContain('Exactly enough')
    expect(text).not.toMatch(/\d+\s*spare/)
    expect(text).not.toMatch(/\d+\s*short/)
  })

  it('reads "N short" when guests exceed seats, and the qualifier carries data-state="short"', () => {
    const room: RoomConfig = { roundTables: 9, seatsEach: 8, topTableSeats: 6 } // 78 seats
    const { container } = render(
      <PlanHeader scenario={null} room={room} guests={makeGuests(80)} seating={NOTHING_SEATED} unseatedCount={80} />,
    )

    expect(container.textContent).toMatch(/2\s*short/)
    expect(container.querySelector('[data-state="short"]')).not.toBeNull()
  })

  it('carries data-state="slack" and data-state="exact" for the other two states', () => {
    const room: RoomConfig = { roundTables: 9, seatsEach: 8, topTableSeats: 6 }
    const { rerender, container } = render(
      <PlanHeader scenario={null} room={room} guests={makeGuests(70)} seating={NOTHING_SEATED} unseatedCount={70} />,
    )
    expect(container.querySelector('[data-state="slack"]')).not.toBeNull()

    rerender(<PlanHeader scenario={null} room={room} guests={makeGuests(78)} seating={NOTHING_SEATED} unseatedCount={78} />)
    expect(container.querySelector('[data-state="exact"]')).not.toBeNull()
  })
})

describe('PlanHeader — the composition, after the qualifier, separated by a middot (handoff: "9 × 8, plus a top table of 6")', () => {
  it('reads the round-table breakdown and the top table together', () => {
    const room: RoomConfig = { roundTables: 9, seatsEach: 8, topTableSeats: 6 }
    const { container } = render(
      <PlanHeader scenario={null} room={room} guests={makeGuests(70)} seating={NOTHING_SEATED} unseatedCount={70} />,
    )
    const text = container.textContent ?? ''
    expect(text).toContain('9')
    expect(text).toContain('×')
    expect(text).toContain('8')
    expect(text).toContain('plus a top table of')
    expect(text).toContain('6')
    expect(text).toMatch(/·/)
  })

  it('omits the round-table segment entirely when there are no round tables', () => {
    const room: RoomConfig = { roundTables: 0, seatsEach: 0, topTableSeats: 4 }
    const { container } = render(
      <PlanHeader scenario={null} room={room} guests={makeGuests(4)} seating={NOTHING_SEATED} unseatedCount={4} />,
    )
    expect(container.textContent).not.toContain('×')
  })

  it('omits the top-table segment entirely when there is no top table', () => {
    const room: RoomConfig = { roundTables: 2, seatsEach: 4, topTableSeats: 0 }
    const { container } = render(
      <PlanHeader scenario={null} room={room} guests={makeGuests(8)} seating={NOTHING_SEATED} unseatedCount={8} />,
    )
    expect(container.textContent).not.toContain('top table')
  })

  it('omits the whole qualifier-composition separator and breakdown when the room is entirely unconfigured', () => {
    const room: RoomConfig = { roundTables: 0, seatsEach: 0, topTableSeats: 0 }
    const { container } = render(
      <PlanHeader scenario={null} room={room} guests={[]} seating={NOTHING_SEATED} unseatedCount={0} />,
    )
    expect(container.textContent).not.toMatch(/·/)
  })
})

describe('PlanHeader — the scenario segment', () => {
  const room: RoomConfig = { roundTables: 1, seatsEach: 4, topTableSeats: 4 }
  const guests = makeGuests(2)

  it.each([
    ['small-and-cosy', 'Small and cosy'],
    ['adding-up', 'Adding up'],
    ['celebrity-scale', 'Celebrity scale'],
  ] as const)('scenario %s renders as "%s"', (id, name) => {
    const { container } = render(
      <PlanHeader scenario={id as ScenarioState} room={room} guests={guests} seating={NOTHING_SEATED} unseatedCount={2} />,
    )
    expect(container.textContent).toContain(name)
  })

  it('scenario "custom" renders as "Custom"', () => {
    const { container } = render(
      <PlanHeader scenario="custom" room={room} guests={guests} seating={NOTHING_SEATED} unseatedCount={2} />,
    )
    expect(container.textContent).toContain('Custom')
  })

  it('scenario null omits the segment entirely — no "Custom", no stray separator, no throw, no literal "null"', () => {
    const { container } = render(
      <PlanHeader scenario={null} room={room} guests={guests} seating={NOTHING_SEATED} unseatedCount={2} />,
    )
    const text = container.textContent ?? ''
    expect(text).not.toContain('Custom')
    expect(text).not.toContain('null')
    expect(text).not.toContain('undefined')
  })
})

describe('PlanHeader — the stat pair: pinned, then unseated (handoff "Canvas header")', () => {
  it('shows pinned and unseated counts, pinned first', () => {
    const room: RoomConfig = { roundTables: 9, seatsEach: 8, topTableSeats: 6 }
    const guests = makeGuests(70)
    const seatedPair = [guests[0], guests[1]]
    if (!seatedPair[0] || !seatedPair[1]) {
      throw new Error('expected two seeded guests')
    }
    const seating: SeatingView = {
      byTableId: {
        'round-1': occupantsFixture({ guests: seatedGuests([seatedPair[0], seatedPair[1]], true), pinnedCount: 1 }),
      },
    }

    const { container } = render(
      <PlanHeader scenario={null} room={room} guests={guests} seating={seating} unseatedCount={68} />,
    )

    const text = container.textContent ?? ''
    expect(text).toContain('Pinned')
    expect(text).toContain('Unseated')
    expect(text.indexOf('1')).toBeLessThan(text.lastIndexOf('68'))
    expect(text).toMatch(/1[\s\S]*Pinned/)
    expect(text).toMatch(/68[\s\S]*Unseated/)
  })
})

describe('PlanHeader — every figure that can change is tabular (KB-5)', () => {
  it('carries the tabular class on the headline, qualifier, composition and stat figures', () => {
    const room: RoomConfig = { roundTables: 9, seatsEach: 8, topTableSeats: 6 }
    const guests = makeGuests(70)
    const { container } = render(
      <PlanHeader scenario={null} room={room} guests={guests} seating={NOTHING_SEATED} unseatedCount={70} />,
    )

    // Headline (78, 70), qualifier spare (8), composition (9, 8, 6), stats (0 pinned, 70 unseated).
    expect(tabularTexts(container)).toEqual(['78', '70', '8', '9', '8', '6', '0', '70'])
  })
})
