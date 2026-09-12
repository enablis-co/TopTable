import { describe, expect, it } from 'vitest'
import { suggestionsFrom } from './unseatedSuggestions'
import type { Guest } from '../../domain/types'

/**
 * TT-38 delta plan, §D4/§D6 (D9/D10) — the search box's suggestion pool: "names first in guest
 * order, then tags first-seen", tags de-duplicated case-insensitively keeping first-seen
 * casing, a value that is both a name and a tag appearing once per kind, input never mutated.
 * Written from that contract without opening unseatedSuggestions.ts.
 *
 * The plan states names and tags separately when it comes to de-duplication ("Tags
 * de-duplicated case-insensitively") and never says the same of names — read literally, two
 * guests who happen to share a name each still contribute their own name suggestion. That
 * reading is what the "two guests, same name" case below asserts; it is the one place this
 * file goes beyond a literal transcription of the plan's own words, so it is called out rather
 * than silently assumed.
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

describe('suggestionsFrom — no guests, no suggestions', () => {
  it('returns an empty array for an empty guest list', () => {
    expect(suggestionsFrom([])).toEqual([])
  })
})

describe('suggestionsFrom — names come first, in guest order', () => {
  it('one name suggestion per guest, kind "name", in the order the guests were given', () => {
    const guests = [
      makeGuest('g-1', { name: 'Danny Whitaker' }),
      makeGuest('g-2', { name: 'Maureen Shah' }),
      makeGuest('g-3', { name: 'Kev Braithwaite' }),
    ]

    const names = suggestionsFrom(guests).filter((s) => s.kind === 'name')

    expect(names).toEqual([
      { value: 'Danny Whitaker', kind: 'name' },
      { value: 'Maureen Shah', kind: 'name' },
      { value: 'Kev Braithwaite', kind: 'name' },
    ])
  })

  it('two guests sharing the same name each still contribute their own name suggestion', () => {
    const guests = [makeGuest('g-1', { name: 'Sam Reed' }), makeGuest('g-2', { name: 'Sam Reed' })]

    const names = suggestionsFrom(guests).filter((s) => s.kind === 'name')

    expect(names).toEqual([
      { value: 'Sam Reed', kind: 'name' },
      { value: 'Sam Reed', kind: 'name' },
    ])
  })
})

describe('suggestionsFrom — all names precede all tags', () => {
  it('every name-kind entry sits before every tag-kind entry, whatever order the guests carry them in', () => {
    const guests = [
      makeGuest('g-1', { name: 'Danny Whitaker', tags: ['uni'] }),
      makeGuest('g-2', { name: 'Maureen Shah', tags: ['family'] }),
    ]

    const result = suggestionsFrom(guests)
    const firstTagIndex = result.findIndex((s) => s.kind === 'tag')
    const lastNameIndex = result.reduce((last, s, index) => (s.kind === 'name' ? index : last), -1)

    expect(firstTagIndex).toBeGreaterThan(lastNameIndex)
    expect(result.filter((s) => s.kind === 'name')).toHaveLength(2)
    expect(result.filter((s) => s.kind === 'tag')).toHaveLength(2)
  })
})

describe('suggestionsFrom — tags are first-seen order, de-duplicated case-insensitively, keeping first-seen casing', () => {
  it('a tag repeated with different casing on a later guest contributes one entry, in the first casing seen', () => {
    const guests = [
      makeGuest('g-1', { tags: ['Uni', 'footie'] }),
      makeGuest('g-2', { tags: ['uni', 'work'] }),
    ]

    const tags = suggestionsFrom(guests).filter((s) => s.kind === 'tag')

    expect(tags).toEqual([
      { value: 'Uni', kind: 'tag' },
      { value: 'footie', kind: 'tag' },
      { value: 'work', kind: 'tag' },
    ])
  })

  it('the same tag repeated on the same guest still contributes only one entry', () => {
    const guests = [makeGuest('g-1', { tags: ['uni', 'uni'] })]

    const tags = suggestionsFrom(guests).filter((s) => s.kind === 'tag')

    expect(tags).toEqual([{ value: 'uni', kind: 'tag' }])
  })
})

describe('suggestionsFrom — a string that is both a name and a tag appears twice, once per kind', () => {
  it('a guest named "Uni" and a different guest tagged "uni" both appear, one of each kind', () => {
    const guests = [makeGuest('g-1', { name: 'Uni' }), makeGuest('g-2', { name: 'Someone Else', tags: ['uni'] })]

    const matches = suggestionsFrom(guests).filter((s) => s.value.toLowerCase() === 'uni')

    expect(matches).toHaveLength(2)
    expect(matches.map((s) => s.kind).sort()).toEqual(['name', 'tag'])
  })
})

describe('suggestionsFrom — never mutates its input', () => {
  it('leaves the guest list, and every guest\'s own tags array, unchanged', () => {
    const guests = [makeGuest('g-1', { name: 'Ana', tags: ['Uni', 'footie'] }), makeGuest('g-2', { tags: ['uni'] })]
    const snapshot = structuredClone(guests)

    suggestionsFrom(guests)

    expect(guests).toEqual(snapshot)
  })
})
