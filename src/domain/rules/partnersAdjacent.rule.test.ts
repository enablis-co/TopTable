import { describe, expect, it } from 'vitest'
import { rule as partnersAdjacentRule } from './partnersAdjacent.rule'
import type { RulePlan } from './contract'
import type { Seat, SeatedTable } from '../seating'
import type { Guest } from '../types'

/**
 * TT-14's partners-adjacent rule (KB-2 soft constraints: "next to each other, not merely at the
 * same table"). Adjacency is TT-13's: a ring on a round table, a line on the top table. Written
 * from TT-14's acceptance criteria, KB-2 and KB-3. Does not open partnersAdjacent.rule.ts.
 *
 * TT-16: `evaluate` now returns `{ findings, opportunities, missed }` rather than a bare array.
 * This is the one soft rule registered today, so it is the one whose counts actually reach the
 * score.
 *
 * Three separate jobs, per the contract's own doc comment: `findings` is what is wrong with the
 * seating as it stands; `opportunities` is how many partner pairs are on the guest list at all —
 * a property of who is on the list, never of how much of the plan is filled in; `missed` is how
 * many of those pairs are not seated adjacent, whether that is because they are seated apart (a
 * finding) or not seated together at all (a miss with nothing to show in the violations panel). A
 * pair only counts once it can be resolved to two actual guests — seated, in overflow, or in the
 * plan's own `unseated` list — never from a dangling `partnerOf` naming nobody the plan knows.
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

    const { findings } = partnersAdjacentRule.evaluate({ tables: [table], unseated: [] })

    expect(findings).toHaveLength(1)
    expect(sortedIds(findings[0]?.guestIds ?? [])).toEqual(['a', 'b'])
    expect(findings[0]?.tableIds).toEqual(['round-1'])
  })

  it('fires across two different tables, naming both of them', () => {
    const a = makeGuest('a', { partnerOf: 'b' })
    const b = makeGuest('b', { partnerOf: 'a' })
    const tableOne = makeTable('round-1', 'round', 4, { 0: a })
    const tableTwo = makeTable('round-2', 'round', 4, { 0: b })

    const { findings } = partnersAdjacentRule.evaluate({ tables: [tableOne, tableTwo], unseated: [] })

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

    expect(partnersAdjacentRule.evaluate({ tables: [table], unseated: [] }).findings).toEqual([])
  })

  it("a round table's wrap counts: the last seat and the first are adjacent", () => {
    const a = makeGuest('a', { partnerOf: 'b' })
    const b = makeGuest('b', { partnerOf: 'a' })
    const table = makeTable('round-1', 'round', 8, { 7: a, 0: b })

    expect(partnersAdjacentRule.evaluate({ tables: [table], unseated: [] }).findings).toEqual([])
  })

  it('the same placement at the top table is NOT quiet — the top table is a line, so its two ends do not wrap', () => {
    const a = makeGuest('a', { partnerOf: 'b' })
    const b = makeGuest('b', { partnerOf: 'a' })
    const table = makeTable('top', 'top', 8, { 7: a, 0: b })

    const { findings } = partnersAdjacentRule.evaluate({ tables: [table], unseated: [] })

    expect(findings).toHaveLength(1)
    expect(sortedIds(findings[0]?.guestIds ?? [])).toEqual(['a', 'b'])
  })
})

describe('partners adjacent — a reciprocal pair is reported once, not twice (KB-3: partnerOf is reciprocal)', () => {
  it('with both sides declaring the partnership, exactly one finding names the pair', () => {
    const a = makeGuest('a', { partnerOf: 'b' })
    const b = makeGuest('b', { partnerOf: 'a' })
    const table = makeTable('round-1', 'round', 8, { 0: a, 5: b })

    expect(partnersAdjacentRule.evaluate({ tables: [table], unseated: [] }).findings).toHaveLength(1)
  })
})

describe('partners adjacent — resolved from either direction, even when only one side\'s record carries it', () => {
  it('fires from the declaration alone when only the first guest names the second as their partner', () => {
    const a = makeGuest('a', { partnerOf: 'b' })
    const b = makeGuest('b')
    const table = makeTable('round-1', 'round', 8, { 0: a, 5: b })

    const { findings } = partnersAdjacentRule.evaluate({ tables: [table], unseated: [] })

    expect(findings).toHaveLength(1)
    expect(sortedIds(findings[0]?.guestIds ?? [])).toEqual(['a', 'b'])
  })

  it('fires from the declaration alone when only the second guest names the first as their partner', () => {
    const a = makeGuest('a')
    const b = makeGuest('b', { partnerOf: 'a' })
    const table = makeTable('round-1', 'round', 8, { 0: a, 5: b })

    const { findings } = partnersAdjacentRule.evaluate({ tables: [table], unseated: [] })

    expect(findings).toHaveLength(1)
    expect(sortedIds(findings[0]?.guestIds ?? [])).toEqual(['a', 'b'])
  })
})

describe('partners adjacent — a dangling partnerOf naming nobody the plan knows is quiet, and counts nowhere (KB-2, KB-3)', () => {
  it("a partner named by id alone, resolvable to no guest anywhere in the plan, is not a finding and not an opportunity", () => {
    const a = makeGuest('a', { partnerOf: 'ghost' })
    const table = makeTable('round-1', 'round', 8, { 0: a })

    const { findings, opportunities, missed } = partnersAdjacentRule.evaluate({ tables: [table], unseated: [] })

    expect(findings).toEqual([])
    expect(opportunities).toBe(0)
    expect(missed).toBe(0)
  })
})

describe('partners adjacent — overflow and genuinely unseated are the same fact, and score the same way (TT-16)', () => {
  it('a partner recorded at a table but in overflow — no seat — is a missed opportunity, never a finding: the overflow itself is a capacity matter, not a seating-together matter', () => {
    const a = makeGuest('a', { partnerOf: 'b' })
    const b = makeGuest('b', { partnerOf: 'a' })
    const table: SeatedTable = { ...makeTable('round-1', 'round', 1, { 0: a }), overflow: [seatOccupant(b)] }

    const { findings, opportunities, missed } = partnersAdjacentRule.evaluate({ tables: [table], unseated: [] })

    expect(findings).toEqual([])
    expect(opportunities).toBe(1)
    expect(missed).toBe(1)
  })

  it('the same partner, present in the plan\'s own unseated list instead of in overflow, scores identically', () => {
    const a = makeGuest('a', { partnerOf: 'b' })
    const b = makeGuest('b', { partnerOf: 'a' })
    const table = makeTable('round-1', 'round', 1, { 0: a })

    const overflowVersion = partnersAdjacentRule.evaluate({
      tables: [{ ...table, overflow: [seatOccupant(b)] }],
      unseated: [],
    })
    const unseatedVersion = partnersAdjacentRule.evaluate({ tables: [table], unseated: [b] })

    expect(unseatedVersion.findings).toEqual(overflowVersion.findings)
    expect(unseatedVersion.opportunities).toBe(overflowVersion.opportunities)
    expect(unseatedVersion.missed).toBe(overflowVersion.missed)
  })
})

describe('partners adjacent — quiet on a guest with no partner, and on an empty plan', () => {
  it('a guest with no partner at all never fires, however placed', () => {
    const solo = makeGuest('solo')
    const table = makeTable('round-1', 'round', 4, { 0: solo })

    expect(partnersAdjacentRule.evaluate({ tables: [table], unseated: [] }).findings).toEqual([])
  })

  it('an empty plan is quiet and does not throw', () => {
    expect(() => partnersAdjacentRule.evaluate({ tables: [], unseated: [] })).not.toThrow()
    expect(partnersAdjacentRule.evaluate({ tables: [], unseated: [] }).findings).toEqual([])
  })
})

describe('partners adjacent — opportunities counts every partner pair on the guest list, never only the seated ones (TT-16)', () => {
  it('a pair seated apart is one finding, one missed chance and one opportunity', () => {
    const a = makeGuest('a', { partnerOf: 'b' })
    const b = makeGuest('b', { partnerOf: 'a' })
    const table = makeTable('round-1', 'round', 8, { 0: a, 3: b })

    const { findings, opportunities, missed } = partnersAdjacentRule.evaluate({ tables: [table], unseated: [] })

    expect(findings).toHaveLength(1)
    expect(opportunities).toBe(1)
    expect(missed).toBe(1)
  })

  it('a pair seated adjacent is no finding, no missed chance, and still one opportunity', () => {
    const a = makeGuest('a', { partnerOf: 'b' })
    const b = makeGuest('b', { partnerOf: 'a' })
    const table = makeTable('round-1', 'round', 8, { 2: a, 3: b })

    const { findings, opportunities, missed } = partnersAdjacentRule.evaluate({ tables: [table], unseated: [] })

    expect(findings).toEqual([])
    expect(opportunities).toBe(1)
    expect(missed).toBe(0)
  })

  it('a pair with one partner genuinely on the guest list but unseated is a missed chance, not a finding — the opportunity still counts', () => {
    const a = makeGuest('a', { partnerOf: 'b' })
    const b = makeGuest('b', { partnerOf: 'a' })
    const table = makeTable('round-1', 'round', 8, { 0: a })

    const { findings, opportunities, missed } = partnersAdjacentRule.evaluate({ tables: [table], unseated: [b] })

    expect(findings).toEqual([])
    expect(opportunities).toBe(1)
    expect(missed).toBe(1)
  })

  it('a pair with both partners unseated is still one opportunity and one missed chance, never a finding', () => {
    const a = makeGuest('a', { partnerOf: 'b' })
    const b = makeGuest('b', { partnerOf: 'a' })
    const solo = makeGuest('solo')
    const table = makeTable('round-1', 'round', 4, { 0: solo })

    const { findings, opportunities, missed } = partnersAdjacentRule.evaluate({ tables: [table], unseated: [a, b] })

    expect(findings).toEqual([])
    expect(opportunities).toBe(1)
    expect(missed).toBe(1)
  })

  it('several independent pairs each contribute their own opportunity, summed across seated and unseated alike', () => {
    const a = makeGuest('a', { partnerOf: 'b' })
    const b = makeGuest('b', { partnerOf: 'a' })
    const c = makeGuest('c', { partnerOf: 'd' })
    const d = makeGuest('d', { partnerOf: 'c' })
    const e = makeGuest('e', { partnerOf: 'f' })
    const f = makeGuest('f', { partnerOf: 'e' })
    const tableOne = makeTable('round-1', 'round', 4, { 0: a, 1: b }) // adjacent, quiet
    const tableTwo = makeTable('round-2', 'round', 4, { 0: c, 2: d }) // apart, fires

    const { findings, opportunities, missed } = partnersAdjacentRule.evaluate({
      tables: [tableOne, tableTwo],
      unseated: [e, f], // a third pair, neither of them seated anywhere
    })

    expect(findings).toHaveLength(1)
    expect(opportunities).toBe(3)
    expect(missed).toBe(2)
  })

  it("opportunities is a property of the guest list, not of how much of the plan is seated: the same guest list scores the same opportunity count whether it is fully seated or barely started", () => {
    const a = makeGuest('a', { partnerOf: 'b' })
    const b = makeGuest('b', { partnerOf: 'a' })
    const fullySeated = makeTable('round-1', 'round', 8, { 2: a, 3: b })
    const barelyStarted = makeTable('round-1', 'round', 8, { 0: a })

    const seatedResult = partnersAdjacentRule.evaluate({ tables: [fullySeated], unseated: [] })
    const unseatedResult = partnersAdjacentRule.evaluate({ tables: [barelyStarted], unseated: [b] })

    expect(seatedResult.opportunities).toBe(unseatedResult.opportunities)
  })
})

describe('partners adjacent — findings.length never exceeds missed, and missed never exceeds opportunities, across every fixture above (TT-16)', () => {
  it('holds for a violating pair, a quiet pair, a dangling reference, an overflowed partner and a genuinely unseated partner', () => {
    const fixtures: RulePlan[] = [
      { tables: [makeTable('round-1', 'round', 8, { 0: makeGuest('a', { partnerOf: 'b' }), 3: makeGuest('b', { partnerOf: 'a' }) })], unseated: [] },
      { tables: [makeTable('round-1', 'round', 8, { 2: makeGuest('a', { partnerOf: 'b' }), 3: makeGuest('b', { partnerOf: 'a' }) })], unseated: [] },
      { tables: [makeTable('round-1', 'round', 8, { 0: makeGuest('a', { partnerOf: 'ghost' }) })], unseated: [] },
      {
        tables: [
          {
            ...makeTable('round-1', 'round', 1, { 0: makeGuest('a', { partnerOf: 'b' }) }),
            overflow: [seatOccupant(makeGuest('b', { partnerOf: 'a' }))],
          },
        ],
        unseated: [],
      },
      {
        tables: [makeTable('round-1', 'round', 8, { 0: makeGuest('a', { partnerOf: 'b' }) })],
        unseated: [makeGuest('b', { partnerOf: 'a' })],
      },
    ]

    for (const plan of fixtures) {
      const { findings, opportunities, missed } = partnersAdjacentRule.evaluate(plan)
      expect(findings.length).toBeLessThanOrEqual(missed)
      expect(missed).toBeLessThanOrEqual(opportunities)
    }
  })
})
