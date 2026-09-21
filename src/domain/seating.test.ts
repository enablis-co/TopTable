import { describe, expect, it } from 'vitest'
import {
  TOP_TABLE_ID,
  adjacentSeats,
  normaliseRoom,
  roundTableId,
  seatOf,
  seatPins,
  tablesInRoom,
  topTableRoleOrder,
  topTableSeatPlacement,
} from './seating'
import type { SeatedTable, TableKind } from './seating'
import { PROTOCOL_ROLES } from './types'
import type { Guest, Pin, ProtocolRole, RoomConfig } from './types'
import { totalSeats } from './capacity'

/**
 * TT-13, "Seat the top table, then fill the room". `tablesInRoom` and `normaliseRoom` relocate
 * here from TT-11's `src/screens/plan/floorplan.ts` (renamed from `floorplanFromRoom`) with the
 * `seatPins` cases relocated from TT-12's `seatingFromPins`/`unseatedGuests`, adapted to the
 * table-and-seat model this ticket introduces.
 *
 * KB-3's three scenario rooms: small-and-cosy {4,8,8}, adding-up {9,8,6}, celebrity-scale
 * {26,8,8}. "Five tables" and "twenty-seven" both count the top table.
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

describe('tablesInRoom — table count is derived from config', () => {
  it('renders 5 slots for Small and cosy: 4 round tables + the top table', () => {
    const room: RoomConfig = { roundTables: 4, seatsEach: 8, topTableSeats: 8 }
    expect(tablesInRoom(room)).toHaveLength(5)
  })

  it('renders 27 slots for Celebrity scale: 26 round tables + the top table', () => {
    const room: RoomConfig = { roundTables: 26, seatsEach: 8, topTableSeats: 8 }
    expect(tablesInRoom(room)).toHaveLength(27)
  })

  it('renders 10 slots for Adding up: 9 round tables + the top table', () => {
    const room: RoomConfig = { roundTables: 9, seatsEach: 8, topTableSeats: 6 }
    expect(tablesInRoom(room)).toHaveLength(10)
  })
})

describe('tablesInRoom — the top table first, round tables numbered in order', () => {
  it('puts the top table first, then every round table numbered 1..N with a stable id and label', () => {
    const room: RoomConfig = { roundTables: 3, seatsEach: 8, topTableSeats: 6 }
    const slots = tablesInRoom(room)

    expect(slots).toHaveLength(4)
    const [top, r1, r2, r3] = slots
    if (!top || !r1 || !r2 || !r3) {
      throw new Error('expected 4 slots: the top table plus three round tables')
    }

    // The exact literal ids below are what keeps every pin already written to a user's
    // storage valid across this ticket (KB-1) — this is that regression check.
    expect(top).toEqual({ id: 'top', kind: 'top', number: null, label: 'Top table', capacity: 6 })
    expect(r1).toEqual({ id: 'round-1', kind: 'round', number: 1, label: 'Table 1', capacity: 8 })
    expect(r2).toEqual({ id: 'round-2', kind: 'round', number: 2, label: 'Table 2', capacity: 8 })
    expect(r3).toEqual({ id: 'round-3', kind: 'round', number: 3, label: 'Table 3', capacity: 8 })

    // Checked generically too, not just against the three hand-picked indices above.
    expect(slots.slice(1).every((slot) => slot.kind === 'round')).toBe(true)
    expect(slots.slice(1).map((slot) => slot.number)).toEqual([1, 2, 3])
  })

  it('round slots carry capacity === seatsEach; the top slot carries topTableSeats, not seatsEach', () => {
    const room: RoomConfig = { roundTables: 2, seatsEach: 5, topTableSeats: 6 }
    const slots = tablesInRoom(room)

    const top = slots.find((slot) => slot.kind === 'top')
    const roundSlots = slots.filter((slot) => slot.kind === 'round')

    expect(top?.capacity).toBe(6)
    expect(roundSlots.map((slot) => slot.capacity)).toEqual([5, 5])
  })

  it('emits the ids for a 26-round-table room exactly as "top" and "round-1".."round-26"', () => {
    const room: RoomConfig = { roundTables: 26, seatsEach: 8, topTableSeats: 8 }
    const ids = tablesInRoom(room).map((slot) => slot.id)

    expect(ids[0]).toBe('top')
    expect(ids[1]).toBe('round-1')
    expect(ids.at(-1)).toBe('round-26')
    expect(ids).toHaveLength(27)
  })
})

describe('tablesInRoom — a table type can be entirely absent', () => {
  it('topTableSeats: 0 renders no top slot, and the round tables still render', () => {
    const room: RoomConfig = { roundTables: 4, seatsEach: 8, topTableSeats: 0 }
    const slots = tablesInRoom(room)

    expect(slots).toHaveLength(4)
    expect(slots.every((slot) => slot.kind === 'round')).toBe(true)
    expect(slots.map((slot) => slot.id)).toEqual(['round-1', 'round-2', 'round-3', 'round-4'])
  })

  it('roundTables: 0 with topTableSeats: 8 renders the top table alone', () => {
    const room: RoomConfig = { roundTables: 0, seatsEach: 8, topTableSeats: 8 }
    const slots = tablesInRoom(room)

    expect(slots).toEqual([{ id: 'top', kind: 'top', number: null, label: 'Top table', capacity: 8 }])
  })

  it('a room with no round tables and no top table seats renders nothing at all', () => {
    const room: RoomConfig = { roundTables: 0, seatsEach: 8, topTableSeats: 0 }
    expect(tablesInRoom(room)).toEqual([])
  })
})

describe('tablesInRoom — degenerate config is normalised, not capped', () => {
  it.each([
    ['NaN', NaN, 0],
    ['a negative number', -5, 0],
    ['a fraction', 2.7, 2],
    ['Infinity', Infinity, 0],
  ] as const)('roundTables: %s produces %i round tables and never throws', (_label, raw, expectedCount) => {
    const room: RoomConfig = { roundTables: raw, seatsEach: 8, topTableSeats: 8 }
    const slots = tablesInRoom(room)

    const roundSlots = slots.filter((slot) => slot.kind === 'round')
    expect(roundSlots).toHaveLength(expectedCount)
    for (const slot of slots) {
      expect(Number.isInteger(slot.capacity)).toBe(true)
      expect(slot.capacity).toBeGreaterThanOrEqual(0)
      if (slot.number !== null) {
        expect(Number.isInteger(slot.number)).toBe(true)
        expect(slot.number).toBeGreaterThanOrEqual(1)
      }
    }
  })

  it.each([
    ['NaN', NaN, 0],
    ['a negative number', -3, 0],
    ['a fraction', 4.9, 4],
    ['Infinity', Infinity, 0],
  ] as const)(
    'seatsEach: %s normalises every round table capacity to %i and never throws',
    (_label, raw, expectedCapacity) => {
      const room: RoomConfig = { roundTables: 2, seatsEach: raw, topTableSeats: 8 }
      const slots = tablesInRoom(room)

      const roundSlots = slots.filter((slot) => slot.kind === 'round')
      expect(roundSlots).toHaveLength(2)
      for (const slot of roundSlots) {
        expect(slot.capacity).toBe(expectedCapacity)
      }
    },
  )

  it.each([
    ['NaN', NaN],
    ['a negative number', -2],
    ['Infinity', Infinity],
  ] as const)('topTableSeats: %s normalises to 0, so no top slot renders at all', (_label, raw) => {
    const room: RoomConfig = { roundTables: 2, seatsEach: 8, topTableSeats: raw }
    const slots = tablesInRoom(room)

    expect(slots.some((slot) => slot.kind === 'top')).toBe(false)
    expect(slots).toHaveLength(2)
  })

  it('topTableSeats: 6.9 normalises to 6 and the top slot still renders, at that capacity', () => {
    const room: RoomConfig = { roundTables: 2, seatsEach: 8, topTableSeats: 6.9 }
    const slots = tablesInRoom(room)
    const top = slots.find((slot) => slot.kind === 'top')

    expect(top).toEqual({ id: 'top', kind: 'top', number: null, label: 'Top table', capacity: 6 })
  })

  it('never throws, and never produces a negative, fractional or NaN figure, when every field is degenerate at once', () => {
    const room: RoomConfig = { roundTables: NaN, seatsEach: -8, topTableSeats: 3.9 }
    const slots = tablesInRoom(room)

    for (const slot of slots) {
      expect(Number.isFinite(slot.capacity)).toBe(true)
      expect(Number.isInteger(slot.capacity)).toBe(true)
      expect(slot.capacity).toBeGreaterThanOrEqual(0)
    }
  })
})

describe('normaliseRoom — one normalisation, shared by the gate and the generator (regression, TT-11 review)', () => {
  it("matches tablesInRoom's own table for the reviewer's exact degenerate room", () => {
    // Hand-edited storage: raw totalSeats reads -1 * 8 + 8 = 0, hiding a top table that
    // tablesInRoom already renders because it normalises internally.
    const room: RoomConfig = { roundTables: -1, seatsEach: 8, topTableSeats: 8 }
    const normalised = normaliseRoom(room)
    const slots = tablesInRoom(room)
    const [only] = slots

    if (!only) {
      throw new Error('expected exactly one slot: the top table alone')
    }

    expect(normalised).toEqual({ roundTables: 0, seatsEach: 8, topTableSeats: 8 })
    expect(slots).toHaveLength(1)
    expect(only.kind).toBe('top')
    // The figure PlanScreen's gate now computes agrees with there being a real, rendered table.
    expect(totalSeats(normalised)).toBeGreaterThan(0)
  })

  it('is idempotent: normalising an already-normalised room changes nothing', () => {
    const room: RoomConfig = { roundTables: 4, seatsEach: 8, topTableSeats: 8 }
    expect(normaliseRoom(room)).toEqual(room)
  })

  it.each([
    ['NaN', NaN],
    ['a negative number', -5],
    ['a fraction', 2.7],
    ['Infinity', Infinity],
  ] as const)('normalises %s the same way in every field, independently', (_label, raw) => {
    const room: RoomConfig = { roundTables: raw, seatsEach: raw, topTableSeats: raw }
    const normalised = normaliseRoom(room)

    expect(Number.isInteger(normalised.roundTables)).toBe(true)
    expect(Number.isInteger(normalised.seatsEach)).toBe(true)
    expect(Number.isInteger(normalised.topTableSeats)).toBe(true)
    expect(normalised.roundTables).toBeGreaterThanOrEqual(0)
    expect(normalised.seatsEach).toBeGreaterThanOrEqual(0)
    expect(normalised.topTableSeats).toBeGreaterThanOrEqual(0)
  })
})

describe('tablesInRoom — determinism', () => {
  it('returns deeply equal output for the same room, called twice', () => {
    const room: RoomConfig = { roundTables: 9, seatsEach: 8, topTableSeats: 6 }
    expect(tablesInRoom(room)).toEqual(tablesInRoom(room))
    // And for two separately-constructed but equal room objects, not just the same reference.
    expect(tablesInRoom({ ...room })).toEqual(tablesInRoom({ ...room }))
  })
})

/** Every seated guest id, seat order then overflow order — the shape `seatOf` and the fixtures below both read. */
function seatedIdsAt(tables: ReturnType<typeof seatPins>['tables'], tableId: string): (string | null)[] {
  const table = tables.find((candidate) => candidate.id === tableId)
  if (!table) return []
  return [
    ...table.seats.map((seat) => seat?.guest.id ?? null),
    ...table.overflow.map((seat) => seat.guest.id),
  ]
}

