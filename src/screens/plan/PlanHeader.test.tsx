import { describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
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
 *
 * TT-16 part one: `PlanHeader` gained a required `score` prop (A15 — one object carrying
 * `value`, `expanded`, `panelId`, `onToggle` and `toggleRef`), so every render call below gains
 * `score={scoreFixture()}` to satisfy the type. `scoreFixture()` defaults to `value: null`
 * ("Nothing to score", no digits, no control — A14), which cannot interfere with any assertion
 * already in this file: none of them read digits, roles or text that a null score could
 * introduce. Not one existing assertion changes.
 *
 * TT-16 part two: the score renders as a percentage and loses its caret glyph, and Pinned
 * becomes the same kind of toggle. `PlanHeader` gains a required `pinned` prop — `expanded`,
 * `panelId`, `onToggle` and `toggleRef`, no `value`: the Pinned figure is still derived from
 * `guests`/`seating` exactly as it always was — so every render call below also gains
 * `pinned={pinnedFixture()}`. Its default `expanded: false` cannot interfere with any assertion
 * already in this file for the same reason the score default could not.
 *
 * TT-46: `PlanHeader` gains a required `publishable` prop, so every render call below also gains
 * `publishable={true}` to satisfy the type. `true` cannot interfere with any assertion already in
 * this file, since none of them read the publishability line's own words. New coverage is in its
 * own block below (A8, A6).
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

// `seats` defaults to `[]`, not to `guests` — a per-seat array built from `guests` directly
// would encode "the first n seats are occupied", which is exactly the compacted model C5 exists
// to forbid (review, TT-44). Nothing in this file reads a fixture's `seats`.
function occupantsFixture(overrides: Partial<TableOccupants> = {}): TableOccupants {
  return { guests: [], seats: [], pinnedCount: 0, inViolation: false, ...overrides }
}

function seatedGuests(guests: Guest[], pinned = false): SeatedGuest[] {
  return guests.map((guest) => ({ guest, pinned }))
}

function tabularTexts(container: HTMLElement): string[] {
  return Array.from(container.querySelectorAll('.tt-num')).map((el) => el.textContent?.trim() ?? '')
}

type ScoreFixture = {
  value: number | null
  expanded: boolean
  panelId: string
  onToggle: () => void
  toggleRef: { current: HTMLButtonElement | null }
}

function scoreFixture(overrides: Partial<ScoreFixture> = {}): ScoreFixture {
  return {
    value: null,
    expanded: false,
    panelId: 'score-breakdown-panel',
    onToggle: () => {},
    toggleRef: { current: null },
    ...overrides,
  }
}

type PinnedFixture = {
  expanded: boolean
  panelId: string
  onToggle: () => void
  toggleRef: { current: HTMLButtonElement | null }
}

function pinnedFixture(overrides: Partial<PinnedFixture> = {}): PinnedFixture {
  return {
    expanded: false,
    panelId: 'pinned-guests-panel',
    onToggle: () => {},
    toggleRef: { current: null },
    ...overrides,
  }
}

describe('PlanHeader — the capacity headline (handoff "Canvas header": "78 seats for 70 guests")', () => {
  it('reads "78 seats for 70 guests", seats before guests, for a configured room with nothing seated', () => {
    // Adding up's own room: 9 × 8 + 6 = 78 seats.
    const room: RoomConfig = { roundTables: 9, seatsEach: 8, topTableSeats: 6 }
    const guests = makeGuests(70)
    const { container } = render(
      <PlanHeader
        scenario={null}
        room={room}
        guests={guests}
        seating={NOTHING_SEATED}
        unseatedCount={70}
        score={scoreFixture()}
        pinned={pinnedFixture()}
        publishable={true}
      />,
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
      <PlanHeader
        scenario={null}
        room={room}
        guests={[]}
        seating={NOTHING_SEATED}
        unseatedCount={0}
        score={scoreFixture()}
        pinned={pinnedFixture()}
        publishable={true}
      />,
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
      <PlanHeader
        scenario={null}
        room={room}
        guests={[]}
        seating={NOTHING_SEATED}
        unseatedCount={0}
        score={scoreFixture()}
        pinned={pinnedFixture()}
        publishable={true}
      />,
    )

    expect(container.textContent).toContain('8 seats for 0 guests')
  })
})

describe('PlanHeader — the qualifier line: three calm states, one of them a warning (handoff "Canvas header")', () => {
  it('reads "8 spare" when seats exceed guests', () => {
    const room: RoomConfig = { roundTables: 9, seatsEach: 8, topTableSeats: 6 } // 78 seats
    const { container } = render(
      <PlanHeader
        scenario={null}
        room={room}
        guests={makeGuests(70)}
        seating={NOTHING_SEATED}
        unseatedCount={70}
        score={scoreFixture()}
        pinned={pinnedFixture()}
        publishable={true}
      />,
    )
    expect(container.textContent).toContain('8 spare')
  })

  it('reads "Exactly enough" when seats equal guests, with no spare/short figure', () => {
    const room: RoomConfig = { roundTables: 9, seatsEach: 8, topTableSeats: 6 } // 78 seats
    const { container } = render(
      <PlanHeader
        scenario={null}
        room={room}
        guests={makeGuests(78)}
        seating={NOTHING_SEATED}
        unseatedCount={78}
        score={scoreFixture()}
        pinned={pinnedFixture()}
        publishable={true}
      />,
    )
    const text = container.textContent ?? ''
    expect(text).toContain('Exactly enough')
    expect(text).not.toMatch(/\d+\s*spare/)
    expect(text).not.toMatch(/\d+\s*short/)
  })

  it('reads "N short" when guests exceed seats, and the qualifier carries data-state="short"', () => {
    const room: RoomConfig = { roundTables: 9, seatsEach: 8, topTableSeats: 6 } // 78 seats
    const { container } = render(
      <PlanHeader
        scenario={null}
        room={room}
        guests={makeGuests(80)}
        seating={NOTHING_SEATED}
        unseatedCount={80}
        score={scoreFixture()}
        pinned={pinnedFixture()}
        publishable={true}
      />,
    )

    expect(container.textContent).toMatch(/2\s*short/)
    expect(container.querySelector('[data-state="short"]')).not.toBeNull()
  })

  it('carries data-state="slack" and data-state="exact" for the other two states', () => {
    const room: RoomConfig = { roundTables: 9, seatsEach: 8, topTableSeats: 6 }
    const { rerender, container } = render(
      <PlanHeader
        scenario={null}
        room={room}
        guests={makeGuests(70)}
        seating={NOTHING_SEATED}
        unseatedCount={70}
        score={scoreFixture()}
        pinned={pinnedFixture()}
        publishable={true}
      />,
    )
    expect(container.querySelector('[data-state="slack"]')).not.toBeNull()

    rerender(
      <PlanHeader
        scenario={null}
        room={room}
        guests={makeGuests(78)}
        seating={NOTHING_SEATED}
        unseatedCount={78}
        score={scoreFixture()}
        pinned={pinnedFixture()}
        publishable={true}
      />,
    )
    expect(container.querySelector('[data-state="exact"]')).not.toBeNull()
  })
})

describe('PlanHeader — the composition, after the qualifier, separated by a middot (handoff: "9 × 8, plus a top table of 6")', () => {
  it('reads the round-table breakdown and the top table together', () => {
    const room: RoomConfig = { roundTables: 9, seatsEach: 8, topTableSeats: 6 }
    const { container } = render(
      <PlanHeader
        scenario={null}
        room={room}
        guests={makeGuests(70)}
        seating={NOTHING_SEATED}
        unseatedCount={70}
        score={scoreFixture()}
        pinned={pinnedFixture()}
        publishable={true}
      />,
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
      <PlanHeader
        scenario={null}
        room={room}
        guests={makeGuests(4)}
        seating={NOTHING_SEATED}
        unseatedCount={4}
        score={scoreFixture()}
        pinned={pinnedFixture()}
        publishable={true}
      />,
    )
    expect(container.textContent).not.toContain('×')
  })

  it('omits the top-table segment entirely when there is no top table', () => {
    const room: RoomConfig = { roundTables: 2, seatsEach: 4, topTableSeats: 0 }
    const { container } = render(
      <PlanHeader
        scenario={null}
        room={room}
        guests={makeGuests(8)}
        seating={NOTHING_SEATED}
        unseatedCount={8}
        score={scoreFixture()}
        pinned={pinnedFixture()}
        publishable={true}
      />,
    )
    expect(container.textContent).not.toContain('top table')
  })

  it('omits the whole qualifier-composition separator and breakdown when the room is entirely unconfigured', () => {
    const room: RoomConfig = { roundTables: 0, seatsEach: 0, topTableSeats: 0 }
    const { container } = render(
      <PlanHeader
        scenario={null}
        room={room}
        guests={[]}
        seating={NOTHING_SEATED}
        unseatedCount={0}
        score={scoreFixture()}
        pinned={pinnedFixture()}
        publishable={true}
      />,
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
      <PlanHeader
        scenario={id as ScenarioState}
        room={room}
        guests={guests}
        seating={NOTHING_SEATED}
        unseatedCount={2}
        score={scoreFixture()}
        pinned={pinnedFixture()}
        publishable={true}
      />,
    )
    expect(container.textContent).toContain(name)
  })

  it('scenario "custom" renders as "Custom"', () => {
    const { container } = render(
      <PlanHeader
        scenario="custom"
        room={room}
        guests={guests}
        seating={NOTHING_SEATED}
        unseatedCount={2}
        score={scoreFixture()}
        pinned={pinnedFixture()}
        publishable={true}
      />,
    )
    expect(container.textContent).toContain('Custom')
  })

  it('scenario null omits the segment entirely — no "Custom", no stray separator, no throw, no literal "null"', () => {
    const { container } = render(
      <PlanHeader
        scenario={null}
        room={room}
        guests={guests}
        seating={NOTHING_SEATED}
        unseatedCount={2}
        score={scoreFixture()}
        pinned={pinnedFixture()}
        publishable={true}
      />,
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
      <PlanHeader
        scenario={null}
        room={room}
        guests={guests}
        seating={seating}
        unseatedCount={68}
        score={scoreFixture()}
        pinned={pinnedFixture()}
        publishable={true}
      />,
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
      <PlanHeader
        scenario={null}
        room={room}
        guests={guests}
        seating={NOTHING_SEATED}
        unseatedCount={70}
        score={scoreFixture()}
        pinned={pinnedFixture()}
        publishable={true}
      />,
    )

    // Headline (78, 70), qualifier spare (8), composition (9, 8, 6), stats (0 pinned, 70 unseated).
    // score value is null in this fixture ("Nothing to score"), so it contributes no figure here.
    expect(tabularTexts(container)).toEqual(['78', '70', '8', '9', '8', '6', '0', '70'])
  })
})

/**
 * TT-16. The score stat itself. A minimal, fully-configured room and guest list is reused across
 * this block since none of these tests is about the capacity headline.
 */
describe('PlanHeader — the score stat (TT-16)', () => {
  const room: RoomConfig = { roundTables: 9, seatsEach: 8, topTableSeats: 6 }
  const guests = makeGuests(70)

  it('a score of 82 renders "82" inside a tabular element, labelled "Fit", alongside Pinned and Unseated', () => {
    const { container } = render(
      <PlanHeader
        scenario={null}
        room={room}
        guests={guests}
        seating={NOTHING_SEATED}
        unseatedCount={70}
        score={scoreFixture({ value: 82 })}
        pinned={pinnedFixture()}
        publishable={true}
      />,
    )

    expect(tabularTexts(container)).toContain('82')
    expect(container.textContent).toContain('Fit')
    expect(container.textContent).toContain('Pinned')
    expect(container.textContent).toContain('Unseated')
  })

  it('the score is a button whose accessible name contains both "82" and "Fit"', () => {
    render(
      <PlanHeader
        scenario={null}
        room={room}
        guests={guests}
        seating={NOTHING_SEATED}
        unseatedCount={70}
        score={scoreFixture({ value: 82 })}
        pinned={pinnedFixture()}
        publishable={true}
      />,
    )

    expect(screen.getByRole('button', { name: /82/ })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Fit/ })).toBeInTheDocument()
  })

  it('the button carries aria-expanded="false" when collapsed and "true" when expanded', () => {
    const { rerender } = render(
      <PlanHeader
        scenario={null}
        room={room}
        guests={guests}
        seating={NOTHING_SEATED}
        unseatedCount={70}
        score={scoreFixture({ value: 82, expanded: false })}
        pinned={pinnedFixture()}
        publishable={true}
      />,
    )
    expect(screen.getByRole('button', { name: /82/ })).toHaveAttribute('aria-expanded', 'false')

    rerender(
      <PlanHeader
        scenario={null}
        room={room}
        guests={guests}
        seating={NOTHING_SEATED}
        unseatedCount={70}
        score={scoreFixture({ value: 82, expanded: true })}
        pinned={pinnedFixture()}
        publishable={true}
      />,
    )
    expect(screen.getByRole('button', { name: /82/ })).toHaveAttribute('aria-expanded', 'true')
  })

  it('aria-controls names the panel id while expanded, and is absent while collapsed', () => {
    const { rerender } = render(
      <PlanHeader
        scenario={null}
        room={room}
        guests={guests}
        seating={NOTHING_SEATED}
        unseatedCount={70}
        score={scoreFixture({ value: 82, expanded: false, panelId: 'the-breakdown-panel' })}
        pinned={pinnedFixture()}
        publishable={true}
      />,
    )
    expect(screen.getByRole('button', { name: /82/ })).not.toHaveAttribute('aria-controls')

    rerender(
      <PlanHeader
        scenario={null}
        room={room}
        guests={guests}
        seating={NOTHING_SEATED}
        unseatedCount={70}
        score={scoreFixture({ value: 82, expanded: true, panelId: 'the-breakdown-panel' })}
        pinned={pinnedFixture()}
        publishable={true}
      />,
    )
    expect(screen.getByRole('button', { name: /82/ })).toHaveAttribute('aria-controls', 'the-breakdown-panel')
  })

  it('clicking the button calls onToggle exactly once', async () => {
    const user = userEvent.setup()
    const onToggle = vi.fn()
    render(
      <PlanHeader
        scenario={null}
        room={room}
        guests={guests}
        seating={NOTHING_SEATED}
        unseatedCount={70}
        score={scoreFixture({ value: 82, onToggle })}
        pinned={pinnedFixture()}
        publishable={true}
      />,
    )

    await user.click(screen.getByRole('button', { name: /82/ }))

    expect(onToggle).toHaveBeenCalledTimes(1)
  })

  it('a null score renders "Nothing to score", with no zero rendered anywhere for it, and no button named for it', () => {
    // Pinned and Unseated are made non-zero here (1 and 68) precisely so the only way a literal
    // "0" could appear in the render is as the score's own figure — a fixture where they read 0
    // couldn't tell "the score rendered no zero" apart from "something else happened to be zero".
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
      <PlanHeader
        scenario={null}
        room={room}
        guests={guests}
        seating={seating}
        unseatedCount={68}
        score={scoreFixture({ value: null })}
        pinned={pinnedFixture()}
        publishable={true}
      />,
    )

    expect(container.textContent).toContain('Nothing to score')
    // A lone "0" token — not a "0" that is merely a digit inside "70" or "68".
    expect(container.textContent ?? '').not.toMatch(/(?<![0-9])0(?![0-9])/)
    expect(screen.queryByRole('button', { name: /fit/i })).not.toBeInTheDocument()
  })

  it('the existing capacity headline, scenario label, qualifier line, Pinned and Unseated stats all render exactly as they do without a score', () => {
    const { container } = render(
      <PlanHeader
        scenario="adding-up"
        room={room}
        guests={guests}
        seating={NOTHING_SEATED}
        unseatedCount={70}
        score={scoreFixture({ value: 82 })}
        pinned={pinnedFixture()}
        publishable={true}
      />,
    )

    const text = container.textContent ?? ''
    expect(text).toContain('78')
    expect(text).toContain('seats for')
    expect(text).toContain('70')
    expect(text).toContain('guests')
    expect(text).toContain('8 spare')
    expect(text).toContain('Adding up')
    expect(text).toContain('Pinned')
    expect(text).toContain('Unseated')
  })
})

