import { describe, expect, it } from 'vitest'
import { render, screen } from '@testing-library/react'
import { GuestHoverCard } from './GuestHoverCard'
import { guestSummaryFields } from './guestSummary'
import type { Guest } from '../../domain/types'

/**
 * TT-36. Written from the acceptance criteria (C3, C4, C18) and A1/A5, without opening
 * GuestHoverCard.tsx or GuestHoverCard.module.css. C20 ("never covers the seat it describes")
 * is not testable here — jsdom does no layout — and is verified by a browser pass instead
 * (docs/engineering-standards.md).
 *
 * TT-36 defect addendum (top-clip fix). `top`/`left`/`right` are computed from a measured card
 * height, and jsdom's getBoundingClientRect always reports zero height, so no positioning
 * assertion belongs in this file — that arithmetic is pinned in hoverCardPosition.test.ts
 * instead, against a real viewport argument. This file only confirms the zero-measured-height
 * path renders content correctly rather than throwing, looping or hiding it (D9's regression
 * guard for the surrounding component).
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

// A stand-in DOMRect: jsdom's own getBoundingClientRect always returns zeros regardless of what
// this fixture supplies (docs/engineering-standards.md, "What the suite cannot see"), so its
// exact numbers are irrelevant here — this file tests content, never position (C20 is a browser
// pass). Only `anchor === null` matters structurally: the component renders `display: none` for
// it, which would hide every field from a role query below.
const FAKE_ANCHOR = { x: 0, y: 0, width: 10, height: 10, top: 0, left: 0, right: 10, bottom: 10, toJSON: () => ({}) } as DOMRect

function renderCard(guest: Guest, guests: Guest[] = [guest]) {
  const fields = guestSummaryFields(guest, guests)
  return render(<GuestHoverCard id="summary-1" guest={guest} fields={fields} anchor={FAKE_ANCHOR} />)
}

describe('GuestHoverCard — every populated fact renders with its label (C3)', () => {
  it('renders the guest\'s name and every field guestSummaryFields produced', () => {
    const guest = makeGuest('g-1', {
      name: 'Danny Whitaker',
      side: 'groom',
      role: 'best man',
      household: 'The Whitakers',
      allergies: ['nuts'],
      tags: ['photographer'],
    })

    renderCard(guest)

    expect(screen.getByText('Danny Whitaker')).toBeInTheDocument()
    expect(screen.getByText('Side')).toBeInTheDocument()
    expect(screen.getByText('Groom')).toBeInTheDocument()
    expect(screen.getByText('Role')).toBeInTheDocument()
    expect(screen.getByText('Best man')).toBeInTheDocument()
    expect(screen.getByText('Household')).toBeInTheDocument()
    expect(screen.getByText('The Whitakers')).toBeInTheDocument()
    expect(screen.getByText('Allergies')).toBeInTheDocument()
    expect(screen.getByText('Nuts')).toBeInTheDocument()
    expect(screen.getByText('Tags')).toBeInTheDocument()
    expect(screen.getByText('photographer')).toBeInTheDocument()
  })

  it('a field with nothing in it renders no label and no row (C6)', () => {
    const guest = makeGuest('g-1', { household: null, tags: [], allergies: [], accessibility: [] })

    renderCard(guest)

    expect(screen.queryByText('Household')).not.toBeInTheDocument()
    expect(screen.queryByText('Tags')).not.toBeInTheDocument()
    expect(screen.queryByText('Allergies')).not.toBeInTheDocument()
    expect(screen.queryByText('Accessibility')).not.toBeInTheDocument()
  })
})

describe('GuestHoverCard — dietary preferences never appear, for any guest, in any state (C4)', () => {
  it('a guest with a dietary preference and an allergy shows the allergy but nothing naming the diet', () => {
    const guest = makeGuest('g-1', { allergies: ['nuts'], dietaryPreferences: ['vegan'] })

    const { container } = renderCard(guest)

    expect(screen.getByText('Nuts')).toBeInTheDocument()
    expect(container.textContent ?? '').not.toMatch(/vegan/i)
    expect(container.textContent ?? '').not.toMatch(/diet/i)
  })
})

describe('GuestHoverCard — tags render through the shared Tag, not a bespoke pill (A5)', () => {
  it('each tag is its own element, not folded into the "Tags" value as plain text', () => {
    const guest = makeGuest('g-1', { tags: ['photographer', 'driver'] })

    renderCard(guest)

    expect(screen.getByText('photographer')).toBeInTheDocument()
    expect(screen.getByText('driver')).toBeInTheDocument()
    expect(screen.queryByText('photographer, driver')).not.toBeInTheDocument()
  })
})

describe('GuestHoverCard — allergies are labelled in words, and the card carries no colour literal (C18, KB-5)', () => {
  it('the word "Allergies" appears as a label, not conveyed by colour alone', () => {
    const guest = makeGuest('g-1', { allergies: ['shellfish'] })

    renderCard(guest)

    expect(screen.getByText('Allergies')).toBeInTheDocument()
  })

  it('the rendered markup contains no inline colour literal — every colour is a token', () => {
    const guest = makeGuest('g-1', { allergies: ['shellfish'] })

    const { container } = renderCard(guest)

    expect(container.innerHTML).not.toMatch(/#[0-9a-fA-F]{3,8}\b/)
    expect(container.innerHTML).not.toMatch(/rgb\(|rgba\(|hsl\(/)
  })
})

describe('GuestHoverCard — named for the guest it describes, as an accessible group', () => {
  it('exposes a group role naming the guest', () => {
    const guest = makeGuest('g-1', { name: 'Priya Shah' })

    renderCard(guest)

    expect(screen.getByRole('group', { name: /Priya Shah/ })).toBeInTheDocument()
  })

  it('carries the id it was given, for a caller to wire aria-describedby against', () => {
    const guest = makeGuest('g-1')

    renderCard(guest)

    expect(document.getElementById('summary-1')).toBeInTheDocument()
  })
})

describe('GuestHoverCard — the height-measurement path degrades to zero without throwing, looping or hiding content (TT-36 addendum, D9 regression guard)', () => {
  it('renders every field even though jsdom reports an unmeasurable (zero) card height', () => {
    const guest = makeGuest('g-1', { name: 'Danny Whitaker', role: 'best man', allergies: ['nuts'] })

    renderCard(guest)

    // If the height-measurement effect could not cope with a zero measurement, the card would
    // either fail to render its content or throw during the layout effect — either way this
    // query would not find it.
    expect(screen.getByText('Danny Whitaker')).toBeInTheDocument()
    expect(screen.getByText('Allergies')).toBeInTheDocument()
    expect(screen.getByRole('group', { name: /Danny Whitaker/ })).toBeInTheDocument()
  })

  it('re-rendering with the same props settles rather than looping — the equality guard on the measured height converges', () => {
    const guest = makeGuest('g-1', { name: 'Priya Shah' })
    const fields = guestSummaryFields(guest, [guest])

    const { rerender } = render(
      <GuestHoverCard id="summary-1" guest={guest} fields={fields} anchor={FAKE_ANCHOR} />,
    )
    expect(screen.getByText('Priya Shah')).toBeInTheDocument()

    // A re-render with an unchanged, still-zero measured height must not hang or blow past a
    // render limit — if the effect looped instead of converging under its equality guard, this
    // rerender call would be where that shows up.
    rerender(<GuestHoverCard id="summary-1" guest={guest} fields={fields} anchor={FAKE_ANCHOR} />)

    expect(screen.getByText('Priya Shah')).toBeInTheDocument()
  })
})
