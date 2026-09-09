import { describe, expect, it } from 'vitest'
import { addGuest, availablePartners, hasNeeds, removeGuest, tagsInUse, updateGuest } from './guests'
import type { Guest } from './types'

/**
 * TT-5, "Add and edit guests" — the reciprocity module. Written from the acceptance criteria
 * (C5, C6, C7, C8, C9, C11, C13, C20) and from .claude/plans/TT-5.md sections 3 and 4, whose
 * "Domain — model-developer" entry gives addGuest / updateGuest / removeGuest /
 * availablePartners / tagsInUse / hasNeeds their exact signatures, reciprocity behaviour and
 * throw contracts. This file does not open src/domain/guests.ts: written against the plan's
 * declared contract only, in the manner of capacity.test.ts.
 *
 * `age` is built as an AgeBand ('adult') rather than a number, per the plan's Answer to B1
 * (2026-09-09) — src/domain/types.ts changes `Guest.age` from `number` to `AgeBand` as part of
 * this same ticket, so a fixture typed as `number` would already be wrong for the finished type.
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

/** Deep clone for before/after mutation comparisons — Guest is plain JSON-shaped data. */
function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T
}

/** The plan's declared throw shape: `Guest <id>: <what>`. The wording of <what> is not specified. */
const GUEST_ERROR_SHAPE = /^Guest [\w-]+: /

describe('addGuest (C5, C8)', () => {
  it('writes partnerOf on both guests when the new guest names a partner', () => {
    const existing = makeGuest('g-1')

    const result = addGuest([existing], makeGuest('g-2', { partnerOf: 'g-1' }))

    expect(result.find((g) => g.id === 'g-1')?.partnerOf).toBe('g-2')
    expect(result.find((g) => g.id === 'g-2')?.partnerOf).toBe('g-1')
  })

  it('appends rather than sorting, and does not touch a guest unrelated to the new relationship', () => {
    const partner = makeGuest('g-1')
    const bystander = makeGuest('g-9')

    const result = addGuest([partner, bystander], makeGuest('g-2', { partnerOf: 'g-1' }))

    expect(result.map((g) => g.id)).toEqual(['g-1', 'g-9', 'g-2'])
    expect(result.find((g) => g.id === 'g-9')).toBe(bystander)
  })

  it('writes the new guest onto both sides of a named conflict', () => {
    const existing = makeGuest('g-1')

    const result = addGuest([existing], makeGuest('g-2', { conflictsWith: ['g-1'] }))

    expect(result.find((g) => g.id === 'g-1')?.conflictsWith).toEqual(['g-2'])
    expect(result.find((g) => g.id === 'g-2')?.conflictsWith).toEqual(['g-1'])
  })

  it('a new guest naming the same conflict id twice in one array leaves it appearing once, on both sides (C9)', () => {
    const other = makeGuest('g-2')

    const result = addGuest([other], makeGuest('g-1', { conflictsWith: ['g-2', 'g-2'] }))

    expect(result.find((g) => g.id === 'g-1')?.conflictsWith).toEqual(['g-2'])
    expect(result.find((g) => g.id === 'g-2')?.conflictsWith).toEqual(['g-1'])
  })

  it('does not duplicate the reciprocal id when the named conflict already carries it from a one-sided stored state', () => {
    // Storage is not a trusted input (docs/state.md) and isTopTableData checks no individual
    // guest field, so a guest already, one-sidedly, naming the id the new guest is about to
    // receive is representable on disk. The reciprocal write must not take that at face value
    // and push a second copy.
    const alreadyLinked = makeGuest('g-1', { conflictsWith: ['g-2'] })

    const result = addGuest([alreadyLinked], makeGuest('g-2', { conflictsWith: ['g-1'] }))

    expect(result.find((g) => g.id === 'g-1')?.conflictsWith).toEqual(['g-2'])
  })
})

