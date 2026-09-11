import { describe, expect, it } from 'vitest'
import type { Guest } from '../../domain/types'
import type { NeedCount } from './tableNeeds'
import { allergyCounts, dietaryCounts } from './tableNeeds'

/**
 * TT-15's needs block (C7). KB-3 is explicit that allergies and dietary preferences are
 * separate fields "deliberately" and "must never be merged into one list" — one is a safety
 * matter with a hard rule attached, the other a catering count. Every case below that builds
 * a guest with both fields set exists to hold that line, not just exercise the happy path.
 *
 * `NeedCount[]` is sorted by term ascending; KB-2/KB-3 give no ordering of their own, so this
 * file fixes it as the deterministic reading (never object key or guest-array order), per
 * docs/engineering-standards.md's "same input produces the same output twice, no iteration
 * order that depends on object key insertion".
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

describe('allergyCounts', () => {
  it('counts guests by allergy term', () => {
    const guests = [
      makeGuest({ allergies: ['nuts'] }),
      makeGuest({ allergies: ['nuts'] }),
      makeGuest({ allergies: ['dairy'] }),
    ]
    expect(allergyCounts(guests)).toEqual([
      { term: 'Dairy', count: 1 },
      { term: 'Nuts', count: 2 },
    ])
  })

  it('counts a guest with two allergies under both terms', () => {
    const guests = [makeGuest({ allergies: ['nuts', 'dairy'] })]
    expect(allergyCounts(guests)).toEqual([
      { term: 'Dairy', count: 1 },
      { term: 'Nuts', count: 1 },
    ])
  })

  it('sorts every term ascending, regardless of the order guests were given in', () => {
    const guests = [
      makeGuest({ allergies: ['shellfish'] }),
      makeGuest({ allergies: ['dairy'] }),
      makeGuest({ allergies: ['nuts'] }),
      makeGuest({ allergies: ['sesame'] }),
    ]
    expect(allergyCounts(guests).map((c: NeedCount) => c.term)).toEqual(['Dairy', 'Nuts', 'Sesame', 'Shellfish'])
  })

  it('capitalises only the first letter of the term', () => {
    expect(allergyCounts([makeGuest({ allergies: ['shellfish'] })])).toEqual([
      { term: 'Shellfish', count: 1 },
    ])
  })

  it('returns nothing for an empty guest list', () => {
    expect(allergyCounts([])).toEqual([])
  })

  it('returns nothing when no guest carries an allergy', () => {
    const guests = [makeGuest(), makeGuest({ dietaryPreferences: ['vegan'] })]
    expect(allergyCounts(guests)).toEqual([])
  })

  it('gives the same order for the same input every time', () => {
    const guests = [
      makeGuest({ allergies: ['sesame'] }),
      makeGuest({ allergies: ['dairy'] }),
      makeGuest({ allergies: ['nuts'] }),
    ]
    expect(allergyCounts(guests)).toEqual(allergyCounts(guests))
  })
})

describe('dietaryCounts', () => {
  it('counts guests by dietary preference', () => {
    const guests = [
      makeGuest({ dietaryPreferences: ['vegan'] }),
      makeGuest({ dietaryPreferences: ['vegan'] }),
      makeGuest({ dietaryPreferences: ['halal'] }),
    ]
    expect(dietaryCounts(guests)).toEqual([
      { term: 'Halal', count: 1 },
      { term: 'Vegan', count: 2 },
    ])
  })

  it('sorts every known term ascending, regardless of the order guests were given in', () => {
    const guests = [
      makeGuest({ dietaryPreferences: ['vegetarian'] }),
      makeGuest({ dietaryPreferences: ['pescatarian'] }),
      makeGuest({ dietaryPreferences: ['vegan'] }),
      makeGuest({ dietaryPreferences: ['gluten free'] }),
      makeGuest({ dietaryPreferences: ['halal'] }),
    ]
    expect(dietaryCounts(guests).map((c: NeedCount) => c.term)).toEqual([
      'Gluten free',
      'Halal',
      'Pescatarian',
      'Vegan',
      'Vegetarian',
    ])
  })

  it('capitalises only the first letter of a two-word term', () => {
    expect(dietaryCounts([makeGuest({ dietaryPreferences: ['gluten free'] })])).toEqual([
      { term: 'Gluten free', count: 1 },
    ])
  })

  it('returns nothing for an empty guest list', () => {
    expect(dietaryCounts([])).toEqual([])
  })

  it('returns nothing when no guest carries a dietary preference', () => {
    const guests = [makeGuest(), makeGuest({ allergies: ['nuts'] })]
    expect(dietaryCounts(guests)).toEqual([])
  })

  it('gives the same order for the same input every time', () => {
    const guests = [
      makeGuest({ dietaryPreferences: ['vegan'] }),
      makeGuest({ dietaryPreferences: ['halal'] }),
    ]
    expect(dietaryCounts(guests)).toEqual(dietaryCounts(guests))
  })
})

describe('allergies and dietary preferences are never merged (KB-3)', () => {
  it("keeps a guest's allergy out of the dietary counts, and their preference out of the allergy counts", () => {
    const guests = [
      makeGuest({ allergies: ['nuts'] }),
      makeGuest({ dietaryPreferences: ['vegan'] }),
    ]
    expect(allergyCounts(guests)).toEqual([{ term: 'Nuts', count: 1 }])
    expect(dietaryCounts(guests)).toEqual([{ term: 'Vegan', count: 1 }])
  })

  it('counts both fields on the same guest independently, not as one merged list', () => {
    const guests = [makeGuest({ allergies: ['nuts'], dietaryPreferences: ['vegan'] })]
    expect(allergyCounts(guests)).toEqual([{ term: 'Nuts', count: 1 }])
    expect(dietaryCounts(guests)).toEqual([{ term: 'Vegan', count: 1 }])
  })
})