/**
 * TT-16 part two. The fit score renders as a percentage and drops its caret glyph.
 */
describe('PlanHeader — the score as a percentage, with no caret (TT-16 part two)', () => {
  const room: RoomConfig = { roundTables: 9, seatsEach: 8, topTableSeats: 6 }
  const guests = makeGuests(70)

  it('a score of 82 renders "82%", with only the digits carrying the tabular class', () => {
    const { container } = render(
      <PlanHeader
        scenario={null}
        room={room}
        guests={guests}
        seating={NOTHING_SEATED}
        unseatedCount={70}
        score={scoreFixture({ value: 82 })}
        pinned={pinnedFixture()}
        publishable={true}
      />,
    )

    const toggle = screen.getByRole('button', { name: /82/ })
    expect(toggle.textContent).toContain('82%')
    expect(tabularTexts(container)).toContain('82')
    // The % itself is not part of any tabular-class element's own text.
    const tabularElements = Array.from(container.querySelectorAll('.tt-num'))
    for (const element of tabularElements) {
      expect(element.textContent?.trim()).not.toContain('%')
    }
  })

  it('the accessible name contains the figure, the percent sign and "Fit"', () => {
    render(
      <PlanHeader
        scenario={null}
        room={room}
        guests={guests}
        seating={NOTHING_SEATED}
        unseatedCount={70}
        score={scoreFixture({ value: 82 })}
        pinned={pinnedFixture()}
        publishable={true}
      />,
    )

    expect(screen.getByRole('button', { name: /82%.*Fit/ })).toBeInTheDocument()
  })

  it('renders no caret, chevron or triangle glyph anywhere in the header (AC-F2)', () => {
    const { container } = render(
      <PlanHeader
        scenario={null}
        room={room}
        guests={guests}
        seating={NOTHING_SEATED}
        unseatedCount={70}
        score={scoreFixture({ value: 82 })}
        pinned={pinnedFixture()}
        publishable={true}
      />,
    )

    // AC-F2 is about the glyph, not about how the deleted implementation happened to render it
    // (an empty aria-hidden element) — a caret rebuilt as visible text inside an aria-hidden span
    // would pass an "empty hidden element" check while still rendering the glyph AC-F2 forbids.
    // So this reads the header's own text for the character, in any of the directions and sizes
    // a disclosure triangle is drawn with, rather than inspecting any one element's markup.
    const caretGlyphs = /[▲▴▶▸▼▾◀◂⌃⌄˄˅❮❯]/
    expect(container.textContent ?? '').not.toMatch(caretGlyphs)
  })

  it('a null score still renders "Nothing to score", with no figure and no "%" anywhere for it', () => {
    const { container } = render(
      <PlanHeader
        scenario={null}
        room={room}
        guests={guests}
        seating={NOTHING_SEATED}
        unseatedCount={70}
        score={scoreFixture({ value: null })}
        pinned={pinnedFixture()}
        publishable={true}
      />,
    )

    expect(container.textContent).toContain('Nothing to score')
    expect(container.textContent).not.toMatch(/\d+\s*%/)
    expect(screen.queryByRole('button', { name: /fit/i })).not.toBeInTheDocument()
  })
})