describe('seatPins — the plan a hand pin alone describes (TT-12, relocated)', () => {
  it('two pins on round-1 and one on top seat the right guests in the lowest free seats; every other slot stays empty', () => {
    const room: RoomConfig = { roundTables: 3, seatsEach: 8, topTableSeats: 6 }
    const guests = [makeGuest('g-1'), makeGuest('g-2'), makeGuest('g-3')]
    const pins: Pin[] = [
      { guestId: 'g-1', tableId: 'round-1' },
      { guestId: 'g-2', tableId: 'round-1' },
      { guestId: 'g-3', tableId: 'top' },
    ]

    const plan = seatPins(room, guests, pins)

    expect(seatedIdsAt(plan.tables, 'round-1')).toEqual(['g-1', 'g-2', null, null, null, null, null, null])
    expect(seatedIdsAt(plan.tables, 'top')).toEqual(['g-3', null, null, null, null, null])
    expect(seatedIdsAt(plan.tables, 'round-2').every((id) => id === null)).toBe(true)
    expect(seatedIdsAt(plan.tables, 'round-3').every((id) => id === null)).toBe(true)
  })

  it('every seat a pin fills reads pinned: true, and seatPins does no protocol seating or fill of its own', () => {
    const room: RoomConfig = { roundTables: 2, seatsEach: 8, topTableSeats: 6 }
    const guests = [makeGuest('g-1'), makeGuest('g-2'), makeGuest('g-3')]
    const pins: Pin[] = [
      { guestId: 'g-1', tableId: 'round-1' },
      { guestId: 'g-2', tableId: 'round-1' },
      { guestId: 'g-3', tableId: 'round-2' },
    ]

    const plan = seatPins(room, guests, pins)

    for (const table of plan.tables) {
      for (const seat of table.seats) {
        if (seat) expect(seat.pinned).toBe(true)
      }
    }
  })

  it('three pins across two tables leave exactly the other two guests unseated', () => {
    const room: RoomConfig = { roundTables: 2, seatsEach: 8, topTableSeats: 6 }
    const guests = [makeGuest('g-1'), makeGuest('g-2'), makeGuest('g-3'), makeGuest('g-4'), makeGuest('g-5')]
    const pins: Pin[] = [
      { guestId: 'g-1', tableId: 'round-1' },
      { guestId: 'g-2', tableId: 'round-1' },
      { guestId: 'g-3', tableId: 'round-2' },
    ]

    const plan = seatPins(room, guests, pins)

    expect(plan.unseated.map((guest) => guest.id)).toEqual(['g-4', 'g-5'])
  })

  it('guest order within a table follows the guest list, not the order pins were made — two pin arrays in opposite order produce deeply equal plans', () => {
    const room: RoomConfig = { roundTables: 1, seatsEach: 8, topTableSeats: 0 }
    const guests = [makeGuest('g-1'), makeGuest('g-2')]
    const pinsForward: Pin[] = [
      { guestId: 'g-1', tableId: 'round-1' },
      { guestId: 'g-2', tableId: 'round-1' },
    ]
    const pinsReversed: Pin[] = [
      { guestId: 'g-2', tableId: 'round-1' },
      { guestId: 'g-1', tableId: 'round-1' },
    ]

    const planForward = seatPins(room, guests, pinsForward)
    const planReversed = seatPins(room, guests, pinsReversed)

    expect(planReversed).toEqual(planForward)
    expect(seatedIdsAt(planReversed.tables, 'round-1').filter((id) => id !== null)).toEqual(['g-1', 'g-2'])
  })

  it('a pin naming a table not in the room is ignored: that guest is unseated, no slot gains them, and nothing throws', () => {
    const room: RoomConfig = { roundTables: 3, seatsEach: 8, topTableSeats: 6 }
    const guests = [makeGuest('g-1')]
    const pins: Pin[] = [{ guestId: 'g-1', tableId: 'round-99' }]

    expect(() => seatPins(room, guests, pins)).not.toThrow()
    const plan = seatPins(room, guests, pins)

    for (const table of plan.tables) {
      expect(table.seats.every((seat) => seat === null)).toBe(true)
      expect(table.overflow).toEqual([])
    }
    expect(plan.unseated).toEqual(guests)
  })

  it('a pin naming a guest not in the list is ignored the same way', () => {
    const room: RoomConfig = { roundTables: 1, seatsEach: 8, topTableSeats: 0 }
    const guests = [makeGuest('g-1')]
    const pins: Pin[] = [{ guestId: 'g-ghost', tableId: 'round-1' }]

    const plan = seatPins(room, guests, pins)

    expect(seatedIdsAt(plan.tables, 'round-1').every((id) => id === null)).toBe(true)
    expect(plan.unseated).toEqual(guests)
  })

  it('removing the only pin at a table returns every one of its seats to empty', () => {
    const room: RoomConfig = { roundTables: 1, seatsEach: 8, topTableSeats: 0 }
    const guests = [makeGuest('g-1')]

    const withPin = seatPins(room, guests, [{ guestId: 'g-1', tableId: 'round-1' }])
    expect(seatedIdsAt(withPin.tables, 'round-1')[0]).toBe('g-1')

    const withoutPin = seatPins(room, guests, [])
    expect(seatedIdsAt(withoutPin.tables, 'round-1').every((id) => id === null)).toBe(true)
  })

  it('nine guests pinned to an eight-seat table: eight in seats, the ninth in overflow, all nine pinned', () => {
    const room: RoomConfig = { roundTables: 1, seatsEach: 8, topTableSeats: 0 }
    const guests = Array.from({ length: 9 }, (_, i) => makeGuest(`g-${i + 1}`))
    const pins: Pin[] = guests.map((guest) => ({ guestId: guest.id, tableId: 'round-1' }))

    const plan = seatPins(room, guests, pins)
    const table = plan.tables.find((candidate) => candidate.id === 'round-1')
    if (!table) throw new Error('expected round-1 to exist')

    expect(table.seats).toHaveLength(8)
    expect(table.seats.every((seat) => seat !== null)).toBe(true)
    expect(table.overflow).toHaveLength(1)
    expect(table.overflow[0]?.guest.id).toBe('g-9')
    expect([...table.seats, ...table.overflow].every((seat) => seat?.pinned === true)).toBe(true)
    expect(plan.unseated).toEqual([])
  })

  it('seatPins does no protocol seating: a guest holding the groom role but no pin is unseated, not at the top table', () => {
    const room: RoomConfig = { roundTables: 1, seatsEach: 8, topTableSeats: 8 }
    const groom = makeGuest('groom', { role: 'groom' })

    const plan = seatPins(room, [groom], [])

    expect(plan.unseated).toEqual([groom])
    expect(seatedIdsAt(plan.tables, 'top').every((id) => id === null)).toBe(true)
  })

  it('a non-protocol guest hand-pinned to the top table IS seated there — the seam TT-14 fires a rule on', () => {
    const room: RoomConfig = { roundTables: 1, seatsEach: 8, topTableSeats: 8 }
    const guest = makeGuest('g-1')

    const plan = seatPins(room, [guest], [{ guestId: 'g-1', tableId: 'top' }])

    expect(seatedIdsAt(plan.tables, 'top')[0]).toBe('g-1')
  })

  it('with no pins at all, every guest is unseated, in guest-list order', () => {
    const room: RoomConfig = { roundTables: 1, seatsEach: 8, topTableSeats: 0 }
    const guests = [makeGuest('g-1'), makeGuest('g-2'), makeGuest('g-3')]

    expect(seatPins(room, guests, []).unseated).toEqual(guests)
  })

  it('unseated is exactly the guests with no resolvable pin, in guest-list order', () => {
    const room: RoomConfig = { roundTables: 1, seatsEach: 8, topTableSeats: 0 }
    const guests = [makeGuest('g-1'), makeGuest('g-2'), makeGuest('g-3')]
    const pins: Pin[] = [{ guestId: 'g-2', tableId: 'round-1' }]

    expect(seatPins(room, guests, pins).unseated.map((guest) => guest.id)).toEqual(['g-1', 'g-3'])
  })

  it('with every guest seated, unseated is empty', () => {
    const room: RoomConfig = { roundTables: 1, seatsEach: 8, topTableSeats: 0 }
    const guests = [makeGuest('g-1'), makeGuest('g-2')]
    const pins: Pin[] = [
      { guestId: 'g-1', tableId: 'round-1' },
      { guestId: 'g-2', tableId: 'round-1' },
    ]

    expect(seatPins(room, guests, pins).unseated).toEqual([])
  })

  it('is deterministic: the same room, guests and pins produce deeply equal plans when called twice', () => {
    const room: RoomConfig = { roundTables: 2, seatsEach: 8, topTableSeats: 6 }
    const guests = [makeGuest('g-1'), makeGuest('g-2')]
    const pins: Pin[] = [{ guestId: 'g-1', tableId: 'round-1' }]

    expect(seatPins(room, guests, pins)).toEqual(seatPins(room, guests, pins))
    expect(seatPins({ ...room }, [...guests], [...pins])).toEqual(seatPins(room, guests, pins))
  })

  it('mutates neither guests nor pins', () => {
    const room: RoomConfig = { roundTables: 1, seatsEach: 8, topTableSeats: 0 }
    const guests = [makeGuest('g-1')]
    const pins: Pin[] = [{ guestId: 'g-1', tableId: 'round-1' }]
    const guestsBefore = JSON.parse(JSON.stringify(guests)) as Guest[]
    const pinsBefore = JSON.parse(JSON.stringify(pins)) as Pin[]

    seatPins(room, guests, pins)

    expect(guests).toEqual(guestsBefore)
    expect(pins).toEqual(pinsBefore)
  })
})