describe('updateGuest (C7, C8)', () => {
  it('replaces the matching guest at the same index rather than moving it', () => {
    const a = makeGuest('g-1')
    const b = makeGuest('g-2')
    const c = makeGuest('g-3')

    const result = updateGuest([a, b, c], { ...b, name: 'Renamed' })

    expect(result.map((g) => g.id)).toEqual(['g-1', 'g-2', 'g-3'])
    expect(result[1]?.name).toBe('Renamed')
  })

  it('clearing a partner leaves both guests with partnerOf null', () => {
    const a = makeGuest('g-1', { partnerOf: 'g-2' })
    const b = makeGuest('g-2', { partnerOf: 'g-1' })

    const result = updateGuest([a, b], { ...a, partnerOf: null })

    expect(result.find((g) => g.id === 'g-1')?.partnerOf).toBeNull()
    expect(result.find((g) => g.id === 'g-2')?.partnerOf).toBeNull()
  })

  it('moving from one partner to another clears the old partner and sets the new one', () => {
    // The boundary either side of a plain clear: a repartnering (one partner -> a different,
    // previously unpartnered guest) reconciles both the drop and the set in a single write.
    const a = makeGuest('g-1', { partnerOf: 'g-2' })
    const b = makeGuest('g-2', { partnerOf: 'g-1' })
    const c = makeGuest('g-3')

    const result = updateGuest([a, b, c], { ...a, partnerOf: 'g-3' })

    expect(result.find((g) => g.id === 'g-1')?.partnerOf).toBe('g-3')
    expect(result.find((g) => g.id === 'g-2')?.partnerOf).toBeNull()
    expect(result.find((g) => g.id === 'g-3')?.partnerOf).toBe('g-1')
  })

  it('adding a conflict writes the id onto both guests', () => {
    const a = makeGuest('g-1')
    const b = makeGuest('g-2')

    const result = updateGuest([a, b], { ...a, conflictsWith: ['g-2'] })

    expect(result.find((g) => g.id === 'g-1')?.conflictsWith).toEqual(['g-2'])
    expect(result.find((g) => g.id === 'g-2')?.conflictsWith).toEqual(['g-1'])
  })

  it('removing a conflict removes it from both guests', () => {
    const a = makeGuest('g-1', { conflictsWith: ['g-2'] })
    const b = makeGuest('g-2', { conflictsWith: ['g-1'] })

    const result = updateGuest([a, b], { ...a, conflictsWith: [] })

    expect(result.find((g) => g.id === 'g-1')?.conflictsWith).toEqual([])
    expect(result.find((g) => g.id === 'g-2')?.conflictsWith).toEqual([])
  })

  it('the same pair added twice, across two separate saves, leaves the reciprocal id appearing once', () => {
    const a = makeGuest('g-1')
    const b = makeGuest('g-2')

    const afterFirst = updateGuest([a, b], { ...a, conflictsWith: ['g-2'] })
    const aAfterFirst = afterFirst.find((g) => g.id === 'g-1')
    if (!aAfterFirst) throw new Error('test setup: g-1 missing after first update')

    const afterSecond = updateGuest(afterFirst, { ...aAfterFirst, conflictsWith: ['g-2'] })

    expect(afterSecond.find((g) => g.id === 'g-2')?.conflictsWith).toEqual(['g-1'])
  })

  it('does not duplicate the reciprocal id when the other side already carries it from a one-sided stored state', () => {
    // Unlike the test above, the mismatch here is not between two saves of the same edit —
    // it is between what the edited guest's own previous state shows (no conflict recorded)
    // and what the other guest already, wrongly, carries. dedupeIds only ever normalises the
    // incoming guest's own array, so the diff below sees this as a brand new addition and the
    // reciprocal push has to be idempotent on its own, independent of that diff.
    const a = makeGuest('g-1') // conflictsWith: [] — g-2 is "new" from g-1's own history
    const bOneSided = makeGuest('g-2', { conflictsWith: ['g-1'] }) // already has it, one-sided

    const result = updateGuest([a, bOneSided], { ...a, conflictsWith: ['g-2'] })

    expect(result.find((g) => g.id === 'g-2')?.conflictsWith).toEqual(['g-1'])
  })

  it('throws if no guest matches the given id', () => {
    expect(() => updateGuest([makeGuest('g-1')], makeGuest('g-not-present'))).toThrow()
  })
})