/**
 * TT-16 part two. The Pinned stat becomes the same kind of toggle as the score, opening the
 * pinned-guests panel — but only once there is something to show (AC-P1, AC-P2).
 */
describe('PlanHeader — the Pinned stat becomes a toggle too (TT-16 part two)', () => {
  const room: RoomConfig = { roundTables: 9, seatsEach: 8, topTableSeats: 6 }
  const guests = makeGuests(70)

  function seatingWithOnePinned(): SeatingView {
    const seatedPair = [guests[0], guests[1]]
    if (!seatedPair[0] || !seatedPair[1]) {
      throw new Error('expected two seeded guests')
    }
    return {
      byTableId: {
        'round-1': occupantsFixture({ guests: seatedGuests([seatedPair[0], seatedPair[1]], true), pinnedCount: 1 }),
      },
    }
  }

  it('with one or more pinned, the Pinned stat is a button named with its figure and "Pinned"', () => {
    render(
      <PlanHeader
        scenario={null}
        room={room}
        guests={guests}
        seating={seatingWithOnePinned()}
        unseatedCount={68}
        score={scoreFixture()}
        pinned={pinnedFixture()}
        publishable={true}
      />,
    )

    expect(screen.getByRole('button', { name: /1/ })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Pinned/ })).toBeInTheDocument()
  })

  it('the Pinned button carries aria-expanded and conditional aria-controls', () => {
    const { rerender } = render(
      <PlanHeader
        scenario={null}
        room={room}
        guests={guests}
        seating={seatingWithOnePinned()}
        unseatedCount={68}
        score={scoreFixture()}
        pinned={pinnedFixture({ expanded: false, panelId: 'the-pinned-panel' })}
        publishable={true}
      />,
    )
    const collapsed = screen.getByRole('button', { name: /Pinned/ })
    expect(collapsed).toHaveAttribute('aria-expanded', 'false')
    expect(collapsed).not.toHaveAttribute('aria-controls')

    rerender(
      <PlanHeader
        scenario={null}
        room={room}
        guests={guests}
        seating={seatingWithOnePinned()}
        unseatedCount={68}
        score={scoreFixture()}
        pinned={pinnedFixture({ expanded: true, panelId: 'the-pinned-panel' })}
        publishable={true}
      />,
    )
    const expanded = screen.getByRole('button', { name: /Pinned/ })
    expect(expanded).toHaveAttribute('aria-expanded', 'true')
    expect(expanded).toHaveAttribute('aria-controls', 'the-pinned-panel')
  })

  it('clicking the Pinned button calls its own onToggle exactly once', async () => {
    const user = userEvent.setup()
    const onToggle = vi.fn()
    render(
      <PlanHeader
        scenario={null}
        room={room}
        guests={guests}
        seating={seatingWithOnePinned()}
        unseatedCount={68}
        score={scoreFixture()}
        pinned={pinnedFixture({ onToggle })}
        publishable={true}
      />,
    )

    await user.click(screen.getByRole('button', { name: /Pinned/ }))

    expect(onToggle).toHaveBeenCalledTimes(1)
  })

  it('at zero pinned there is no button, but the figure and label still render', () => {
    const { container } = render(
      <PlanHeader
        scenario={null}
        room={room}
        guests={guests}
        seating={NOTHING_SEATED}
        unseatedCount={70}
        score={scoreFixture()}
        pinned={pinnedFixture()}
        publishable={true}
      />,
    )

    expect(screen.queryByRole('button', { name: /Pinned/ })).not.toBeInTheDocument()
    expect(container.textContent).toContain('Pinned')
    expect(tabularTexts(container)).toContain('0')
  })

  it('the score toggle and the Pinned toggle are two distinct controls', () => {
    render(
      <PlanHeader
        scenario={null}
        room={room}
        guests={guests}
        seating={seatingWithOnePinned()}
        unseatedCount={68}
        score={scoreFixture({ value: 82 })}
        pinned={pinnedFixture()}
        publishable={true}
      />,
    )

    const scoreButton = screen.getByRole('button', { name: /Fit/i })
    const pinnedButton = screen.getByRole('button', { name: /Pinned/ })
    expect(scoreButton).not.toBe(pinnedButton)
  })
})