/**
 * `topTableRoleOrder` and `adjacentSeats` are KB-4's placement matrix and the model's geometry.
 * Every expected role list below (other than the eight-seat and six-seat cases, each deliberately
 * a hand-written transcription of KB-4's own published table) is built from PROTOCOL_ROLES rather
 * than typed out again, so a typo in that one source would surface as a mismatched seat here
 * rather than vanishing into a silently empty one.
 */
const [CHIEF_BRIDESMAID, FATHER_OF_GROOM, MOTHER_OF_BRIDE, GROOM, BRIDE, FATHER_OF_BRIDE, MOTHER_OF_GROOM, BEST_MAN] =
  PROTOCOL_ROLES

function isSubsequenceOfProtocolRoles(roles: readonly ProtocolRole[]): boolean {
  let cursor = -1
  for (const role of roles) {
    const index = PROTOCOL_ROLES.indexOf(role, cursor + 1)
    if (index === -1) return false
    cursor = index
  }
  return true
}

describe("topTableRoleOrder — KB-4's eight roles, seat for seat", () => {
  it('matches the protocol page exactly, left to right — a literal list transcribed from KB-4, not read from PROTOCOL_ROLES', () => {
    // KB-4, "Top table protocol": the printed order the venue and the photographer both work from.
    expect(topTableRoleOrder(8)).toEqual([
      'chief bridesmaid',
      'father of the groom',
      'mother of the bride',
      'groom',
      'bride',
      'father of the bride',
      'mother of the groom',
      'best man',
    ])
  })
})

