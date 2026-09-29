import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { rule as conflictsRule } from './conflicts.rule'
import { allocate } from '../allocate'
import { evaluatePlan, seatGuardFrom } from './engine'
import { scorePlan } from './score'
import { REGISTERED_RULES, evaluateRegistered } from './registry'
import type { Seat, SeatedTable } from '../seating'
import type { Guest, RoomConfig } from '../types'
import type { ScenarioId } from '../scenarios'
import type { RulePlan } from './contract'

/**
 * TT-17's conflicts rule (KB-2: "Two guests recorded as in conflict must not share a table").
 * Hard, remedy "seating", scored at the default hard weight of 3 (KB-8). Written from TT-17's
 * plan section 3 (S1-S8, C1-C10, G1-G4, P1-P3) and KB-2/KB-3/KB-8. Does not open conflicts.rule.ts,
 * engine.ts, contract.ts or allocate.ts.
 *
 * `conflictsWith` is reciprocal (KB-3): a pair recorded on either side, or both, counts once. A
 * self-reference or an id naming nobody on the plan is ignored. `opportunities` counts every such
 * pair regardless of how much of the plan is filled in; `missed` counts a pair sharing a table (a
 * finding) or a pair with either guest genuinely unresolved to a table (no finding) — the two are
 * scored identically, per `partnersAdjacent.rule.ts`'s own precedent for the same distinction.
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

/** A round or top table of the given capacity, with `occupants[i]` (if any) seated at seat i, and
 *  the given guests (if any) in overflow. Label is the table's own id, so a finding's `detail`
 *  (A4: the table's label) can be checked directly against it. */
function makeTable(
  id: string,
  kind: 'round' | 'top',
  capacity: number,
  occupants: Record<number, Guest>,
  overflow: Guest[] = [],
): SeatedTable {
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
    overflow: overflow.map(seatOccupant),
  }
}

function sortedIds(ids: readonly string[]): string[] {
  return [...ids].sort()
}

function deepFreeze<T>(value: T): T {
  if (value !== null && typeof value === 'object' && !Object.isFrozen(value)) {
    const record = value as Record<string, unknown>
    for (const key of Object.keys(record)) {
      deepFreeze(record[key])
    }
    Object.freeze(value)
  }
  return value
}

describe('conflicts — fires when a conflict pair shares a table (KB-2, C2, C5, C8)', () => {
  it('reciprocal pair at the same round table: one finding naming the table and both guests, sorted by id', () => {
    const a = makeGuest('a', { conflictsWith: ['b'] })
    const b = makeGuest('b', { conflictsWith: ['a'] })
    const table = makeTable('round-1', 'round', 4, { 0: a, 1: b })

    const { findings, opportunities, missed } = conflictsRule.evaluate({ tables: [table], unseated: [] })

    expect(findings).toHaveLength(1)
    expect(findings[0]?.tableIds).toEqual(['round-1'])
    expect(sortedIds(findings[0]?.guestIds ?? [])).toEqual(['a', 'b'])
    expect(findings[0]?.message).toBe('Guest a and Guest b are in conflict')
    expect(findings[0]?.detail).toBe('round-1')
    expect(opportunities).toBe(1)
    expect(missed).toBe(1)
  })

  it('a guest in the overflow of the other guest\'s table shares that table (C7)', () => {
    const a = makeGuest('a', { conflictsWith: ['b'] })
    const b = makeGuest('b', { conflictsWith: ['a'] })
    const table = makeTable('round-1', 'round', 1, { 0: a }, [b])

    const { findings } = conflictsRule.evaluate({ tables: [table], unseated: [] })

    expect(findings).toHaveLength(1)
    expect(sortedIds(findings[0]?.guestIds ?? [])).toEqual(['a', 'b'])
  })

  it('a pair together at the top table fires, naming it (C2)', () => {
    const a = makeGuest('a', { conflictsWith: ['b'] })
    const b = makeGuest('b', { conflictsWith: ['a'] })
    const table = makeTable('top', 'top', 8, { 0: a, 1: b })

    const { findings } = conflictsRule.evaluate({ tables: [table], unseated: [] })

    expect(findings).toHaveLength(1)
    expect(findings[0]?.tableIds).toEqual(['top'])
  })

  it('three guests all in conflict with each other at one table: three findings, one per pair (C5)', () => {
    const a = makeGuest('a', { conflictsWith: ['b', 'c'] })
    const b = makeGuest('b', { conflictsWith: ['c'] })
    const c = makeGuest('c')
    const table = makeTable('round-1', 'round', 4, { 0: a, 1: b, 2: c })

    const { findings, opportunities, missed } = conflictsRule.evaluate({ tables: [table], unseated: [] })

    expect(findings).toHaveLength(3)
    expect(opportunities).toBe(3)
    expect(missed).toBe(3)
  })

  it('one guest with two independent conflicts, all seated at one table: two opportunities, two findings (C4, C5)', () => {
    const a = makeGuest('a', { conflictsWith: ['b', 'c'] })
    const b = makeGuest('b')
    const c = makeGuest('c')
    const table = makeTable('round-1', 'round', 4, { 0: a, 1: b, 2: c })

    const { findings, opportunities, missed } = conflictsRule.evaluate({ tables: [table], unseated: [] })

    expect(opportunities).toBe(2)
    expect(missed).toBe(2)
    expect(findings).toHaveLength(2)
  })
})

