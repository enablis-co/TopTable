import { describe, expect, it } from 'vitest'
import { rule as partnersAdjacentRule } from './partnersAdjacent.rule'
import type { Seat, SeatedTable } from '../seating'
import type { Guest } from '../types'

/**
 * TT-14's partners-adjacent rule (KB-2 soft constraints: "next to each other, not merely at the
 * same table"). Adjacency is TT-13's: a ring on a round table, a line on the top table. Written
 * from TT-14's acceptance criteria, KB-2 and KB-3. Does not open partnersAdjacent.rule.ts.
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

function seatOccupant(guest: Guest): Seat {
  return { guest, pinned: false }
}

/** A round or top table of the given capacity, with `occupants[i]` (if any) seated at seat i. */
function makeTable(id: string, kind: 'round' | 'top', capacity: number, occupants: Record<number, Guest>): SeatedTable {
  return {
    id,
    kind,
    number: kind === 'round' ? 1 : null,
    label: id,
    capacity,
    seats: Array.from({ length: capacity }, (_, i) => {
      const guest = occupants[i]
      return guest ? seatOccupant(guest) : null
    }),
    overflow: [],
  }
}

function sortedIds(ids: readonly string[]): string[] {
  return [...ids].sort()
}

describe('partners adjacent — fires when seated partners are not next to each other (KB-2)', () => {
  it('the same table is not enough: two seats apart at a round table of eight is a violation', () => {
    const a = makeGuest('a', { partnerOf: 'b' })
    const b = makeGuest('b', { partnerOf: 'a' })
    const table = makeTable('round-1', 'round', 8, { 0: a, 3: b })

    const findings = partnersAdjacentRule.evaluate({ tables: [table] })

    expect(findings).toHaveLength(1)
    expect(sortedIds(findings[0]?.guestIds ?? [])).toEqual(['a', 'b'])
    expect(findings[0]?.tableIds).toEqual(['round-1'])
  })

  it('fires across two different tables, naming both of them', () => {
    const a = makeGuest('a', { partnerOf: 'b' })
    const b = makeGuest('b', { partnerOf: 'a' })
    const tableOne = makeTable('round-1', 'round', 4, { 0: a })
    const tableTwo = makeTable('round-2', 'round', 4, { 0: b })

    const findings = partnersAdjacentRule.evaluate({ tables: [tableOne, tableTwo] })

    expect(findings).toHaveLength(1)
    expect(sortedIds(findings[0]?.tableIds ?? [])).toEqual(['round-1', 'round-2'])
    expect(sortedIds(findings[0]?.guestIds ?? [])).toEqual(['a', 'b'])
  })
})

describe('partners adjacent — quiet when they are actually next to each other (TT-13 adjacency)', () => {
  it('adjacent seats at a round table are quiet', () => {
    const a = makeGuest('a', { partnerOf: 'b' })
    const b = makeGuest('b', { partnerOf: 'a' })
    const table = makeTable('round-1', 'round', 8, { 2: a, 3: b })

    expect(partnersAdjacentRule.evaluate({ tables: [table] })).toEqual([])
  })

  it("a round table's wrap counts: the last seat and the first are adjacent", () => {
    const a = makeGuest('a', { partnerOf: 'b' })
    const b = makeGuest('b', { partnerOf: 'a' })
    const table = makeTable('round-1', 'round', 8, { 7: a, 0: b })

    expect(partnersAdjacentRule.evaluate({ tables: [table] })).toEqual([])
  })

  it('the same placement at the top table is NOT quiet — the top table is a line, so its two ends do not wrap', () => {
    const a = makeGuest('a', { partnerOf: 'b' })
    const b = makeGuest('b', { partnerOf: 'a' })
    const table = makeTable('top', 'top', 8, { 7: a, 0: b })

    const findings = partnersAdjacentRule.evaluate({ tables: [table] })

    expect(findings).toHaveLength(1)
    expect(sortedIds(findings[0]?.guestIds ?? [])).toEqual(['a', 'b'])
  })
})

describe('partners adjacent — a reciprocal pair is reported once, not twice (KB-3: partnerOf is reciprocal)', () => {
  it('with both sides declaring the partnership, exactly one finding names the pair', () => {
    const a = makeGuest('a', { partnerOf: 'b' })
    const b = makeGuest('b', { partnerOf: 'a' })
    const table = makeTable('round-1', 'round', 8, { 0: a, 5: b })

    expect(partnersAdjacentRule.evaluate({ tables: [table] })).toHaveLength(1)
  })
})

describe('partners adjacent — resolved from either direction, even when only one side\'s record carries it', () => {
  it('fires from the declaration alone when only the first guest names the second as their partner', () => {
    const a = makeGuest('a', { partnerOf: 'b' })
    const b = makeGuest('b')
    const table = makeTable('round-1', 'round', 8, { 0: a, 5: b })

    const findings = partnersAdjacentRule.evaluate({ tables: [table] })

    expect(findings).toHaveLength(1)
    expect(sortedIds(findings[0]?.guestIds ?? [])).toEqual(['a', 'b'])
  })

  it('fires from the declaration alone when only the second guest names the first as their partner', () => {
    const a = makeGuest('a')
    const b = makeGuest('b', { partnerOf: 'a' })
    const table = makeTable('round-1', 'round', 8, { 0: a, 5: b })

    const findings = partnersAdjacentRule.evaluate({ tables: [table] })

    expect(findings).toHaveLength(1)
    expect(sortedIds(findings[0]?.guestIds ?? [])).toEqual(['a', 'b'])
  })
})

describe('partners adjacent — quiet when a partner has no seat at all (KB-2, KB-3)', () => {
  it('a partner absent from every table entirely — unseated — is quiet, not a violation', () => {
    const a = makeGuest('a', { partnerOf: 'ghost' })
    const table = makeTable('round-1', 'round', 8, { 0: a })

    expect(partnersAdjacentRule.evaluate({ tables: [table] })).toEqual([])
  })

  it('a partner recorded at a table but in overflow — no seat — is a violation, not a silent pass', () => {
    const a = makeGuest('a', { partnerOf: 'b' })
    const b = makeGuest('b', { partnerOf: 'a' })
    const table: SeatedTable = { ...makeTable('round-1', 'round', 1, { 0: a }), overflow: [seatOccupant(b)] }

    const findings = partnersAdjacentRule.evaluate({ tables: [table] })

    expect(findings).toHaveLength(1)
    expect(sortedIds(findings[0]?.guestIds ?? [])).toEqual(['a', 'b'])
  })
})

describe('partners adjacent — quiet on a guest with no partner, and on an empty plan', () => {
  it('a guest with no partner at all never fires, however placed', () => {
    const solo = makeGuest('solo')
    const table = makeTable('round-1', 'round', 4, { 0: solo })

    expect(partnersAdjacentRule.evaluate({ tables: [table] })).toEqual([])
  })

  it('an empty plan is quiet and does not throw', () => {
    expect(() => partnersAdjacentRule.evaluate({ tables: [] })).not.toThrow()
    expect(partnersAdjacentRule.evaluate({ tables: [] })).toEqual([])
  })
})