describe('topTableRoleOrder — nothing seats beyond the eighth role, however large the table (KB-4)', () => {
  it.each([9, 10, 11, 12])('size %i returns exactly the same eight roles as size 8', (n) => {
    expect(topTableRoleOrder(n)).toEqual(topTableRoleOrder(8))
    expect(topTableRoleOrder(n)).toHaveLength(8)
  })
})

describe("topTableRoleOrder — KB-4's own six-seat worked example", () => {
  it("fills the couple and both sets of parents; the two attendants are what didn't fit — a literal list transcribed from KB-4, not read from PROTOCOL_ROLES", () => {
    // KB-4: "groom and bride first, then their parents" — exactly what a top table of six holds.
    expect(topTableRoleOrder(6)).toEqual([
      'father of the groom',
      'mother of the bride',
      'groom',
      'bride',
      'father of the bride',
      'mother of the groom',
    ])
  })
})

describe('topTableRoleOrder — even sizes shrink symmetrically from the middle', () => {
  it("four seats hold the couple and the bride's parents", () => {
    expect(topTableRoleOrder(4)).toEqual([MOTHER_OF_BRIDE, GROOM, BRIDE, FATHER_OF_BRIDE])
  })

  it('two seats hold only the couple', () => {
    expect(topTableRoleOrder(2)).toEqual([GROOM, BRIDE])
  })
})

