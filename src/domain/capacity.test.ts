import { describe, expect, it } from 'vitest'
import { capacityFor, suggestExactRoom, totalSeats } from './capacity'
import type { RoomSuggestion } from './capacity'
import type { RoomConfig } from './types'

/**
 * TT-3, "Set up the room". Written from the acceptance criteria, KB-3 (the room's three
 * numbers and the three scenario rooms) and KB-6 ("Screens"). This file does not open
 * src/domain/capacity.ts: it is written against the plan's declared signatures only.
 */

describe('totalSeats', () => {
  it('computes roundTables × seatsEach + topTableSeats for each KB-3 room (A2)', () => {
    expect(totalSeats({ roundTables: 4, seatsEach: 8, topTableSeats: 8 })).toBe(40) // Small and cosy
    expect(totalSeats({ roundTables: 9, seatsEach: 8, topTableSeats: 6 })).toBe(78) // Adding up
    expect(totalSeats({ roundTables: 26, seatsEach: 8, topTableSeats: 8 })).toBe(216) // Celebrity scale
  })
})

describe('capacityFor', () => {
  it('is exact with zero spare and zero shortfall when seats equal guests exactly (A4)', () => {
    const room: RoomConfig = { roundTables: 4, seatsEach: 8, topTableSeats: 8 }
    expect(capacityFor(room, 40)).toEqual({
      totalSeats: 40,
      guestCount: 40,
      state: 'exact',
      spare: 0,
      shortfall: 0,
    })
  })

  it('is slack when seats exceed guests, for both Adding up and Celebrity scale (A4)', () => {
    const addingUp: RoomConfig = { roundTables: 9, seatsEach: 8, topTableSeats: 6 }
    expect(capacityFor(addingUp, 70)).toEqual({
      totalSeats: 78,
      guestCount: 70,
      state: 'slack',
      spare: 8,
      shortfall: 0,
    })

    const celebrityScale: RoomConfig = { roundTables: 26, seatsEach: 8, topTableSeats: 8 }
    expect(capacityFor(celebrityScale, 200)).toEqual({
      totalSeats: 216,
      guestCount: 200,
      state: 'slack',
      spare: 16,
      shortfall: 0,
    })
  })

  it('is short when guests exceed seats (A4)', () => {
    // 8 × 8 + 6 = 70 seats, 78 guests: the same two figures as the slack case above, inverted.
    const room: RoomConfig = { roundTables: 8, seatsEach: 8, topTableSeats: 6 }
    expect(capacityFor(room, 78)).toEqual({
      totalSeats: 70,
      guestCount: 78,
      state: 'short',
      spare: 0,
      shortfall: 8,
    })
  })

  it('is honestly short, not an error, for a zeroed room with guests waiting (A4, A5)', () => {
    const zeroed: RoomConfig = { roundTables: 0, seatsEach: 0, topTableSeats: 0 }
    expect(capacityFor(zeroed, 70)).toEqual({
      totalSeats: 0,
      guestCount: 70,
      state: 'short',
      spare: 0,
      shortfall: 70,
    })
  })

  it('is exact for a zeroed room with no guests, even though the screen never renders this state (A4)', () => {
    // Asserted deliberately: 0 seats for 0 guests is arithmetically exact. The setup screen
    // hides the readout whenever there are no guests (A7, A12), but that is a UI decision —
    // nobody should later "fix" the domain into special-casing this away.
    const zeroed: RoomConfig = { roundTables: 0, seatsEach: 0, topTableSeats: 0 }
    expect(capacityFor(zeroed, 0)).toEqual({
      totalSeats: 0,
      guestCount: 0,
      state: 'exact',
      spare: 0,
      shortfall: 0,
    })
  })

  it('is pure: two calls with the same input are equal, and the room argument is not mutated', () => {
    const room: RoomConfig = { roundTables: 9, seatsEach: 8, topTableSeats: 6 }
    const snapshot = { ...room }

    const first = capacityFor(room, 70)
    const second = capacityFor(room, 70)

    expect(second).toEqual(first)
    expect(room).toEqual(snapshot)
  })
})

