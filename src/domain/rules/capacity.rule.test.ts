import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { rule as capacityRule } from './capacity.rule'
import { allocate } from '../allocate'
import type { Seat, SeatedTable } from '../seating'
import type { Guest, RoomConfig } from '../types'
import type { ScenarioId } from '../scenarios'

/**
 * TT-14's capacity rule (KB-2: "A table must not be seated above its capacity"). Hard, and
 * remedy "seating" — capacity is the rule the guard exists to enforce. Written from TT-14's
 * acceptance criteria and KB-2. Does not open capacity.rule.ts.
 *
 * TT-16: `evaluate` now returns `{ findings, opportunities, missed }` rather than a bare array.
 * `opportunities` is declared as every table judged — capacity is hard, so it never scores, but
 * the count is still asserted honestly since `findings.length <= missed <= opportunities` must
 * hold for every registered rule (registry.test.ts guards this across the registry).
 */

function makeGuest(id: string): Guest {
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
  }
}

function seatOccupant(guest: Guest): Seat {
  return { guest, pinned: false }
}

function makeTable(config: {
  id: string
  kind: 'round' | 'top'
  capacity: number
  seatedCount: number
  overflowCount?: number
}): SeatedTable {
  const { id, kind, capacity, seatedCount, overflowCount = 0 } = config
  return {
    id,
    kind,
    number: kind === 'round' ? 1 : null,
    label: kind === 'top' ? 'Top table' : 'Table 1',
    capacity,
    seats: Array.from({ length: capacity }, (_, i) =>
      i < seatedCount ? seatOccupant(makeGuest(`${id}-seat-${i}`)) : null,
    ),
    overflow: Array.from({ length: overflowCount }, (_, i) => seatOccupant(makeGuest(`${id}-overflow-${i}`))),
  }
}

describe('capacity — fires when a table holds more guests than it has seats (KB-2, TT-14)', () => {
  it('one guest in overflow at an otherwise full table is a violation naming that table and that guest', () => {
    const table = makeTable({ id: 'round-1', kind: 'round', capacity: 8, seatedCount: 8, overflowCount: 1 })

    const { findings } = capacityRule.evaluate({ tables: [table] })

    expect(findings).toHaveLength(1)
    expect(findings[0]?.tableIds).toEqual(['round-1'])
    expect(findings[0]?.guestIds).toEqual(['round-1-overflow-0'])
    expect(findings[0]?.message.length).toBeGreaterThan(0)
  })

  it('the detail names both figures — occupants and capacity — for nine seated at an eight-seat table', () => {
    const table = makeTable({ id: 'round-1', kind: 'round', capacity: 8, seatedCount: 8, overflowCount: 1 })

    const { findings } = capacityRule.evaluate({ tables: [table] })
    const [finding] = findings

    expect(finding?.detail).toContain('9')
    expect(finding?.detail).toContain('8')
  })

  it('every overflow guest is named, not only the first, when more than one guest overflows', () => {
    const table = makeTable({ id: 'round-1', kind: 'round', capacity: 4, seatedCount: 4, overflowCount: 2 })

    const { findings } = capacityRule.evaluate({ tables: [table] })
    const [finding] = findings

    expect([...(finding?.guestIds ?? [])].sort()).toEqual(['round-1-overflow-0', 'round-1-overflow-1'])
  })

  it('fires for an over-capacity top table exactly as it would for a round one', () => {
    const table = makeTable({ id: 'top', kind: 'top', capacity: 8, seatedCount: 8, overflowCount: 1 })

    const { findings } = capacityRule.evaluate({ tables: [table] })

    expect(findings).toHaveLength(1)
    expect(findings[0]?.tableIds).toEqual(['top'])
  })
})

describe('capacity — stays quiet on a table that is not over its capacity (KB-2, TT-14)', () => {
  it('a table seated exactly to capacity, with no spare seat, is not a violation', () => {
    const table = makeTable({ id: 'round-1', kind: 'round', capacity: 8, seatedCount: 8 })

    expect(capacityRule.evaluate({ tables: [table] }).findings).toEqual([])
  })

  it('a table seated below capacity is not a violation', () => {
    const table = makeTable({ id: 'round-1', kind: 'round', capacity: 8, seatedCount: 5 })

    expect(capacityRule.evaluate({ tables: [table] }).findings).toEqual([])
  })

  it('an empty table is not a violation', () => {
    const table = makeTable({ id: 'round-1', kind: 'round', capacity: 8, seatedCount: 0 })

    expect(capacityRule.evaluate({ tables: [table] }).findings).toEqual([])
  })

  it('a plan with no tables at all is quiet and does not throw', () => {
    expect(() => capacityRule.evaluate({ tables: [] })).not.toThrow()
    expect(capacityRule.evaluate({ tables: [] }).findings).toEqual([])
  })
})

describe('capacity — opportunities is every table judged, hard and never scoring but honestly declared (TT-16)', () => {
  it('one table judged, whether or not it violates, reports one opportunity', () => {
    const overCapacity = makeTable({ id: 'round-1', kind: 'round', capacity: 4, seatedCount: 4, overflowCount: 1 })
    const withinCapacity = makeTable({ id: 'round-2', kind: 'round', capacity: 4, seatedCount: 2 })

    expect(capacityRule.evaluate({ tables: [overCapacity] }).opportunities).toBe(1)
    expect(capacityRule.evaluate({ tables: [withinCapacity] }).opportunities).toBe(1)
  })

  it('several tables judged in one pass report one opportunity per table', () => {
    const tables = [
      makeTable({ id: 'round-1', kind: 'round', capacity: 4, seatedCount: 4 }),
      makeTable({ id: 'round-2', kind: 'round', capacity: 4, seatedCount: 4, overflowCount: 2 }),
      makeTable({ id: 'top', kind: 'top', capacity: 8, seatedCount: 8 }),
    ]

    expect(capacityRule.evaluate({ tables }).opportunities).toBe(3)
  })

  it('an empty room reports 0 opportunities and no findings', () => {
    const { findings, opportunities } = capacityRule.evaluate({ tables: [] })

    expect(opportunities).toBe(0)
    expect(findings).toEqual([])
  })
})

const DIR = dirname(fileURLToPath(import.meta.url))

type ScenarioFixture = { meta: { tables: RoomConfig }; guests: Guest[] }

function readScenario(id: ScenarioId): ScenarioFixture {
  const path = join(DIR, '../../../public/scenarios', `${id}.json`)
  return JSON.parse(readFileSync(path, 'utf8')) as ScenarioFixture
}

describe('capacity — "Small and cosy" seats exactly to capacity everywhere, and that alone is not a violation (KB-3)', () => {
  it('40 guests into 40 seats with no spare produces no capacity violations at all', () => {
    const { meta, guests } = readScenario('small-and-cosy')
    const plan = allocate(meta.tables, guests, [])

    expect(capacityRule.evaluate({ tables: plan.tables }).findings).toEqual([])
  })
})