describe('removeGuest (C13)', () => {
  it('drops the guest, nulls the ex-partners partnerOf, and removes the id from every conflictsWith', () => {
    const target = makeGuest('g-1', { partnerOf: 'g-2', conflictsWith: ['g-3'] })
    const partner = makeGuest('g-2', { partnerOf: 'g-1' })
    const conflictOwner = makeGuest('g-3', { conflictsWith: ['g-1', 'g-4'] })
    const unrelated = makeGuest('g-4', { conflictsWith: ['g-3'] })

    const result = removeGuest([target, partner, conflictOwner, unrelated], 'g-1')

    expect(result.map((g) => g.id)).toEqual(['g-2', 'g-3', 'g-4'])
    expect(result.find((g) => g.id === 'g-2')?.partnerOf).toBeNull()
    expect(result.find((g) => g.id === 'g-3')?.conflictsWith).toEqual(['g-4'])
    expect(result.find((g) => g.id === 'g-4')?.conflictsWith).toEqual(['g-3'])
  })

  it('removing an id that is not present returns the list unchanged', () => {
    const guests = [makeGuest('g-1'), makeGuest('g-2')]

    expect(removeGuest(guests, 'g-does-not-exist')).toEqual(guests)
  })
})

describe('removeGuest and future pins (R5)', () => {
  it('is the whole of what removeGuest cleans up today — partnerOf and conflictsWith, and nothing else, because no plan state exists yet (docs/state.md). Pins join this list when TT-11 to TT-15 lands, and belong inside this function, not beside it', () => {
    const target = makeGuest('g-1', { partnerOf: 'g-2', conflictsWith: ['g-3'] })
    const partner = makeGuest('g-2', { partnerOf: 'g-1' })
    const conflictOwner = makeGuest('g-3', { conflictsWith: ['g-1'] })

    const result = removeGuest([target, partner, conflictOwner], 'g-1')

    // Read this test's title, and the OBLIGATION comment on removeGuest, before adding a
    // pin-clearing step anywhere else in the codebase (plan risk R5). This assertion is the
    // marker to extend — with a third reconciled field — once pins exist.
    expect(result).toEqual([
      { ...partner, partnerOf: null },
      { ...conflictOwner, conflictsWith: [] },
    ])
  })
})

describe('availablePartners (C6)', () => {
  const editing = makeGuest('g-1', { partnerOf: 'g-2' })
  const currentPartner = makeGuest('g-2', { partnerOf: 'g-1' })
  const takenElsewhere = makeGuest('g-3', { partnerOf: 'g-4' })
  const takenElsewherePartner = makeGuest('g-4', { partnerOf: 'g-3' })
  const free = makeGuest('g-5')
  const guests = [editing, currentPartner, takenElsewhere, takenElsewherePartner, free]

  it('offers the editing guest\'s own partner and unpartnered guests, in list order, excluding the editing guest and anyone partnered elsewhere', () => {
    expect(availablePartners(guests, 'g-1').map((g) => g.id)).toEqual(['g-2', 'g-5'])
  })

  it('with no guest being edited, offers every unpartnered guest', () => {
    expect(availablePartners(guests, null).map((g) => g.id)).toEqual(['g-5'])
  })
})

describe('tagsInUse', () => {
  it('returns the distinct tags across the guest list, sorted alphabetically', () => {
    const guests = [
      makeGuest('g-1', { tags: ['uni', 'footie'] }),
      makeGuest('g-2', { tags: ['footie', 'family'] }),
    ]

    expect(tagsInUse(guests)).toEqual(['family', 'footie', 'uni'])
  })

  it('returns an empty array for an empty guest list', () => {
    expect(tagsInUse([])).toEqual([])
  })
})

describe('hasNeeds (C11, C20)', () => {
  it('is true for a guest with an allergy and nothing else', () => {
    expect(hasNeeds(makeGuest('g-1', { allergies: ['nuts'] }))).toBe(true)
  })

  it('is true for a guest with an accessibility need and nothing else', () => {
    expect(hasNeeds(makeGuest('g-1', { accessibility: ['step-free access'] }))).toBe(true)
  })

  it('is false for a guest with only a dietary preference — the assertion that stops the two lists being merged', () => {
    expect(hasNeeds(makeGuest('g-1', { dietaryPreferences: ['vegetarian'] }))).toBe(false)
  })

  it('is false for a guest with none of the three', () => {
    expect(hasNeeds(makeGuest('g-1'))).toBe(false)
  })
})

