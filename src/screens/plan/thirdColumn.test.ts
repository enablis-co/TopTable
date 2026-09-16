import { describe, expect, it } from 'vitest'
import { VIOLATIONS, selectedTableId, toggleStat, toggleTable } from './thirdColumn'
import type { ThirdColumn } from './thirdColumn'

/**
 * TT-16 part two. The third column's four states, modelled as one discriminated union so
 * mutual exclusion is enforced by the type rather than by two booleans a render branch has to
 * keep in step (AC-C1, AC-C2). Written from section 9's acceptance criteria and section 10's
 * documented shape, against the exported type and function signatures only. Does not open
 * thirdColumn.ts.
 */

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

const TABLE_A: ThirdColumn = { kind: 'table', tableId: 'table-a' }
const TABLE_B: ThirdColumn = { kind: 'table', tableId: 'table-b' }
const BREAKDOWN: ThirdColumn = { kind: 'breakdown' }
const PINNED: ThirdColumn = { kind: 'pinned' }

const ALL_STATES: readonly { name: string; column: ThirdColumn }[] = [
  { name: 'violations', column: VIOLATIONS },
  { name: 'a table', column: TABLE_A },
  { name: 'breakdown', column: BREAKDOWN },
  { name: 'pinned', column: PINNED },
]

describe('toggleTable — selecting the same table again returns to violations, any other table replaces the column', () => {
  const notAlreadyTableA = ALL_STATES.filter(({ column }) => !(column.kind === 'table' && column.tableId === 'table-a'))

  it.each(notAlreadyTableA)('from $name, toggling table-a shows table-a', ({ column }) => {
    expect(toggleTable(deepFreeze({ ...column }), 'table-a')).toEqual(TABLE_A)
  })

  it('toggling the same table id that is already showing closes it back to violations', () => {
    expect(toggleTable(deepFreeze({ ...TABLE_A }), 'table-a')).toEqual(VIOLATIONS)
  })

  it('toggling a different table id while a table is showing replaces it, not dismisses it', () => {
    expect(toggleTable(deepFreeze({ ...TABLE_A }), 'table-b')).toEqual(TABLE_B)
  })

  it.each(ALL_STATES)('from $name, no property of the argument is mutated', ({ column }) => {
    const frozen = deepFreeze({ ...column })
    expect(() => toggleTable(frozen, 'table-a')).not.toThrow()
    expect(() => toggleTable(frozen, 'table-b')).not.toThrow()
  })
})

describe('toggleStat — opening a stat panel toggles its own kind and replaces whatever else was open', () => {
  it.each(ALL_STATES)('from $name, toggling "breakdown" shows the breakdown', ({ column }) => {
    if (column.kind === 'breakdown') return // covered by the close case below
    expect(toggleStat(deepFreeze({ ...column }), 'breakdown')).toEqual(BREAKDOWN)
  })

  it.each(ALL_STATES)('from $name, toggling "pinned" shows the pinned panel', ({ column }) => {
    if (column.kind === 'pinned') return // covered by the close case below
    expect(toggleStat(deepFreeze({ ...column }), 'pinned')).toEqual(PINNED)
  })

  it('toggling "breakdown" while the breakdown is already open closes it to violations', () => {
    expect(toggleStat(deepFreeze({ ...BREAKDOWN }), 'breakdown')).toEqual(VIOLATIONS)
  })

  it('toggling "pinned" while the pinned panel is already open closes it to violations', () => {
    expect(toggleStat(deepFreeze({ ...PINNED }), 'pinned')).toEqual(VIOLATIONS)
  })

  it('toggling "pinned" while the breakdown is open replaces it, and vice versa', () => {
    expect(toggleStat(deepFreeze({ ...BREAKDOWN }), 'pinned')).toEqual(PINNED)
    expect(toggleStat(deepFreeze({ ...PINNED }), 'breakdown')).toEqual(BREAKDOWN)
  })

  it.each(ALL_STATES)('from $name, no property of the argument is mutated', ({ column }) => {
    const frozen = deepFreeze({ ...column })
    expect(() => toggleStat(frozen, 'breakdown')).not.toThrow()
    expect(() => toggleStat(frozen, 'pinned')).not.toThrow()
  })
})

describe('selectedTableId — the table id only for a table column, null for every other state', () => {
  it('returns the table id for a table column', () => {
    expect(selectedTableId(TABLE_A)).toBe('table-a')
    expect(selectedTableId(TABLE_B)).toBe('table-b')
  })

  it.each([
    ['violations', VIOLATIONS],
    ['breakdown', BREAKDOWN],
    ['pinned', PINNED],
  ] as const)('returns null for %s', (_name, column) => {
    expect(selectedTableId(column)).toBeNull()
  })
})

describe('every value produced by these functions has exactly one kind, and only a table column carries a tableId', () => {
  it('every transition from every starting state, over both target kinds and both table ids, satisfies the shape', () => {
    const results: ThirdColumn[] = []
    for (const { column } of ALL_STATES) {
      results.push(toggleTable(deepFreeze({ ...column }), 'table-a'))
      results.push(toggleTable(deepFreeze({ ...column }), 'table-b'))
      results.push(toggleStat(deepFreeze({ ...column }), 'breakdown'))
      results.push(toggleStat(deepFreeze({ ...column }), 'pinned'))
    }

    for (const result of results) {
      const keys = Object.keys(result).sort()
      if (result.kind === 'table') {
        expect(keys).toEqual(['kind', 'tableId'].sort())
        expect(typeof result.tableId).toBe('string')
      } else {
        expect(keys).toEqual(['kind'])
      }
      expect(['violations', 'table', 'breakdown', 'pinned']).toContain(result.kind)
    }
  })
})