/**
 * TT-46. The publishability line beside the score (A8), rendered whether or not there is a score
 * to accompany (A6), and never folded into the Fit toggle's own accessible name.
 */
describe('PlanHeader — the publishability line beside the score (A8, TT-46)', () => {
  const room: RoomConfig = { roundTables: 9, seatsEach: 8, topTableSeats: 6 }
  const guests = makeGuests(70)

  it('renders "Can be published" when publishable, and "Cannot be published" when not, with a real score', () => {
    const { rerender, container } = render(
      <PlanHeader
        scenario={null}
        room={room}
        guests={guests}
        seating={NOTHING_SEATED}
        unseatedCount={70}
        score={scoreFixture({ value: 82 })}
        pinned={pinnedFixture()}
        publishable={true}
      />,
    )
    expect(container.textContent).toContain('Can be published')
    expect(container.textContent).not.toContain('Cannot be published')

    rerender(
      <PlanHeader
        scenario={null}
        room={room}
        guests={guests}
        seating={NOTHING_SEATED}
        unseatedCount={70}
        score={scoreFixture({ value: 82 })}
        pinned={pinnedFixture()}
        publishable={false}
      />,
    )
    expect(container.textContent).toContain('Cannot be published')
    expect(container.textContent).not.toContain('Can be published')
  })

  it('still renders the publishability line when the score is null and reads "Nothing to score" (A6)', () => {
    const { container } = render(
      <PlanHeader
        scenario={null}
        room={room}
        guests={guests}
        seating={NOTHING_SEATED}
        unseatedCount={70}
        score={scoreFixture({ value: null })}
        pinned={pinnedFixture()}
        publishable={false}
      />,
    )
    expect(container.textContent).toContain('Nothing to score')
    expect(container.textContent).toContain('Cannot be published')
  })

  it("the Fit toggle's accessible name is unaffected by publishability — the words are never folded into it", () => {
    render(
      <PlanHeader
        scenario={null}
        room={room}
        guests={guests}
        seating={NOTHING_SEATED}
        unseatedCount={70}
        score={scoreFixture({ value: 82 })}
        pinned={pinnedFixture()}
        publishable={false}
      />,
    )

    expect(screen.getByRole('button', { name: /82%.*Fit/ })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /published/i })).not.toBeInTheDocument()
  })
})