describe('topTableRoleOrder — an odd size drops the higher-numbered seat of whichever pair it lands on (TT-13)', () => {
  it('seven seats omit only the best man, and fill all seven', () => {
    expect(topTableRoleOrder(7)).toEqual([
      CHIEF_BRIDESMAID,
      FATHER_OF_GROOM,
      MOTHER_OF_BRIDE,
      GROOM,
      BRIDE,
      FATHER_OF_BRIDE,
      MOTHER_OF_GROOM,
    ])
  })

  it("five seats hold the couple, both of the bride's parents and the father of the groom — the mother of the groom is the tie-break casualty, and neither attendant is reached at all", () => {
    expect(topTableRoleOrder(5)).toEqual([FATHER_OF_GROOM, MOTHER_OF_BRIDE, GROOM, BRIDE, FATHER_OF_BRIDE])
  })

  it('three seats hold the couple and the mother of the bride', () => {
    expect(topTableRoleOrder(3)).toEqual([MOTHER_OF_BRIDE, GROOM, BRIDE])
  })

  it('one seat holds the groom, not the bride', () => {
    expect(topTableRoleOrder(1)).toEqual([GROOM])
  })
})

describe('topTableRoleOrder — the empty edge', () => {
  it('zero seats produces an empty order and does not throw', () => {
    expect(() => topTableRoleOrder(0)).not.toThrow()
    expect(topTableRoleOrder(0)).toEqual([])
  })
})