describe('conflicts — stays quiet when a pair is kept apart (KB-2, C3, C5, C7)', () => {
  it('a and b at different tables: no finding, and the chance is taken (missed 0)', () => {
    const a = makeGuest('a', { conflictsWith: ['b'] })
    const b = makeGuest('b', { conflictsWith: ['a'] })
    const tableOne = makeTable('round-1', 'round', 4, { 0: a })
    const tableTwo = makeTable('round-2', 'round', 4, { 0: b })

    const { findings, opportunities, missed } = conflictsRule.evaluate({
      tables: [tableOne, tableTwo],
      unseated: [],
    })

    expect(findings).toEqual([])
    expect(opportunities).toBe(1)
    expect(missed).toBe(0)
  })

  it('b in the overflow of a different table from a: no finding, no miss (C7)', () => {
    const a = makeGuest('a', { conflictsWith: ['b'] })
    const b = makeGuest('b', { conflictsWith: ['a'] })
    const tableOne = makeTable('round-1', 'round', 4, { 0: a })
    const tableTwo = makeTable('round-2', 'round', 1, {}, [b])

    const { findings, missed } = conflictsRule.evaluate({ tables: [tableOne, tableTwo], unseated: [] })

    expect(findings).toEqual([])
    expect(missed).toBe(0)
  })

  it('a with b and a with c, b and c seated apart from a and from each other: no findings, chances taken (C4, C5)', () => {
    const a = makeGuest('a', { conflictsWith: ['b', 'c'] })
    const b = makeGuest('b')
    const c = makeGuest('c')
    const tableA = makeTable('round-1', 'round', 4, { 0: a })
    const tableB = makeTable('round-2', 'round', 4, { 0: b })
    const tableC = makeTable('round-3', 'round', 4, { 0: c })

    const { findings, opportunities, missed } = conflictsRule.evaluate({
      tables: [tableA, tableB, tableC],
      unseated: [],
    })

    expect(findings).toEqual([])
    expect(opportunities).toBe(2)
    expect(missed).toBe(0)
  })

  it('no conflicts anywhere on the plan: zero opportunities, zero missed (C9)', () => {
    const a = makeGuest('a')
    const b = makeGuest('b')
    const table = makeTable('round-1', 'round', 4, { 0: a, 1: b })

    const { findings, opportunities, missed } = conflictsRule.evaluate({ tables: [table], unseated: [] })

    expect(findings).toEqual([])
    expect(opportunities).toBe(0)
    expect(missed).toBe(0)
  })
})

describe('conflicts — either guest with no table is a missed chance, never a finding (A2, C4, C5)', () => {
  it('a seated, b genuinely unseated', () => {
    const a = makeGuest('a', { conflictsWith: ['b'] })
    const b = makeGuest('b', { conflictsWith: ['a'] })
    const table = makeTable('round-1', 'round', 4, { 0: a })

    const { findings, opportunities, missed } = conflictsRule.evaluate({ tables: [table], unseated: [b] })

    expect(findings).toEqual([])
    expect(opportunities).toBe(1)
    expect(missed).toBe(1)
  })

  it('both a and b unseated, tables otherwise empty', () => {
    const a = makeGuest('a', { conflictsWith: ['b'] })
    const b = makeGuest('b', { conflictsWith: ['a'] })
    const table = makeTable('round-1', 'round', 4, {})

    const { findings, opportunities, missed } = conflictsRule.evaluate({ tables: [table], unseated: [a, b] })

    expect(findings).toEqual([])
    expect(opportunities).toBe(1)
    expect(missed).toBe(1)
  })
})

