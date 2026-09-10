import { describe, expect, it, vi } from 'vitest'
import { createRef } from 'react'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { UnseatedRail } from './UnseatedRail'
import type { Guest } from '../../domain/types'

/**
 * TT-12, "Place a guest by clicking". Written from the acceptance criteria and KB-6's rail
 * copy ("Unseated"), without opening UnseatedRail.tsx or UnseatedRail.module.css.
 *
 * Every Guest fixture sets `age` to an AgeBand, matching the pattern already established in
 * PlanTable.test.tsx and PlanScreen.test.tsx.
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
    selectedGuestId?: string | null
    onSelect?: (guestId: string) => void
  } = {},
) {
  const onSelect = overrides.onSelect ?? vi.fn()
  const headingRef = createRef<HTMLHeadingElement>()
  const utils = render(
    <UnseatedRail
      guests={overrides.guests ?? []}
      selectedGuestId={overrides.selectedGuestId ?? null}
      onSelect={onSelect}
      headingRef={headingRef}
    />,
  )
  return { ...utils, onSelect, headingRef }
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