describe('topTableRoleOrder — the order is not negotiable, checked structurally across every size', () => {
  it.each(Array.from({ length: 13 }, (_, n) => n))(
    'size %i is a subsequence of PROTOCOL_ROLES and never longer than eight',
    (n) => {
      const order = topTableRoleOrder(n)
      expect(order.length).toBeLessThanOrEqual(8)
      expect(isSubsequenceOfProtocolRoles(order)).toBe(true)
    },
  )
})

/**
 * `topTableSeatPlacement` is the single definition both `allocate.ts`'s solver and the top-table
 * rule (TT-49) read for where a pinned, roleless occupant sits and where KB-4's roles land in
 * whatever seats remain. Every row below is transcribed by hand from its doc comment — the
 * reserved seats are the outermost ones, split as evenly as possible between the two ends with
 * the odd one out to the right, reported here in ascending seat order; the remaining roles come
 * from `topTableRoleOrder` for however many seats are left over, placed left to right into
 * whichever seats the reservation did not claim — not read back from the function itself, so a
 * circular fixture can't hide a placement defect from these cases.
 */
describe('topTableSeatPlacement — pinSeatIndices and roleAt, hand-pinned for every capacity 1 to 10 against 0 to 3 roleless pins', () => {
  it.each([
    // [capacity, pinnedWithoutRoleCount, pinSeatIndices, roleAt]
    [1, 0, [], [GROOM]],
    [1, 1, [0], [undefined]],
    [1, 2, [0], [undefined]],
    [1, 3, [0], [undefined]],

    [2, 0, [], [GROOM, BRIDE]],
    [2, 1, [1], [GROOM, undefined]],
    [2, 2, [0, 1], [undefined, undefined]],
    [2, 3, [0, 1], [undefined, undefined]],

    [3, 0, [], [MOTHER_OF_BRIDE, GROOM, BRIDE]],
    [3, 1, [2], [GROOM, BRIDE, undefined]],
    [3, 2, [0, 2], [undefined, GROOM, undefined]],
    [3, 3, [0, 1, 2], [undefined, undefined, undefined]],

    [4, 0, [], [MOTHER_OF_BRIDE, GROOM, BRIDE, FATHER_OF_BRIDE]],
    [4, 1, [3], [MOTHER_OF_BRIDE, GROOM, BRIDE, undefined]],
    [4, 2, [0, 3], [undefined, GROOM, BRIDE, undefined]],
    [4, 3, [0, 2, 3], [undefined, GROOM, undefined, undefined]],

    [5, 0, [], [FATHER_OF_GROOM, MOTHER_OF_BRIDE, GROOM, BRIDE, FATHER_OF_BRIDE]],
    [5, 1, [4], [MOTHER_OF_BRIDE, GROOM, BRIDE, FATHER_OF_BRIDE, undefined]],
    [5, 2, [0, 4], [undefined, MOTHER_OF_BRIDE, GROOM, BRIDE, undefined]],
    [5, 3, [0, 3, 4], [undefined, GROOM, BRIDE, undefined, undefined]],

    [6, 0, [], [FATHER_OF_GROOM, MOTHER_OF_BRIDE, GROOM, BRIDE, FATHER_OF_BRIDE, MOTHER_OF_GROOM]],
    [6, 1, [5], [FATHER_OF_GROOM, MOTHER_OF_BRIDE, GROOM, BRIDE, FATHER_OF_BRIDE, undefined]],
    [6, 2, [0, 5], [undefined, MOTHER_OF_BRIDE, GROOM, BRIDE, FATHER_OF_BRIDE, undefined]],
    [6, 3, [0, 4, 5], [undefined, MOTHER_OF_BRIDE, GROOM, BRIDE, undefined, undefined]],

    [7, 0, [], [CHIEF_BRIDESMAID, FATHER_OF_GROOM, MOTHER_OF_BRIDE, GROOM, BRIDE, FATHER_OF_BRIDE, MOTHER_OF_GROOM]],
    [7, 1, [6], [FATHER_OF_GROOM, MOTHER_OF_BRIDE, GROOM, BRIDE, FATHER_OF_BRIDE, MOTHER_OF_GROOM, undefined]],
    [7, 2, [0, 6], [undefined, FATHER_OF_GROOM, MOTHER_OF_BRIDE, GROOM, BRIDE, FATHER_OF_BRIDE, undefined]],
    [7, 3, [0, 5, 6], [undefined, MOTHER_OF_BRIDE, GROOM, BRIDE, FATHER_OF_BRIDE, undefined, undefined]],

    [
      8,
      0,
      [],
      [CHIEF_BRIDESMAID, FATHER_OF_GROOM, MOTHER_OF_BRIDE, GROOM, BRIDE, FATHER_OF_BRIDE, MOTHER_OF_GROOM, BEST_MAN],
    ],
    [
      8,
      1,
      [7],
      [CHIEF_BRIDESMAID, FATHER_OF_GROOM, MOTHER_OF_BRIDE, GROOM, BRIDE, FATHER_OF_BRIDE, MOTHER_OF_GROOM, undefined],
    ],
    [8, 2, [0, 7], [undefined, FATHER_OF_GROOM, MOTHER_OF_BRIDE, GROOM, BRIDE, FATHER_OF_BRIDE, MOTHER_OF_GROOM, undefined]],
    [8, 3, [0, 6, 7], [undefined, FATHER_OF_GROOM, MOTHER_OF_BRIDE, GROOM, BRIDE, FATHER_OF_BRIDE, undefined, undefined]],

    [
      9,
      0,
      [],
      [
        CHIEF_BRIDESMAID,
        FATHER_OF_GROOM,
        MOTHER_OF_BRIDE,
        GROOM,
        BRIDE,
        FATHER_OF_BRIDE,
        MOTHER_OF_GROOM,
        BEST_MAN,
        undefined,
      ],
    ],
    [
      9,
      1,
      [8],
      [
        CHIEF_BRIDESMAID,
        FATHER_OF_GROOM,
        MOTHER_OF_BRIDE,
        GROOM,
        BRIDE,
        FATHER_OF_BRIDE,
        MOTHER_OF_GROOM,
        BEST_MAN,
        undefined,
      ],
    ],
    [
      9,
      2,
      [0, 8],
      [undefined, CHIEF_BRIDESMAID, FATHER_OF_GROOM, MOTHER_OF_BRIDE, GROOM, BRIDE, FATHER_OF_BRIDE, MOTHER_OF_GROOM, undefined],
    ],
    [
      9,
      3,
      [0, 7, 8],
      [undefined, FATHER_OF_GROOM, MOTHER_OF_BRIDE, GROOM, BRIDE, FATHER_OF_BRIDE, MOTHER_OF_GROOM, undefined, undefined],
    ],

    [
      10,
      0,
      [],
      [
        CHIEF_BRIDESMAID,
        FATHER_OF_GROOM,
        MOTHER_OF_BRIDE,
        GROOM,
        BRIDE,
        FATHER_OF_BRIDE,
        MOTHER_OF_GROOM,
        BEST_MAN,
        undefined,
        undefined,
      ],
    ],
    [
      10,
      1,
      [9],
      [
        CHIEF_BRIDESMAID,
        FATHER_OF_GROOM,
        MOTHER_OF_BRIDE,
        GROOM,
        BRIDE,
        FATHER_OF_BRIDE,
        MOTHER_OF_GROOM,
        BEST_MAN,
        undefined,
        undefined,
      ],
    ],
    [
      10,
      2,
      [0, 9],
      [
        undefined,
        CHIEF_BRIDESMAID,
        FATHER_OF_GROOM,
        MOTHER_OF_BRIDE,
        GROOM,
        BRIDE,
        FATHER_OF_BRIDE,
        MOTHER_OF_GROOM,
        BEST_MAN,
        undefined,
      ],
    ],
    [
      10,
      3,
      [0, 8, 9],
      [
        undefined,
        CHIEF_BRIDESMAID,
        FATHER_OF_GROOM,
        MOTHER_OF_BRIDE,
        GROOM,
        BRIDE,
        FATHER_OF_BRIDE,
        MOTHER_OF_GROOM,
        undefined,
        undefined,
      ],
    ],
  ] as const)('capacity %i, %i roleless pins', (capacity, pinnedWithoutRoleCount, pinSeatIndices, roleAt) => {
    expect(topTableSeatPlacement(capacity, pinnedWithoutRoleCount)).toEqual({ pinSeatIndices, roleAt })
  })

  it('pinnedWithoutRoleCount exceeding capacity still returns exactly capacity roleAt entries, and pinSeatIndices no longer than capacity', () => {
    const placement = topTableSeatPlacement(3, 9)

    expect(placement.roleAt).toHaveLength(3)
    expect(placement.pinSeatIndices.length).toBeLessThanOrEqual(3)
  })

  it('is deterministic: the same capacity and count produce a deeply equal result twice', () => {
    expect(topTableSeatPlacement(8, 2)).toEqual(topTableSeatPlacement(8, 2))
  })
})