describe('suggestExactRoom', () => {
  type SuggestCase = {
    name: string
    room: RoomConfig
    guests: number
    expected: RoomSuggestion | null
  }

  const cases: SuggestCase[] = [
    {
      name: "D1: KB-6's worked example, 9 × 8 + 6 for 70 guests suggests dropping to 8 tables",
      room: { roundTables: 9, seatsEach: 8, topTableSeats: 6 },
      guests: 70,
      expected: { roundTables: 8, totalSeats: 70, direction: 'fewer' },
    },
    {
      name: 'D2: celebrity scale, slack, 26 × 8 + 8 for 200 guests suggests dropping to 24 tables',
      room: { roundTables: 26, seatsEach: 8, topTableSeats: 8 },
      guests: 200,
      expected: { roundTables: 24, totalSeats: 200, direction: 'fewer' },
    },
    {
      name: 'D3: already exact, 4 × 8 + 8 for 40 guests suggests nothing',
      room: { roundTables: 4, seatsEach: 8, topTableSeats: 8 },
      guests: 40,
      expected: null,
    },
    {
      name: 'D4: short with an exact landing above, 8 × 8 + 6 for 86 guests suggests going up to 10 tables',
      room: { roundTables: 8, seatsEach: 8, topTableSeats: 6 },
      guests: 86,
      expected: { roundTables: 10, totalSeats: 86, direction: 'more' },
    },
    {
      name: 'D5: slack with no exact landing, 9 × 8 + 6 for 69 guests suggests nothing',
      room: { roundTables: 9, seatsEach: 8, topTableSeats: 6 },
      guests: 69,
      expected: null,
    },
    {
      name: 'D6: short with no exact landing, 9 × 8 + 6 for 80 guests suggests nothing',
      room: { roundTables: 9, seatsEach: 8, topTableSeats: 6 },
      guests: 80,
      expected: null,
    },
    {
      name: 'D7: a suggestion of one table, 4 × 8 + 6 for 14 guests suggests dropping to 1 table',
      room: { roundTables: 4, seatsEach: 8, topTableSeats: 6 },
      guests: 14,
      expected: { roundTables: 1, totalSeats: 14, direction: 'fewer' },
    },
    {
      name: 'D8: the top table alone would fit exactly, 9 × 8 + 6 for 6 guests never suggests 0 tables',
      room: { roundTables: 9, seatsEach: 8, topTableSeats: 6 },
      guests: 6,
      expected: null,
    },
    {
      name: 'D9: the top table alone exceeds the guests, 9 × 8 + 10 for 6 guests suggests nothing',
      room: { roundTables: 9, seatsEach: 8, topTableSeats: 10 },
      guests: 6,
      expected: null,
    },
    {
      name: 'D10: seats-each is zero, 9 × 0 + 6 for 70 guests suggests nothing (no divide-by-zero)',
      room: { roundTables: 9, seatsEach: 0, topTableSeats: 6 },
      guests: 70,
      expected: null,
    },
    {
      name: 'D11: the whole room is zeroed, 0 × 0 + 0 for 70 guests suggests nothing',
      room: { roundTables: 0, seatsEach: 0, topTableSeats: 0 },
      guests: 70,
      expected: null,
    },
    {
      name: 'D12: no round tables configured yet, 0 × 8 + 6 for 70 guests suggests going up to 8 tables',
      room: { roundTables: 0, seatsEach: 8, topTableSeats: 6 },
      guests: 70,
      expected: { roundTables: 8, totalSeats: 70, direction: 'more' },
    },
    {
      name: 'D13: no guests, 9 × 8 + 6 for 0 guests suggests nothing',
      room: { roundTables: 9, seatsEach: 8, topTableSeats: 6 },
      guests: 0,
      expected: null,
    },
    {
      name: 'D14: no top table, 9 × 8 + 0 for 40 guests suggests dropping to 5 tables',
      room: { roundTables: 9, seatsEach: 8, topTableSeats: 0 },
      guests: 40,
      expected: { roundTables: 5, totalSeats: 40, direction: 'fewer' },
    },
    {
      name: 'D15: non-integer seats-each, 9 × 8.5 + 6 for 70 guests suggests nothing, and does not throw',
      room: { roundTables: 9, seatsEach: 8.5, topTableSeats: 6 },
      guests: 70,
      expected: null,
    },
    {
      name: 'D16: a negative guest count, 9 × 8 + 6 for -5 guests suggests nothing, and does not throw',
      room: { roundTables: 9, seatsEach: 8, topTableSeats: 6 },
      guests: -5,
      expected: null,
    },
    {
      name: 'D17: NaN in the room, 9 × NaN + 6 for 70 guests suggests nothing, and does not throw',
      room: { roundTables: 9, seatsEach: NaN, topTableSeats: 6 },
      guests: 70,
      expected: null,
    },
  ]

  it.each(cases)('$name', ({ room, guests, expected }) => {
    expect(() => suggestExactRoom(room, guests)).not.toThrow()
    expect(suggestExactRoom(room, guests)).toEqual(expected)
  })

  it('D18: is pure — two calls deep-equal and the room argument is not mutated', () => {
    const room: RoomConfig = { roundTables: 9, seatsEach: 8, topTableSeats: 6 }
    const snapshot = { ...room }

    const first = suggestExactRoom(room, 70)
    const second = suggestExactRoom(room, 70)

    expect(first).toEqual({ roundTables: 8, totalSeats: 70, direction: 'fewer' })
    expect(second).toEqual(first)
    expect(room).toEqual(snapshot)
  })
})
