import { describe, expect, it } from 'vitest'
import { SCENARIOS } from '../../domain/scenarios'
import { MIN_TOP_TABLE_SEATS, hasTypedRoom, isTopTableIncomplete } from './roomCompleteness'

/**
 * Fix to TT-3: a product-owner ruling that a top table is always required, at a minimum of 2
 * seats — validated on the room's three fields, never clamped. Written from that ruling and
 * from KB-6's first-visit wireframe (the blank {0,0,0} room), not from roomCompleteness.ts.
 */

describe('hasTypedRoom', () => {
  it('is false for the all-zero first-visit room', () => {
    expect(hasTypedRoom({ roundTables: 0, seatsEach: 0, topTableSeats: 0 })).toBe(false)
  })

  it('is true once round tables alone has been typed', () => {
    expect(hasTypedRoom({ roundTables: 9, seatsEach: 0, topTableSeats: 0 })).toBe(true)
  })

  it('is true once seats each alone has been typed', () => {
    expect(hasTypedRoom({ roundTables: 0, seatsEach: 8, topTableSeats: 0 })).toBe(true)
  })

  it('is true once the top table alone has been typed', () => {
    expect(hasTypedRoom({ roundTables: 0, seatsEach: 0, topTableSeats: 1 })).toBe(true)
  })
})

describe('isTopTableIncomplete', () => {
  it('is false for the all-zero first-visit room — empty, not incomplete', () => {
    expect(isTopTableIncomplete({ roundTables: 0, seatsEach: 0, topTableSeats: 0 })).toBe(false)
  })

  it('is true for a room with round tables and seats configured but no top table', () => {
    expect(isTopTableIncomplete({ roundTables: 9, seatsEach: 8, topTableSeats: 0 })).toBe(true)
  })

  it('is true at exactly one top table seat — 1 is invalid as well as 0', () => {
    expect(isTopTableIncomplete({ roundTables: 9, seatsEach: 8, topTableSeats: 1 })).toBe(true)
  })

  it('is false once the top table reaches the minimum of 2', () => {
    expect(isTopTableIncomplete({ roundTables: 9, seatsEach: 8, topTableSeats: 2 })).toBe(false)
  })

  it('is true for a top-table-only room below the minimum, with round tables still at zero', () => {
    expect(isTopTableIncomplete({ roundTables: 0, seatsEach: 0, topTableSeats: 1 })).toBe(true)
  })

  it('is false for a top-table-only room at the minimum, with round tables still at zero', () => {
    expect(isTopTableIncomplete({ roundTables: 0, seatsEach: 0, topTableSeats: 2 })).toBe(false)
  })

  it('exposes 2 as the minimum', () => {
    expect(MIN_TOP_TABLE_SEATS).toBe(2)
  })

  it('never flags any of the three shipped scenarios (8, 6 and 8 top-table seats)', () => {
    for (const scenario of SCENARIOS) {
      expect(isTopTableIncomplete(scenario.room)).toBe(false)
    }
  })
})