/** A minimal table fixture for adjacentSeats — only kind and capacity affect its geometry. */
function makeSeatedTable(kind: TableKind, capacity: number): SeatedTable {
  return {
    id: kind === 'top' ? TOP_TABLE_ID : roundTableId(1),
    kind,
    number: kind === 'top' ? null : 1,
    label: kind === 'top' ? 'Top table' : 'Table 1',
    capacity,
    seats: Array.from({ length: capacity }, () => null),
    overflow: [],
  }
}

describe('adjacentSeats — a round table is a ring', () => {
  it('an eight-seat ring: every seat has the seat before and the seat after it as neighbours, wrapping round', () => {
    const table = makeSeatedTable('round', 8)
    expect(adjacentSeats(table, 0)).toEqual([1, 7])
    expect(adjacentSeats(table, 7)).toEqual([0, 6])
    expect(adjacentSeats(table, 3)).toEqual([2, 4])
  })

  it('a ring of two reports its one neighbour once, not twice', () => {
    expect(adjacentSeats(makeSeatedTable('round', 2), 0)).toEqual([1])
  })

  it('a ring of one has no neighbour to report', () => {
    expect(adjacentSeats(makeSeatedTable('round', 1), 0)).toEqual([])
  })

  it('a table with no seats reports no neighbours and does not throw', () => {
    expect(() => adjacentSeats(makeSeatedTable('round', 0), 0)).not.toThrow()
    expect(adjacentSeats(makeSeatedTable('round', 0), 0)).toEqual([])
  })
})