describe('conflicts — a pair is counted once, however it is recorded (KB-3 reciprocity; C6)', () => {
  it('one-sided from the lower-sorting id: opportunities is still 1', () => {
    const a = makeGuest('a', { conflictsWith: ['b'] })
    const b = makeGuest('b')
    const table = makeTable('round-1', 'round', 4, { 0: a, 1: b })

    const { findings, opportunities } = conflictsRule.evaluate({ tables: [table], unseated: [] })

    expect(opportunities).toBe(1)
    expect(findings).toHaveLength(1)
  })

  it('one-sided from the higher-sorting id (the variant): opportunities is still 1', () => {
    const a = makeGuest('a')
    const b = makeGuest('b', { conflictsWith: ['a'] })
    const table = makeTable('round-1', 'round', 4, { 0: a, 1: b })

    const { findings, opportunities } = conflictsRule.evaluate({ tables: [table], unseated: [] })

    expect(opportunities).toBe(1)
    expect(findings).toHaveLength(1)
  })

  it('recorded on both sides (fully reciprocal): still counted once', () => {
    const a = makeGuest('a', { conflictsWith: ['b'] })
    const b = makeGuest('b', { conflictsWith: ['a'] })
    const table = makeTable('round-1', 'round', 4, { 0: a, 1: b })

    const { opportunities } = conflictsRule.evaluate({ tables: [table], unseated: [] })

    expect(opportunities).toBe(1)
  })

  it('a self-reference is ignored: zero opportunities', () => {
    const a = makeGuest('a', { conflictsWith: ['a'] })
    const table = makeTable('round-1', 'round', 4, { 0: a })

    const { opportunities } = conflictsRule.evaluate({ tables: [table], unseated: [] })

    expect(opportunities).toBe(0)
  })

  it('an id naming nobody on the plan is ignored: zero opportunities', () => {
    const a = makeGuest('a', { conflictsWith: ['ghost'] })
    const table = makeTable('round-1', 'round', 4, { 0: a })

    const { opportunities } = conflictsRule.evaluate({ tables: [table], unseated: [] })

    expect(opportunities).toBe(0)
  })

  it('a repeated id in one guest\'s own list is counted once', () => {
    const a = makeGuest('a', { conflictsWith: ['b', 'b'] })
    const b = makeGuest('b')
    const table = makeTable('round-1', 'round', 4, { 0: a, 1: b })

    const { opportunities } = conflictsRule.evaluate({ tables: [table], unseated: [] })

    expect(opportunities).toBe(1)
  })
})

describe('conflicts — an empty plan, and purity (S7)', () => {
  it('an empty plan does not throw, and every count is 0', () => {
    expect(() => conflictsRule.evaluate({ tables: [], unseated: [] })).not.toThrow()
    const { findings, opportunities, missed } = conflictsRule.evaluate({ tables: [], unseated: [] })
    expect(findings).toEqual([])
    expect(opportunities).toBe(0)
    expect(missed).toBe(0)
  })

  function buildConflictPairPlan(): RulePlan {
    const a = makeGuest('a', { conflictsWith: ['b'] })
    const b = makeGuest('b', { conflictsWith: ['a'] })
    const table = makeTable('round-1', 'round', 4, { 0: a, 1: b })
    return { tables: [table], unseated: [] }
  }

  it('gives deeply equal results for two separately-built but equal plans, and neither throws nor mutates a deeply frozen plan', () => {
    expect(conflictsRule.evaluate(buildConflictPairPlan())).toEqual(conflictsRule.evaluate(buildConflictPairPlan()))

    const frozen = deepFreeze(buildConflictPairPlan())
    expect(() => conflictsRule.evaluate(frozen)).not.toThrow()
  })
})

const DIR = dirname(fileURLToPath(import.meta.url))

type ScenarioFixture = { meta: { tables: RoomConfig }; guests: Guest[] }

function readScenario(id: ScenarioId): ScenarioFixture {
  const path = join(DIR, '../../../public/scenarios', `${id}.json`)
  return JSON.parse(readFileSync(path, 'utf8')) as ScenarioFixture
}

describe('conflicts — scenario pair counts are the same whether the plan is fully unseated or fully allocated (C10, C4)', () => {
  const expectedOpportunities: Record<ScenarioId, number> = {
    'small-and-cosy': 1,
    'adding-up': 3,
    'celebrity-scale': 9,
  }

  it.each(['small-and-cosy', 'adding-up', 'celebrity-scale'] as const)('%s', (id) => {
    const { meta, guests } = readScenario(id)

    const fullyUnseated: RulePlan = { tables: [], unseated: guests }
    const allocated = allocate(meta.tables, guests, [])

    const unseatedResult = conflictsRule.evaluate(fullyUnseated)
    const allocatedResult = conflictsRule.evaluate(allocated)

    expect(unseatedResult.opportunities).toBe(expectedOpportunities[id])
    expect(allocatedResult.opportunities).toBe(expectedOpportunities[id])
    // On the fully unseated plan, every pair is a miss with no finding.
    expect(unseatedResult.missed).toBe(expectedOpportunities[id])
    expect(unseatedResult.findings).toEqual([])
  })
})

