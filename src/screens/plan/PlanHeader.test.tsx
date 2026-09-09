import { describe, expect, it } from 'vitest'
import { render } from '@testing-library/react'
import { PlanHeader } from './PlanHeader'
import { NOTHING_SEATED } from './floorplan'
import type { SeatingView, TableOccupants } from './floorplan'
import type { Guest, RoomConfig } from '../../domain/types'
import type { ScenarioState } from '../../store/store'

/**
 * TT-11, "Render the floorplan from config" — C5 and A7. Written from TT-11's acceptance
 * criteria ("Header line shows the scenario, guest count, seat count, pinned count and unseated
 * count") and the `PlanHeader` contract in `.claude/plans/TT-11.md` section 4. Does not open
 * PlanHeader.tsx or PlanHeader.module.css.
 *
 * `scenarioLabel` is local to PlanHeader and not exported (section 4), so it is exercised only
 * through the component's rendered text, never called directly.
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

function occupantsFixture(overrides: Partial<TableOccupants> = {}): TableOccupants {
  return { guests: [], pinnedCount: 0, inViolation: false, ...overrides }
}

function tabularTexts(container: HTMLElement): string[] {
  return Array.from(container.querySelectorAll('.tt-num')).map((el) => el.textContent?.trim() ?? '')
}

describe('PlanHeader — the five figures, in order (C5)', () => {
  it('shows guests, seats, pinned and unseated for a configured room with nothing seated', () => {
    // Adding up's own room: 9 × 8 + 6 = 78 seats.
    const room: RoomConfig = { roundTables: 9, seatsEach: 8, topTableSeats: 6 }
    const guests = makeGuests(70)
    const { container } = render(
      <PlanHeader scenario={null} room={room} guests={guests} seating={NOTHING_SEATED} />,
    )

    const text = container.textContent ?? ''
    expect(text).toContain('70 guests')
    expect(text).toContain('78 seats')
    expect(text).toContain('0 pinned')
    expect(text).toContain('70 unseated')

    // "in order: scenario, guest count, seat count, pinned count, unseated count"
    expect(text.indexOf('70 guests')).toBeLessThan(text.indexOf('78 seats'))
    expect(text.indexOf('78 seats')).toBeLessThan(text.indexOf('0 pinned'))
    expect(text.indexOf('0 pinned')).toBeLessThan(text.indexOf('70 unseated'))
  })

  it('two guests seated, one pinned, shows "1 pinned" and drops unseated by two', () => {
    const room: RoomConfig = { roundTables: 9, seatsEach: 8, topTableSeats: 6 }
    const guests = makeGuests(70)
    const seatedPair = [guests[0], guests[1]]
    if (!seatedPair[0] || !seatedPair[1]) {
      throw new Error('expected two seeded guests')
    }
    const seating: SeatingView = {
      byTableId: {
        'round-1': occupantsFixture({ guests: [seatedPair[0], seatedPair[1]], pinnedCount: 1 }),
      },
    }

    const { container } = render(
      <PlanHeader scenario={null} room={room} guests={guests} seating={seating} />,
    )

    const text = container.textContent ?? ''
    expect(text).toContain('1 pinned')
    expect(text).toContain('68 unseated')
  })

  it('an unconfigured, guestless room reads all zeroes, not a blank or a throw', () => {
    const room: RoomConfig = { roundTables: 0, seatsEach: 0, topTableSeats: 0 }
    const { container } = render(
      <PlanHeader scenario={null} room={room} guests={[]} seating={NOTHING_SEATED} />,
    )

    const text = container.textContent ?? ''
    expect(text).toContain('0 guests')
    expect(text).toContain('0 seats')
    expect(text).toContain('0 pinned')
    expect(text).toContain('0 unseated')
  })
})

describe('PlanHeader — the scenario segment (C5, A7)', () => {
  const room: RoomConfig = { roundTables: 1, seatsEach: 4, topTableSeats: 4 }
  const guests = makeGuests(2)

  it.each([
    ['small-and-cosy', 'Small and cosy'],
    ['adding-up', 'Adding up'],
    ['celebrity-scale', 'Celebrity scale'],
  ] as const)('scenario %s renders as "%s", before the guest count', (id, name) => {
    const { container } = render(
      <PlanHeader scenario={id as ScenarioState} room={room} guests={guests} seating={NOTHING_SEATED} />,
    )
    const text = container.textContent ?? ''
    expect(text).toContain(name)
    expect(text.indexOf(name)).toBeLessThan(text.indexOf('guests'))
  })

  it('scenario "custom" renders as "Custom"', () => {
    const { container } = render(
      <PlanHeader scenario="custom" room={room} guests={guests} seating={NOTHING_SEATED} />,
    )
    expect(container.textContent).toContain('Custom')
  })

  it('scenario null omits the segment entirely — no "Custom", no stray separator, no throw, no literal "null"', () => {
    const { container } = render(
      <PlanHeader scenario={null} room={room} guests={guests} seating={NOTHING_SEATED} />,
    )
    const text = container.textContent ?? ''
    expect(text).not.toContain('Custom')
    expect(text).not.toContain('null')
    expect(text).not.toContain('undefined')
    // No separator left dangling at the very start of the line, and no doubled-up separator
    // where the omitted scenario segment would otherwise have sat.
    expect(text.trimStart()).not.toMatch(/^[·•|]/)
    expect(text).not.toMatch(/[·•|]\s*[·•|]/)
  })
})

describe('PlanHeader — the four numeric figures are tabular (C9)', () => {
  it('renders exactly the four counted figures with the tt-num class, in order', () => {
    const room: RoomConfig = { roundTables: 9, seatsEach: 8, topTableSeats: 6 }
    const guests = makeGuests(70)
    const { container } = render(
      <PlanHeader scenario={null} room={room} guests={guests} seating={NOTHING_SEATED} />,
    )

    expect(tabularTexts(container)).toEqual(['70', '78', '0', '70'])
  })
})