describe('adjacentSeats — the top table is a line', () => {
  it('an eight-seat line: seat 0 and seat 7 are the two ends, and are not adjacent to one another', () => {
    const table = makeSeatedTable('top', 8)
    expect(adjacentSeats(table, 0)).toEqual([1])
    expect(adjacentSeats(table, 7)).toEqual([6])
    expect(adjacentSeats(table, 3)).toEqual([2, 4])

    expect(adjacentSeats(table, 0)).not.toContain(7)
    expect(adjacentSeats(table, 7)).not.toContain(0)
  })

  it('a line of one has no neighbour to report', () => {
    expect(adjacentSeats(makeSeatedTable('top', 1), 0)).toEqual([])
  })

  it('a table with no seats reports no neighbours and does not throw', () => {
    expect(() => adjacentSeats(makeSeatedTable('top', 0), 0)).not.toThrow()
    expect(adjacentSeats(makeSeatedTable('top', 0), 0)).toEqual([])
  })
})

describe('adjacentSeats — out-of-range seats agree for both kinds of table', () => {
  it.each([
    ['round', -1],
    ['round', 8],
    ['top', -1],
    ['top', 8],
  ] as const)('%s table, seat index %i: no neighbours, no throw', (kind, seatIndex) => {
    const table = makeSeatedTable(kind, 8)
    expect(() => adjacentSeats(table, seatIndex)).not.toThrow()
    expect(adjacentSeats(table, seatIndex)).toEqual([])
  })
})

describe('seatOf — locating a guest within a plan', () => {
  it('returns the table and the 0-based seat index for a seated guest', () => {
    const room: RoomConfig = { roundTables: 1, seatsEach: 8, topTableSeats: 0 }
    const guests = [makeGuest('g-1'), makeGuest('g-2')]
    const pins: Pin[] = [{ guestId: 'g-2', tableId: 'round-1' }]

    const location = seatOf(seatPins(room, guests, pins), 'g-2')

    if (!location) throw new Error('expected g-2 to be seated')
    expect(location.table.id).toBe('round-1')
    expect(location.seatIndex).toBe(0)
  })

  it('returns seatIndex: null for a guest held in overflow', () => {
    const room: RoomConfig = { roundTables: 1, seatsEach: 1, topTableSeats: 0 }
    const guests = [makeGuest('g-1'), makeGuest('g-2')]
    const pins: Pin[] = [
      { guestId: 'g-1', tableId: 'round-1' },
      { guestId: 'g-2', tableId: 'round-1' },
    ]

    const location = seatOf(seatPins(room, guests, pins), 'g-2')

    if (!location) throw new Error('expected g-2 to be recorded, in overflow')
    expect(location.table.id).toBe('round-1')
    expect(location.seatIndex).toBeNull()
  })

  it('returns null for an unseated guest', () => {
    const room: RoomConfig = { roundTables: 1, seatsEach: 1, topTableSeats: 0 }
    const plan = seatPins(room, [makeGuest('g-1'), makeGuest('g-2')], [])

    expect(seatOf(plan, 'g-2')).toBeNull()
  })

  it('returns null for a guest id the plan has never heard of', () => {
    const plan = seatPins({ roundTables: 1, seatsEach: 1, topTableSeats: 0 }, [makeGuest('g-1')], [])

    expect(seatOf(plan, 'g-ghost')).toBeNull()
  })
})

describe('every table exposes exactly one seat entry per unit of capacity', () => {
  it("Small and cosy's room: every table's seats length equals its capacity", () => {
    const room: RoomConfig = { roundTables: 4, seatsEach: 8, topTableSeats: 8 }
    const plan = seatPins(room, [], [])

    expect(plan.tables.length).toBeGreaterThan(0)
    for (const table of plan.tables) {
      expect(table.seats).toHaveLength(table.capacity)
    }
  })

  it("Adding up's room: every table's seats length equals its capacity", () => {
    const room: RoomConfig = { roundTables: 9, seatsEach: 8, topTableSeats: 6 }
    const plan = seatPins(room, [], [])

    for (const table of plan.tables) {
      expect(table.seats).toHaveLength(table.capacity)
    }
  })

  it("Celebrity scale's room: every table's seats length equals its capacity", () => {
    const room: RoomConfig = { roundTables: 26, seatsEach: 8, topTableSeats: 8 }
    const plan = seatPins(room, [], [])

    for (const table of plan.tables) {
      expect(table.seats).toHaveLength(table.capacity)
    }
  })

  it('a round table normalised to zero capacity still exposes a seats array of length zero', () => {
    const room: RoomConfig = { roundTables: 2, seatsEach: 0, topTableSeats: 0 }
    const plan = seatPins(room, [], [])

    expect(plan.tables).toHaveLength(2)
    for (const table of plan.tables) {
      expect(table.capacity).toBe(0)
      expect(table.seats).toEqual([])
    }
  })
})
