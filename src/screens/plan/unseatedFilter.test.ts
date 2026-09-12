import { describe, expect, it } from 'vitest'
import { NO_FILTERS, isFiltered, filterUnseated } from './unseatedFilter'
import type { UnseatedFilters } from './unseatedFilter'
import type { Guest } from '../../domain/types'
import { PROTOCOL_ROLES, OTHER_ROLES } from '../../domain/types'

/**
 * TT-38, "Scroll and filter the unseated list" — C3 through C7, plus the pure-function
 * guarantees (order preserved, input never mutated) that the rail's own tests lean on. Written
 * from the acceptance criteria, KB-3 and TT-6 (the guest list this search must match), without
 * opening unseatedFilter.ts.
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

describe('filterUnseated — a need is an allergy or an accessibility note, never a dietary preference (C6, KB-3)', () => {
  it('a guest with only a dietary preference is NOT matched by needs: "with"', () => {
    const guests = [makeGuest('g-1', { dietaryPreferences: ['vegan'] })]

    expect(filterUnseated(guests, { ...NO_FILTERS, needs: 'with' })).toEqual([])
  })

  it('that same guest — dietary preference only, nothing else — IS matched by needs: "without"', () => {
    const guests = [makeGuest('g-1', { dietaryPreferences: ['vegan'] })]

    expect(filterUnseated(guests, { ...NO_FILTERS, needs: 'without' }).map((g) => g.id)).toEqual(['g-1'])
  })

  it('an allergy alone counts as a need', () => {
    const guests = [makeGuest('g-1', { allergies: ['nuts'] }), makeGuest('g-2')]

    expect(filterUnseated(guests, { ...NO_FILTERS, needs: 'with' }).map((g) => g.id)).toEqual(['g-1'])
  })

  it('an accessibility note alone counts as a need', () => {
    const guests = [makeGuest('g-1', { accessibility: ['step-free access'] }), makeGuest('g-2')]

    expect(filterUnseated(guests, { ...NO_FILTERS, needs: 'with' }).map((g) => g.id)).toEqual(['g-1'])
  })

  it('a dietary preference alongside a real need does not disqualify it — the dietary field is simply irrelevant, not a competing signal', () => {
    const guests = [
      makeGuest('g-1', { dietaryPreferences: ['vegan', 'halal'] }),
      makeGuest('g-2', { allergies: ['nuts'], dietaryPreferences: ['vegan'] }),
    ]

    expect(filterUnseated(guests, { ...NO_FILTERS, needs: 'with' }).map((g) => g.id)).toEqual(['g-2'])
    expect(filterUnseated(guests, { ...NO_FILTERS, needs: 'without' }).map((g) => g.id)).toEqual(['g-1'])
  })

  it('"any" applies no needs constraint at all', () => {
    const guests = [makeGuest('g-1', { allergies: ['nuts'] }), makeGuest('g-2')]

    expect(filterUnseated(guests, { ...NO_FILTERS, needs: 'any' })).toEqual(guests)
  })
})

describe('filterUnseated — search matches the same way the guest list does (C3, TT-6)', () => {
  it('matches a name substring, case-insensitively', () => {
    const guests = [makeGuest('g-1', { name: 'Ana Ferreira' }), makeGuest('g-2', { name: 'Ben Ojo' })]

    expect(filterUnseated(guests, { ...NO_FILTERS, query: 'ANA' }).map((g) => g.id)).toEqual(['g-1'])
  })

  it('matches a tag substring', () => {
    const guests = [makeGuest('g-1', { tags: ['uni', 'footie'] }), makeGuest('g-2', { tags: ['work'] })]

    expect(filterUnseated(guests, { ...NO_FILTERS, query: 'uni' }).map((g) => g.id)).toEqual(['g-1'])
  })

  // Regression shape (TT-5/TT-6 review, repeated here since the criterion says "the same way"):
  // a trailing space is easy to leave in a search box and must not defeat the match.
  it('trims a trailing space from the query rather than matching nothing', () => {
    const guests = [makeGuest('g-1', { name: 'Ana Ferreira' })]

    expect(filterUnseated(guests, { ...NO_FILTERS, query: 'Ana ' }).map((g) => g.id)).toEqual(['g-1'])
  })

  it('an empty query matches everybody', () => {
    const guests = [makeGuest('g-1'), makeGuest('g-2')]

    expect(filterUnseated(guests, { ...NO_FILTERS, query: '' })).toEqual(guests)
  })

  it('a query matching nobody returns an empty list', () => {
    const guests = [makeGuest('g-1', { name: 'Ana Ferreira' })]

    expect(filterUnseated(guests, { ...NO_FILTERS, query: 'zzz-nothing-matches' })).toEqual([])
  })
})

describe('filterUnseated — side', () => {
  it('filters to guests on the named side', () => {
    const guests = [
      makeGuest('g-1', { side: 'bride' }),
      makeGuest('g-2', { side: 'groom' }),
      makeGuest('g-3', { side: 'both' }),
    ]

    expect(filterUnseated(guests, { ...NO_FILTERS, side: 'bride' }).map((g) => g.id)).toEqual(['g-1'])
    expect(filterUnseated(guests, { ...NO_FILTERS, side: 'groom' }).map((g) => g.id)).toEqual(['g-2'])
    expect(filterUnseated(guests, { ...NO_FILTERS, side: 'both' }).map((g) => g.id)).toEqual(['g-3'])
  })

  it('"any" applies no side constraint at all', () => {
    const guests = [makeGuest('g-1', { side: 'bride' }), makeGuest('g-2', { side: 'groom' })]

    expect(filterUnseated(guests, { ...NO_FILTERS, side: 'any' })).toEqual(guests)
  })
})

describe('filterUnseated — role, over all twelve roles (C5, KB-3, KB-4)', () => {
  const allRoles = [...PROTOCOL_ROLES, ...OTHER_ROLES]

  it.each(allRoles)('filters to only the guest holding the "%s" role', (role) => {
    const guests = allRoles.map((r, index) => makeGuest(`g-${index}`, { role: r }))

    expect(filterUnseated(guests, { ...NO_FILTERS, role }).map((g) => g.role)).toEqual([role])
  })

  it('"any" applies no role constraint at all', () => {
    const guests = [makeGuest('g-1', { role: 'guest' }), makeGuest('g-2', { role: 'usher' })]

    expect(filterUnseated(guests, { ...NO_FILTERS, role: 'any' })).toEqual(guests)
  })
})

describe('filterUnseated — search and all three filters combine', () => {
  it('a guest shows only if they satisfy the search and every active filter at once', () => {
    const guests = [
      makeGuest('g-1', { name: 'Ana Ferreira', side: 'bride', role: 'bridesmaid', allergies: ['nuts'] }),
      makeGuest('g-2', { name: 'Ana Smith', side: 'bride', role: 'bridesmaid' }), // fails needs
      makeGuest('g-3', { name: 'Ana Torres', side: 'groom', role: 'bridesmaid', allergies: ['nuts'] }), // fails side
      makeGuest('g-4', { name: 'Ana Reyes', side: 'bride', role: 'guest', allergies: ['nuts'] }), // fails role
      makeGuest('g-5', { name: 'Ben Cole', side: 'bride', role: 'bridesmaid', allergies: ['nuts'] }), // fails search
    ]
    const filters: UnseatedFilters = { query: 'Ana', side: 'bride', role: 'bridesmaid', needs: 'with' }

    expect(filterUnseated(guests, filters).map((g) => g.id)).toEqual(['g-1'])
  })
})

describe('filterUnseated — order is preserved', () => {
  it('keeps the surviving guests in the order the input array gave them, not re-sorted', () => {
    const guests = [
      makeGuest('g-4', { name: 'Ana Delta' }),
      makeGuest('g-1', { name: 'Zed Alpha' }),
      makeGuest('g-2', { name: 'Ana Beta' }),
    ]

    expect(filterUnseated(guests, { ...NO_FILTERS, query: 'ana' }).map((g) => g.id)).toEqual(['g-4', 'g-2'])
  })
})

describe('filterUnseated — never mutates its input', () => {
  it('leaves the guests array and every guest object in it unchanged, whichever filters are applied', () => {
    const guests = [
      makeGuest('g-1', { name: 'Ana Ferreira', tags: ['uni'], allergies: ['nuts'] }),
      makeGuest('g-2', { name: 'Ben Ojo' }),
    ]
    const snapshot = structuredClone(guests)

    filterUnseated(guests, { query: 'ana', side: 'bride', role: 'guest', needs: 'without' })

    expect(guests).toEqual(snapshot)
  })
})

describe('NO_FILTERS and isFiltered', () => {
  it('NO_FILTERS applies no search, side, role or needs constraint', () => {
    expect(NO_FILTERS).toEqual({ query: '', side: 'any', role: 'any', needs: 'any' })
  })

  it('isFiltered is false for NO_FILTERS itself, and for any value equal to it', () => {
    expect(isFiltered(NO_FILTERS)).toBe(false)
    expect(isFiltered({ query: '', side: 'any', role: 'any', needs: 'any' })).toBe(false)
  })

  it('isFiltered is true once the query differs from NO_FILTERS', () => {
    expect(isFiltered({ ...NO_FILTERS, query: 'ana' })).toBe(true)
  })

  it('isFiltered is true once the side differs from NO_FILTERS', () => {
    expect(isFiltered({ ...NO_FILTERS, side: 'bride' })).toBe(true)
  })

  it('isFiltered is true once the role differs from NO_FILTERS', () => {
    expect(isFiltered({ ...NO_FILTERS, role: 'guest' })).toBe(true)
  })

  it('isFiltered is true once needs differs from NO_FILTERS', () => {
    expect(isFiltered({ ...NO_FILTERS, needs: 'with' })).toBe(true)
  })
})