describe('reciprocity bug guards', () => {
  it('addGuest throws when the named partner already belongs to someone else (C6 guard)', () => {
    const partner = makeGuest('g-1', { partnerOf: 'g-3' })
    const partnersPartner = makeGuest('g-3', { partnerOf: 'g-1' })

    expect(() =>
      addGuest([partner, partnersPartner], makeGuest('g-2', { partnerOf: 'g-1' })),
    ).toThrow(GUEST_ERROR_SHAPE)
  })

  it('updateGuest throws when the named partner already belongs to someone else (C6 guard)', () => {
    const editing = makeGuest('g-1')
    const partner = makeGuest('g-2', { partnerOf: 'g-3' })
    const partnersPartner = makeGuest('g-3', { partnerOf: 'g-2' })

    expect(() =>
      updateGuest([editing, partner, partnersPartner], { ...editing, partnerOf: 'g-2' }),
    ).toThrow(GUEST_ERROR_SHAPE)
  })

  it('throws when a guest is set as their own partner', () => {
    const guest = makeGuest('g-1')

    expect(() => updateGuest([guest], { ...guest, partnerOf: 'g-1' })).toThrow(GUEST_ERROR_SHAPE)
  })

  it('throws when a guest conflicts with themselves (C9)', () => {
    const guest = makeGuest('g-1')

    expect(() => updateGuest([guest], { ...guest, conflictsWith: ['g-1'] })).toThrow(
      GUEST_ERROR_SHAPE,
    )
  })

  it('throws when partnerOf names an id absent from the guest list', () => {
    const guest = makeGuest('g-1')

    expect(() => updateGuest([guest], { ...guest, partnerOf: 'ghost' })).toThrow(GUEST_ERROR_SHAPE)
  })

  it('throws when a conflictsWith entry names an id absent from the guest list', () => {
    const guest = makeGuest('g-1')

    expect(() => updateGuest([guest], { ...guest, conflictsWith: ['ghost'] })).toThrow(
      GUEST_ERROR_SHAPE,
    )
  })

  it('addGuest throws when partnerOf names an id absent from the guest list', () => {
    expect(() => addGuest([], makeGuest('g-1', { partnerOf: 'ghost' }))).toThrow(GUEST_ERROR_SHAPE)
  })

  it('addGuest throws when a guest with that id already exists, rather than appending a second record or silently overwriting the first', () => {
    const existing = makeGuest('g-1', { name: 'Original' })

    expect(() => addGuest([existing], makeGuest('g-1', { name: 'Duplicate' }))).toThrow(
      GUEST_ERROR_SHAPE,
    )
  })
})

describe('purity', () => {
  it('addGuest does not mutate its inputs and is repeatable', () => {
    const existing = makeGuest('g-1')
    const guests = [existing]
    const guestsSnapshot = clone(guests)
    const incoming = makeGuest('g-2', { partnerOf: 'g-1' })
    const incomingSnapshot = clone(incoming)

    const first = addGuest(guests, incoming)

    expect(guests).toEqual(guestsSnapshot)
    expect(incoming).toEqual(incomingSnapshot)
    expect(addGuest(guests, incoming)).toEqual(first)
  })

  it('updateGuest does not mutate its inputs and is repeatable', () => {
    const a = makeGuest('g-1', { partnerOf: 'g-2' })
    const b = makeGuest('g-2', { partnerOf: 'g-1' })
    const guests = [a, b]
    const guestsSnapshot = clone(guests)
    const patch = { ...a, tags: ['uni'] }
    const patchSnapshot = clone(patch)

    const first = updateGuest(guests, patch)

    expect(guests).toEqual(guestsSnapshot)
    expect(patch).toEqual(patchSnapshot)
    expect(updateGuest(guests, patch)).toEqual(first)
  })

  it('removeGuest does not mutate its input and is repeatable', () => {
    const a = makeGuest('g-1', { partnerOf: 'g-2' })
    const b = makeGuest('g-2', { partnerOf: 'g-1' })
    const guests = [a, b]
    const guestsSnapshot = clone(guests)

    const first = removeGuest(guests, 'g-1')

    expect(guests).toEqual(guestsSnapshot)
    expect(removeGuest(guests, 'g-1')).toEqual(first)
  })
})