/**
 * TT-53. The Fit figure gains a line naming how much of KB-2 has been built. The literal "5"
 * pins today's registry size (src/domain/rules/registry.ts); it will move, one edit at a time, as
 * TT-18, TT-20 to TT-22 register their rules — that is the intended prompt to look at this line
 * again, not a regression.
 */
describe('PlanHeader — the coverage line beside the score (TT-53)', () => {
  const room: RoomConfig = { roundTables: 9, seatsEach: 8, topTableSeats: 6 }
  const guests = makeGuests(70)

  it('a scored plan shows how much of the specification is built', () => {
    const { container } = render(
      <PlanHeader
        scenario={null}
        room={room}
        guests={guests}
        seating={NOTHING_SEATED}
        unseatedCount={70}
        score={scoreFixture({ value: 82 })}
        pinned={pinnedFixture()}
        publishable={true}
      />,
    )
    expect(container.textContent).toContain('5 of 10 rules built')
  })

  it('reads the coverage line after the stat row and before the publishability line', () => {
    const { container } = render(
      <PlanHeader
        scenario={null}
        room={room}
        guests={guests}
        seating={NOTHING_SEATED}
        unseatedCount={70}
        score={scoreFixture({ value: 82 })}
        pinned={pinnedFixture()}
        publishable={true}
      />,
    )
    // Both boundaries, not just the lower one: without the Unseated check the line could move
    // above the stat row — where TT-53 does not want it — and this test would stay green.
    const text = container.textContent ?? ''
    expect(text).toContain('Can be published')
    expect(text.indexOf('Unseated')).toBeLessThan(text.indexOf('5 of 10 rules built'))
    expect(text.indexOf('5 of 10 rules built')).toBeLessThan(text.indexOf('Can be published'))
  })

  it('with "Nothing to score" there is no coverage line', () => {
    const { container } = render(
      <PlanHeader
        scenario={null}
        room={room}
        guests={guests}
        seating={NOTHING_SEATED}
        unseatedCount={70}
        score={scoreFixture({ value: null })}
        pinned={pinnedFixture()}
        publishable={false}
      />,
    )
    expect(container.textContent).toContain('Nothing to score')
    expect(container.textContent).not.toContain('rules built')
  })

  it("the Fit toggle's accessible name carries no coverage text", () => {
    render(
      <PlanHeader
        scenario={null}
        room={room}
        guests={guests}
        seating={NOTHING_SEATED}
        unseatedCount={70}
        score={scoreFixture({ value: 82 })}
        pinned={pinnedFixture()}
        publishable={true}
      />,
    )
    expect(screen.getByRole('button', { name: /82%.*Fit/ })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /rules built/ })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /of 10/ })).not.toBeInTheDocument()
  })
})
