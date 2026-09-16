import { describe, expect, it } from 'vitest'
import { chairLabel, initialSeatIndex, nextSeatIndex } from './chairNavigation'
import type { Guest } from '../../domain/types'
import type { SeatedGuest } from './floorplan'

/**
 * TT-36. Written from the acceptance criteria (C11, C13, C14) and A2/A7's worked examples,
 * without opening chairNavigation.ts.
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

function seated(guest: Guest): SeatedGuest {
  return { guest, pinned: false }
}

describe('initialSeatIndex — the first occupied seat, or 0 when none is (C12)', () => {
  it('returns the index of the first occupied seat, not seat 0, when the table has occupants', () => {
    const seats = [null, null, seated(makeGuest('g-1')), seated(makeGuest('g-2'))]
    expect(initialSeatIndex(seats)).toBe(2)
  })

  it('returns 0 for an entirely empty table', () => {
    const seats = [null, null, null]
    expect(initialSeatIndex(seats)).toBe(0)
  })

  it('returns 0 for a table with no seats at all', () => {
    expect(initialSeatIndex([])).toBe(0)
  })
})

describe('nextSeatIndex — Left/Up previous, Right/Down next, Home first, End last, wrapping at both ends (C11)', () => {
  it('ArrowLeft from seat 0 wraps to the last seat', () => {
    expect(nextSeatIndex(0, 8, 'ArrowLeft')).toBe(7)
  })

  it('ArrowUp behaves exactly like ArrowLeft', () => {
    expect(nextSeatIndex(0, 8, 'ArrowUp')).toBe(7)
  })

  it('ArrowRight from the last seat wraps to seat 0', () => {
    expect(nextSeatIndex(7, 8, 'ArrowRight')).toBe(0)
  })

  it('ArrowDown behaves exactly like ArrowRight', () => {
    expect(nextSeatIndex(7, 8, 'ArrowDown')).toBe(0)
  })

  it('ArrowRight from a middle seat moves to the next one, no wrap', () => {
    expect(nextSeatIndex(3, 8, 'ArrowRight')).toBe(4)
  })

  it('ArrowLeft from a middle seat moves to the previous one, no wrap', () => {
    expect(nextSeatIndex(3, 8, 'ArrowLeft')).toBe(2)
  })

  it('Home always goes to the first seat', () => {
    expect(nextSeatIndex(5, 8, 'Home')).toBe(0)
  })

  it('End always goes to the last seat', () => {
    expect(nextSeatIndex(0, 8, 'End')).toBe(7)
  })

  it('an unhandled key returns null, so the caller knows not to preventDefault it', () => {
    expect(nextSeatIndex(3, 8, 'Tab')).toBeNull()
    expect(nextSeatIndex(3, 8, 'a')).toBeNull()
    expect(nextSeatIndex(3, 8, 'Escape')).toBeNull()
  })

  it('a zero seat count returns null for every key, never divides by zero', () => {
    expect(nextSeatIndex(0, 0, 'ArrowRight')).toBeNull()
    expect(nextSeatIndex(0, 0, 'Home')).toBeNull()
  })
})

describe('chairLabel — 1-based, names the guest when occupied and says empty when not (C13, C14)', () => {
  it('an occupied chair names the guest, seat number 1-based', () => {
    expect(chairLabel(2, makeGuest('g-1', { name: 'Danny Whitaker' }))).toBe('Seat 3, Danny Whitaker')
  })

  it('an empty chair says "empty", not the guest\'s absence some other way', () => {
    expect(chairLabel(2, null)).toBe('Seat 3, empty')
  })

  it('seat index 0 is Seat 1, matching KB-4\'s printed, 1-based positions', () => {
    expect(chairLabel(0, null)).toBe('Seat 1, empty')
  })
})
