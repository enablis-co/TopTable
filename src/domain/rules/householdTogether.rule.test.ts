import { describe, expect, it } from 'vitest'
import { rule as householdTogetherRule } from './householdTogether.rule'
import type { RulePlan, SeatingRule } from './contract'
import type { Seat, SeatedTable } from '../seating'
import type { Guest } from '../types'

/**
 * TT-19's household-together rule (KB-2 soft constraints: "A household should not be spread
 * across more than two tables"). Written from TT-19's acceptance criteria (`.claude/plans/
 * TT-19.md` section 3) and KB-2/KB-3. Does not open householdTogether.rule.ts.
 *
 * `evaluate` returns `{ findings, opportunities, missed }` per `contract.ts`'s `RuleAssessment`:
 * `findings` is what is wrong with the seating as it stands; `opportunities` is how many
 * households of three or more members are on the guest list at all (A1 — a household of one or
 * two can never occupy more than two tables, so it is never a chance the rule could miss);
 * `missed` is how many of those chances this plan did not take, whether that shows up as a
 * finding (spread across three or more real seats) or not (A2 — a member with no real seat at
 * all, exactly `partnersAdjacent.rule.ts`'s own convention for an unseated partner).
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

describe('household together — fires when a household of three or more is spread across three or more tables (KB-2, criterion 1)', () => {
  it('a household of four with members at three different tables raises exactly one violation naming that household', () => {
    const a = makeGuest('a', { household: 'the-smiths' })
    const b = makeGuest('b', { household: 'the-smiths' })
    const c = makeGuest('c', { household: 'the-smiths' })
    const d = makeGuest('d', { household: 'the-smiths' })
    const tableOne = makeTable('round-1', 'round', 4, { 0: a, 1: d })
    const tableTwo = makeTable('round-2', 'round', 4, { 0: b })
    const tableThree = makeTable('round-3', 'round', 4, { 0: c })

    const { findings } = householdTogetherRule.evaluate({ tables: [tableOne, tableTwo, tableThree], unseated: [] })

    expect(findings).toHaveLength(1)
    expect(findings[0]?.message).toContain('the-smiths')
    expect(sortedIds(findings[0]?.tableIds ?? [])).toEqual(['round-1', 'round-2', 'round-3'])
    expect(sortedIds(findings[0]?.guestIds ?? [])).toEqual(['a', 'b', 'c', 'd'])
  })
})

describe('household together — quiet at the two-table boundary and below (KB-2, criterion 2)', () => {
  it('the same four guests across two tables raises none', () => {
    const a = makeGuest('a', { household: 'the-smiths' })
    const b = makeGuest('b', { household: 'the-smiths' })
    const c = makeGuest('c', { household: 'the-smiths' })
    const d = makeGuest('d', { household: 'the-smiths' })
    const tableOne = makeTable('round-1', 'round', 4, { 0: a, 1: b })
    const tableTwo = makeTable('round-2', 'round', 4, { 0: c, 1: d })

    expect(householdTogetherRule.evaluate({ tables: [tableOne, tableTwo], unseated: [] }).findings).toEqual([])
  })

  it('the same four guests all at one table raises none', () => {
    const a = makeGuest('a', { household: 'the-smiths' })
    const b = makeGuest('b', { household: 'the-smiths' })
    const c = makeGuest('c', { household: 'the-smiths' })
    const d = makeGuest('d', { household: 'the-smiths' })
    const table = makeTable('round-1', 'round', 8, { 0: a, 1: b, 2: c, 3: d })

    expect(householdTogetherRule.evaluate({ tables: [table], unseated: [] }).findings).toEqual([])
  })

  it('a household of two split across two tables raises none, and contributes no opportunity (A1)', () => {
    const a = makeGuest('a', { household: 'two-of-us' })
    const b = makeGuest('b', { household: 'two-of-us' })
    const tableOne = makeTable('round-1', 'round', 4, { 0: a })
    const tableTwo = makeTable('round-2', 'round', 4, { 0: b })

    const { findings, opportunities } = householdTogetherRule.evaluate({ tables: [tableOne, tableTwo], unseated: [] })

    expect(findings).toEqual([])
    expect(opportunities).toBe(0)
  })
})

describe('household together — the household field, and nothing else about a guest (KB-3, criterion 3)', () => {
  it('guests with household: null are never grouped together, however many there are', () => {
    const a = makeGuest('a', { household: null })
    const b = makeGuest('b', { household: null })
    const c = makeGuest('c', { household: null })
    const tableOne = makeTable('round-1', 'round', 4, { 0: a })
    const tableTwo = makeTable('round-2', 'round', 4, { 0: b })
    const tableThree = makeTable('round-3', 'round', 4, { 0: c })

    const { findings, opportunities, missed } = householdTogetherRule.evaluate({
      tables: [tableOne, tableTwo, tableThree],
      unseated: [],
    })

    expect(findings).toEqual([])
    expect(opportunities).toBe(0)
    expect(missed).toBe(0)
  })

  it('two households with the same member count and different names are reported separately', () => {
    const a1 = makeGuest('a1', { household: 'household-a' })
    const a2 = makeGuest('a2', { household: 'household-a' })
    const a3 = makeGuest('a3', { household: 'household-a' })
    const b1 = makeGuest('b1', { household: 'household-b' })
    const b2 = makeGuest('b2', { household: 'household-b' })
    const b3 = makeGuest('b3', { household: 'household-b' })
    const tableOne = makeTable('round-1', 'round', 4, { 0: a1, 1: b1 })
    const tableTwo = makeTable('round-2', 'round', 4, { 0: a2, 1: b2 })
    const tableThree = makeTable('round-3', 'round', 4, { 0: a3, 1: b3 })

    const { findings } = householdTogetherRule.evaluate({ tables: [tableOne, tableTwo, tableThree], unseated: [] })

    expect(findings).toHaveLength(2)
    const messages = findings.map((f) => f.message).join(' | ')
    expect(messages).toContain('household-a')
    expect(messages).toContain('household-b')
    const guestIdSets = findings.map((f) => sortedIds(f.guestIds))
    expect(guestIdSets).toContainEqual(['a1', 'a2', 'a3'])
    expect(guestIdSets).toContainEqual(['b1', 'b2', 'b3'])
  })
})

describe('household together — opportunities is a property of the guest list, never of how much of the plan is filled in (criterion 9, A1)', () => {
  function threeMemberHousehold(): [Guest, Guest, Guest] {
    return [
      makeGuest('h-a', { household: 'the-household' }),
      makeGuest('h-b', { household: 'the-household' }),
      makeGuest('h-c', { household: 'the-household' }),
    ]
  }

  it('equals the number of households of three or more on the guest list, unchanged whether everyone is seated or nobody is', () => {
    const [a, b, c] = threeMemberHousehold()
    const seatedPlan: RulePlan = { tables: [makeTable('round-1', 'round', 4, { 0: a, 1: b, 2: c })], unseated: [] }
    const unseatedPlan: RulePlan = { tables: [], unseated: [a, b, c] }

    const seatedResult = householdTogetherRule.evaluate(seatedPlan)
    const unseatedResult = householdTogetherRule.evaluate(unseatedPlan)

    expect(seatedResult.opportunities).toBe(1)
    expect(unseatedResult.opportunities).toBe(1)
  })

  it('a household of three with one member unseated and two seated together raises no finding, but counts as missed (A2)', () => {
    const [a, b, c] = threeMemberHousehold()
    const table = makeTable('round-1', 'round', 4, { 0: a, 1: b })

    const { findings, opportunities, missed } = householdTogetherRule.evaluate({ tables: [table], unseated: [c] })

    expect(findings).toEqual([])
    expect(opportunities).toBe(1)
    expect(missed).toBe(1)
  })

  it('a plan where every household is intact reports missed: 0 and findings: []', () => {
    const [a, b, c] = threeMemberHousehold()
    const outsider = makeGuest('solo', { household: null })
    const table = makeTable('round-1', 'round', 4, { 0: a, 1: b, 2: c, 3: outsider })

    const { findings, opportunities, missed } = householdTogetherRule.evaluate({ tables: [table], unseated: [] })

    expect(findings).toEqual([])
    expect(missed).toBe(0)
    expect(opportunities).toBe(1)
  })
})

describe('household together — registered at severity soft, with no weight override (criteria 4, 10)', () => {
  it('rule.severity is "soft" and rule.weight is undefined', () => {
    // Cast to the public contract type: the export is narrowed by `satisfies SeatingRule` rather
    // than widened to it (A6 — no `weight` field at all, deliberately), so `weight` is only
    // visible on the rule's own inferred type through the contract it declares itself to satisfy.
    const rule: SeatingRule = householdTogetherRule
    expect(rule.severity).toBe('soft')
    expect(rule.weight).toBeUndefined()
  })
})

describe('household together — findings.length never exceeds missed, and missed never exceeds opportunities, across every fixture above (criterion 13)', () => {
  it('holds for a three-way split, a two-table household, a fully gathered household, a null-household guest list, and a partially unseated household', () => {
    const smithA = makeGuest('smith-a', { household: 'smiths' })
    const smithB = makeGuest('smith-b', { household: 'smiths' })
    const smithC = makeGuest('smith-c', { household: 'smiths' })

    const fixtures: RulePlan[] = [
      // Split across three tables — a finding.
      {
        tables: [
          makeTable('round-1', 'round', 4, { 0: smithA }),
          makeTable('round-2', 'round', 4, { 0: smithB }),
          makeTable('round-3', 'round', 4, { 0: smithC }),
        ],
        unseated: [],
      },
      // Split across exactly two tables — quiet.
      {
        tables: [makeTable('round-1', 'round', 4, { 0: smithA, 1: smithB }), makeTable('round-2', 'round', 4, { 0: smithC })],
        unseated: [],
      },
      // All gathered at one table — quiet.
      { tables: [makeTable('round-1', 'round', 4, { 0: smithA, 1: smithB, 2: smithC })], unseated: [] },
      // A guest list of nothing but null households.
      { tables: [makeTable('round-1', 'round', 4, { 0: makeGuest('n1'), 1: makeGuest('n2') })], unseated: [] },
      // Two seated, one genuinely unseated — a miss with no finding.
      { tables: [makeTable('round-1', 'round', 4, { 0: smithA, 1: smithB })], unseated: [smithC] },
    ]

    for (const plan of fixtures) {
      const { findings, opportunities, missed } = householdTogetherRule.evaluate(plan)
      expect(findings.length).toBeLessThanOrEqual(missed)
      expect(missed).toBeLessThanOrEqual(opportunities)
    }
  })
})