describe('conflicts — the plan we know breaks it (G2, C2)', () => {
  it('"Small and cosy", unguarded, gives exactly one conflicts finding, naming g-009 and g-013', () => {
    const { meta, guests } = readScenario('small-and-cosy')
    const plan = allocate(meta.tables, guests, [])

    const { findings } = conflictsRule.evaluate(plan)

    expect(findings).toHaveLength(1)
    expect(sortedIds(findings[0]?.guestIds ?? [])).toEqual(['g-009', 'g-013'])
  })
})

describe('conflicts — registration and scoring (C1, C9)', () => {
  it('is registered as id "conflicts", hard, remedy seating, with KB-2\'s wording as its description', () => {
    const registered = REGISTERED_RULES.find((rule) => rule.id === 'conflicts')

    expect(registered).toBeDefined()
    expect(registered?.severity).toBe('hard')
    expect(registered?.remedy).toBe('seating')
    expect(registered?.description).toBe('Two guests recorded as in conflict must not share a table')
  })

  it('scores as hard, weight 3, when it fires', () => {
    const a = makeGuest('a', { conflictsWith: ['b'] })
    const b = makeGuest('b', { conflictsWith: ['a'] })
    const plan: RulePlan = { tables: [makeTable('round-1', 'round', 4, { 0: a, 1: b })], unseated: [] }

    const report = evaluateRegistered(plan)
    const outcome = report.outcomes.find((o) => o.ruleId === 'conflicts')

    expect(outcome?.severity).toBe('hard')
    expect(outcome?.weight).toBe(3)
  })

  it('with no conflict pairs on the guest list, the rule contributes 0 opportunities and is left out of the score', () => {
    const x = makeGuest('x')
    const y = makeGuest('y')
    const plan: RulePlan = { tables: [makeTable('round-1', 'round', 4, { 0: x, 1: y })], unseated: [] }
    const coverage = { guests: 2, seated: 2 }

    const withConflicts = evaluatePlan(plan, REGISTERED_RULES)
    const withoutConflicts = evaluatePlan(
      plan,
      REGISTERED_RULES.filter((rule) => rule.id !== 'conflicts'),
    )

    const conflictsOutcome = withConflicts.outcomes.find((o) => o.ruleId === 'conflicts')
    expect(conflictsOutcome?.opportunities).toBe(0)
    expect(scorePlan(withConflicts, coverage)).toEqual(scorePlan(withoutConflicts, coverage))
  })
})

describe('conflicts — guarding a candidate seat (G1, S4)', () => {
  it('refuses a candidate whose conflict partner already sits at that table', () => {
    const a = makeGuest('a', { conflictsWith: ['b'] })
    const b = makeGuest('b', { conflictsWith: ['a'] })
    const table = makeTable('round-1', 'round', 4, { 0: b })
    const guard = seatGuardFrom([conflictsRule])

    const allowed = guard({ plan: { tables: [table] }, tableId: 'round-1', seatIndex: 1, guest: a, guests: [a, b] })

    expect(allowed).toBe(false)
  })

  it('allows the same candidate seated at a different, uninvolved table', () => {
    const a = makeGuest('a', { conflictsWith: ['b'] })
    const b = makeGuest('b', { conflictsWith: ['a'] })
    const tableWithB = makeTable('round-1', 'round', 4, { 0: b })
    const emptyTable = makeTable('round-2', 'round', 4, {})
    const guard = seatGuardFrom([conflictsRule])

    const allowed = guard({
      plan: { tables: [tableWithB, emptyTable] },
      tableId: 'round-2',
      seatIndex: 0,
      guest: a,
      guests: [a, b],
    })

    expect(allowed).toBe(true)
  })

  it('allows an unrelated guest to join a table where a pinned conflict pair already sits together', () => {
    const a = makeGuest('a', { conflictsWith: ['b'] })
    const b = makeGuest('b', { conflictsWith: ['a'] })
    const c = makeGuest('c')
    const table = makeTable('round-1', 'round', 4, { 0: a, 1: b })
    const guard = seatGuardFrom([conflictsRule])

    const allowed = guard({ plan: { tables: [table] }, tableId: 'round-1', seatIndex: 2, guest: c, guests: [a, b, c] })

    expect(allowed).toBe(true)
  })
})
