import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { allocate } from './allocate'
import type { SeatCandidate, SeatGuard } from './allocate'
import { seatOf, tablesInRoom } from './seating'
import { PROTOCOL_ROLES } from './types'
import type { Guest, Pin, RoomConfig } from './types'
import { totalSeats } from './capacity'
import type { ScenarioId } from './scenarios'

/**
 * TT-13's solver. This file proves the contract `allocate` documents on itself — its default
 * guard, its purity, its determinism — as a base for `tester` to extend with KB-4's placement
 * scenarios from the acceptance criteria, written against these exports rather than against how
 * the four phases happen to be built.
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

describe('allocate — the shape of a plan', () => {
  it('produces one table per slot tablesInRoom would generate for the same room, in the same order', () => {
    const room: RoomConfig = { roundTables: 2, seatsEach: 4, topTableSeats: 4 }
    const guests = [makeGuest('g-1'), makeGuest('g-2')]

    const plan = allocate(room, guests, [])

    expect(plan.tables.map((table) => table.id)).toEqual(tablesInRoom(room).map((slot) => slot.id))
  })

  it("each table's seats array is exactly as long as its capacity", () => {
    const room: RoomConfig = { roundTables: 3, seatsEach: 5, topTableSeats: 6 }
    const plan = allocate(room, [], [])

    for (const table of plan.tables) {
      expect(table.seats).toHaveLength(table.capacity)
    }
  })

  it('an empty room seats nobody and produces no tables', () => {
    const room: RoomConfig = { roundTables: 0, seatsEach: 8, topTableSeats: 0 }
    const guests = [makeGuest('g-1')]

    const plan = allocate(room, guests, [])

    expect(plan.tables).toEqual([])
    expect(plan.unseated).toEqual(guests)
  })
})

describe('allocate — the default guard allows every seat', () => {
  it('with no options, behaves exactly as AllocateOptions documents: nothing is refused by the fill', () => {
    const room: RoomConfig = { roundTables: 1, seatsEach: 2, topTableSeats: 0 }
    const guests = [makeGuest('g-1'), makeGuest('g-2')]

    const plan = allocate(room, guests, [])

    expect(plan.unseated).toEqual([])
  })
})

describe('allocate — determinism and purity', () => {
  it('the same room, guests and pins produce a deeply equal plan when called twice', () => {
    const room: RoomConfig = { roundTables: 2, seatsEach: 4, topTableSeats: 4 }
    const guests = [makeGuest('groom', { role: 'groom' }), makeGuest('bride', { role: 'bride' }), makeGuest('g-3')]
    const pins: Pin[] = [{ guestId: 'g-3', tableId: 'round-1' }]

    expect(allocate(room, guests, pins)).toEqual(allocate(room, guests, pins))
  })

  it('mutates neither guests nor pins', () => {
    const room: RoomConfig = { roundTables: 1, seatsEach: 4, topTableSeats: 4 }
    const guests = [makeGuest('groom', { role: 'groom' }), makeGuest('g-2')]
    const pins: Pin[] = [{ guestId: 'g-2', tableId: 'round-1' }]
    const guestsBefore = JSON.parse(JSON.stringify(guests)) as Guest[]
    const pinsBefore = JSON.parse(JSON.stringify(pins)) as Pin[]

    allocate(room, guests, pins)

    expect(guests).toEqual(guestsBefore)
    expect(pins).toEqual(pinsBefore)
  })
})

/**
 * KB-4's placement matrix, from here down. Every protocol-role fixture reads its role from
 * PROTOCOL_ROLES rather than typing a string again, so a typo in that one source would surface
 * as a mismatched seat here rather than vanishing into a silently empty one.
 */
const [CHIEF_BRIDESMAID, FATHER_OF_GROOM, MOTHER_OF_BRIDE, GROOM, BRIDE, FATHER_OF_BRIDE, MOTHER_OF_GROOM, BEST_MAN] =
  PROTOCOL_ROLES

/** The seven protocol roles other than best man, each held by exactly one guest. A fresh array per call. */
function otherProtocolGuests(): Guest[] {
  return [
    makeGuest('chief-bridesmaid', { role: CHIEF_BRIDESMAID }),
    makeGuest('father-of-groom', { role: FATHER_OF_GROOM }),
    makeGuest('mother-of-bride', { role: MOTHER_OF_BRIDE }),
    makeGuest('groom', { role: GROOM }),
    makeGuest('bride', { role: BRIDE }),
    makeGuest('father-of-bride', { role: FATHER_OF_BRIDE }),
    makeGuest('mother-of-groom', { role: MOTHER_OF_GROOM }),
  ]
}

const DIR = dirname(fileURLToPath(import.meta.url))

type ScenarioFixture = {
  meta: { tables: RoomConfig; guests: number; spare: number }
  guests: Guest[]
}

/** Reads a shipped scenario's real room and guest list — KB-3's numbers, not a copy of them. */
function readScenario(id: ScenarioId): ScenarioFixture {
  const path = join(DIR, '../../public/scenarios', `${id}.json`)
  return JSON.parse(readFileSync(path, 'utf8')) as ScenarioFixture
}

describe('allocate — the top table seated by protocol, seat for seat (C5)', () => {
  it('with all eight roles present, seat i holds KB-4\'s role for seat i, and no ordinary guest reaches the top table', () => {
    const room: RoomConfig = { roundTables: 1, seatsEach: 8, topTableSeats: 8 }
    const guests = [...otherProtocolGuests(), makeGuest('best-man', { role: BEST_MAN }), makeGuest('ordinary-1')]

    const plan = allocate(room, guests, [])
    const top = plan.tables.find((table) => table.id === 'top')

    if (!top) throw new Error('expected a top table')
    expect(top.seats.map((seat) => seat?.guest.id)).toEqual([
      'chief-bridesmaid',
      'father-of-groom',
      'mother-of-bride',
      'groom',
      'bride',
      'father-of-bride',
      'mother-of-groom',
      'best-man',
    ])
    expect(seatOf(plan, 'ordinary-1')?.table.id).toBe('round-1')
  })
})

describe('allocate — seats beyond the eighth stay empty, however large the top table (C9)', () => {
  it('with ten top seats, roles fill the first eight, seats nine and ten stay empty, and the ordinary guest is seated in the room instead', () => {
    const room: RoomConfig = { roundTables: 1, seatsEach: 1, topTableSeats: 10 }
    const guests = [...otherProtocolGuests(), makeGuest('best-man', { role: BEST_MAN }), makeGuest('ordinary-1')]

    const plan = allocate(room, guests, [])
    const top = plan.tables.find((table) => table.id === 'top')

    if (!top) throw new Error('expected a top table')
    expect(top.seats).toHaveLength(10)
    expect(top.seats.slice(0, 8).every((seat) => seat !== null)).toBe(true)
    expect(top.seats[8]).toBeNull()
    expect(top.seats[9]).toBeNull()
    expect(seatOf(plan, 'ordinary-1')?.table.id).toBe('round-1')
  })
})

describe('allocate — a protocol role nobody holds leaves its seat empty; nobody is promoted (C8)', () => {
  it('with no best man in the guest list, the eighth seat is empty and the next guest is seated at a round table instead', () => {
    const room: RoomConfig = { roundTables: 1, seatsEach: 8, topTableSeats: 8 }
    const guests = [...otherProtocolGuests(), makeGuest('next-guest')]

    const plan = allocate(room, guests, [])
    const top = plan.tables.find((table) => table.id === 'top')

    if (!top) throw new Error('expected a top table')
    expect(top.seats.slice(0, 7).every((seat) => seat !== null)).toBe(true)
    expect(top.seats[7]).toBeNull()
    expect(seatOf(plan, 'next-guest')?.table.id).toBe('round-1')
  })
})

describe('allocate — six top seats: the middle six by protocol, the outermost two together at the nearest round table (C6, C7)', () => {
  it("Adding up's top table holds the six middle roles in protocol order, and the chief bridesmaid and best man sit together at round-1", () => {
    const { meta, guests } = readScenario('adding-up')

    const plan = allocate(meta.tables, guests, [])
    const top = plan.tables.find((table) => table.id === 'top')

    if (!top) throw new Error('expected a top table')
    expect(top.seats).toHaveLength(6)
    expect(top.seats.map((seat) => seat?.guest.role)).toEqual([
      FATHER_OF_GROOM,
      MOTHER_OF_BRIDE,
      GROOM,
      BRIDE,
      FATHER_OF_BRIDE,
      MOTHER_OF_GROOM,
    ])

    const chiefBridesmaid = guests.find((guest) => guest.role === CHIEF_BRIDESMAID)
    const bestMan = guests.find((guest) => guest.role === BEST_MAN)
    if (!chiefBridesmaid || !bestMan) throw new Error('expected Adding up to carry both roles exactly once')

    expect(seatOf(plan, chiefBridesmaid.id)?.table.id).toBe('round-1')
    expect(seatOf(plan, bestMan.id)?.table.id).toBe('round-1')
  })

  it('when round-1 has only one free seat, the overflow pair moves together to the next round table with room for both (A7)', () => {
    const room: RoomConfig = { roundTables: 2, seatsEach: 8, topTableSeats: 6 }
    const fillers = Array.from({ length: 7 }, (_, i) => makeGuest(`filler-${i + 1}`))
    const guests = [...otherProtocolGuests(), makeGuest('best-man', { role: BEST_MAN }), ...fillers]
    const pins: Pin[] = fillers.map((guest) => ({ guestId: guest.id, tableId: 'round-1' }))

    const plan = allocate(room, guests, pins)

    expect(seatOf(plan, 'chief-bridesmaid')?.table.id).toBe('round-2')
    expect(seatOf(plan, 'best-man')?.table.id).toBe('round-2')
  })

  it('when no round table has room for the whole pair, they fall through to the ordinary fill and are seated individually without error (A7)', () => {
    const room: RoomConfig = { roundTables: 2, seatsEach: 8, topTableSeats: 6 }
    const round1Fillers = Array.from({ length: 7 }, (_, i) => makeGuest(`r1-filler-${i + 1}`))
    const round2Fillers = Array.from({ length: 7 }, (_, i) => makeGuest(`r2-filler-${i + 1}`))
    const guests = [
      ...otherProtocolGuests(),
      makeGuest('best-man', { role: BEST_MAN }),
      ...round1Fillers,
      ...round2Fillers,
    ]
    const pins: Pin[] = [
      ...round1Fillers.map((guest) => ({ guestId: guest.id, tableId: 'round-1' })),
      ...round2Fillers.map((guest) => ({ guestId: guest.id, tableId: 'round-2' })),
    ]

    expect(() => allocate(room, guests, pins)).not.toThrow()
    const plan = allocate(room, guests, pins)

    const chiefLocation = seatOf(plan, 'chief-bridesmaid')
    const bestManLocation = seatOf(plan, 'best-man')

    expect(chiefLocation).not.toBeNull()
    expect(bestManLocation).not.toBeNull()
    expect(chiefLocation?.table.id).not.toBe(bestManLocation?.table.id)
    expect(plan.unseated).toEqual([])
  })
})

describe('allocate — a pin binds a guest to a table, not a seat (C12, A2, A5)', () => {
  it('an ordinary guest pinned to round-3 is seated there, pinned true', () => {
    const room: RoomConfig = { roundTables: 3, seatsEach: 8, topTableSeats: 0 }
    const plan = allocate(room, [makeGuest('g-1')], [{ guestId: 'g-1', tableId: 'round-3' }])

    const location = seatOf(plan, 'g-1')
    if (!location || location.seatIndex === null) throw new Error('expected g-1 to hold a seat')
    expect(location.table.id).toBe('round-3')
    expect(location.table.seats[location.seatIndex]?.pinned).toBe(true)
  })

  it('the best man pinned to round-3 stays there, and the top table\'s eighth seat is left empty', () => {
    const room: RoomConfig = { roundTables: 3, seatsEach: 8, topTableSeats: 8 }
    const guests = [...otherProtocolGuests(), makeGuest('best-man', { role: BEST_MAN })]

    const plan = allocate(room, guests, [{ guestId: 'best-man', tableId: 'round-3' }])

    expect(seatOf(plan, 'best-man')?.table.id).toBe('round-3')
    const top = plan.tables.find((table) => table.id === 'top')
    expect(top?.seats[7]).toBeNull()
  })

  it('an ordinary guest hand-pinned to the top table is not seated there — they are seated in the room instead, unpinned', () => {
    const room: RoomConfig = { roundTables: 1, seatsEach: 8, topTableSeats: 8 }
    const plan = allocate(room, [makeGuest('g-1')], [{ guestId: 'g-1', tableId: 'top' }])

    const location = seatOf(plan, 'g-1')
    if (!location || location.seatIndex === null) throw new Error('expected g-1 to hold a seat in the room')
    expect(location.table.id).toBe('round-1')
    expect(location.table.seats[location.seatIndex]?.pinned).toBe(false)

    const top = plan.tables.find((table) => table.id === 'top')
    expect(top?.seats.every((seat) => seat === null)).toBe(true)
  })

  it('the groom pinned to top lands at seat 4 (index 3) of an eight-seat top table, pinned true', () => {
    const room: RoomConfig = { roundTables: 1, seatsEach: 8, topTableSeats: 8 }
    const plan = allocate(room, [makeGuest('groom', { role: GROOM })], [{ guestId: 'groom', tableId: 'top' }])

    const location = seatOf(plan, 'groom')
    if (!location || location.seatIndex === null) throw new Error('expected the groom to hold a seat')
    expect(location.table.id).toBe('top')
    expect(location.seatIndex).toBe(3)
    expect(location.table.seats[3]?.pinned).toBe(true)
  })
})

describe('allocate — two holders of the same protocol role (A10)', () => {
  it('the first in guest-list order takes the seat; the other is seated in the room', () => {
    const room: RoomConfig = { roundTables: 1, seatsEach: 8, topTableSeats: 8 }
    const guests = [
      ...otherProtocolGuests(),
      makeGuest('best-man-1', { role: BEST_MAN }),
      makeGuest('best-man-2', { role: BEST_MAN }),
    ]

    const plan = allocate(room, guests, [])
    const top = plan.tables.find((table) => table.id === 'top')

    expect(top?.seats[7]?.guest.id).toBe('best-man-1')
    expect(seatOf(plan, 'best-man-2')?.table.id).toBe('round-1')
  })
})

describe('allocate — the three shipped scenarios, seated for real (C10)', () => {
  it('Small and cosy seats everyone; no seat is spare', () => {
    const { meta, guests } = readScenario('small-and-cosy')

    const plan = allocate(meta.tables, guests, [])

    expect(plan.unseated).toEqual([])
    for (const table of plan.tables) {
      expect(table.seats.every((seat) => seat !== null)).toBe(true)
      expect(table.overflow).toEqual([])
    }
  })

  it('Adding up leaves exactly eight seats empty', () => {
    const { meta, guests } = readScenario('adding-up')

    const plan = allocate(meta.tables, guests, [])

    expect(plan.unseated).toEqual([])
    const emptyCount = plan.tables.reduce(
      (sum, table) => sum + table.seats.filter((seat) => seat === null).length,
      0,
    )
    expect(emptyCount).toBe(8)
  })

  it('Celebrity scale leaves exactly sixteen seats empty', () => {
    const { meta, guests } = readScenario('celebrity-scale')

    const plan = allocate(meta.tables, guests, [])

    expect(plan.unseated).toEqual([])
    const emptyCount = plan.tables.reduce(
      (sum, table) => sum + table.seats.filter((seat) => seat === null).length,
      0,
    )
    expect(emptyCount).toBe(16)
  })
})

describe('allocate — a room too small for everyone (C13)', () => {
  it('12 guests into a single round table of 4 with no top table: the first four in list order are seated, the rest unseated', () => {
    const room: RoomConfig = { roundTables: 1, seatsEach: 4, topTableSeats: 0 }
    const guests = Array.from({ length: 12 }, (_, i) => makeGuest(`g-${i + 1}`))

    const plan = allocate(room, guests, [])

    expect(plan.unseated.map((guest) => guest.id)).toEqual([
      'g-5',
      'g-6',
      'g-7',
      'g-8',
      'g-9',
      'g-10',
      'g-11',
      'g-12',
    ])
    const table = plan.tables.find((candidate) => candidate.id === 'round-1')
    expect(table?.seats.map((seat) => seat?.guest.id)).toEqual(['g-1', 'g-2', 'g-3', 'g-4'])
  })
})

describe('allocate — determinism goes deeper than the base contract (C13)', () => {
  it('the same pins in a shuffled array produce a deeply equal plan', () => {
    const room: RoomConfig = { roundTables: 2, seatsEach: 4, topTableSeats: 6 }
    const guests = [
      makeGuest('groom', { role: GROOM }),
      makeGuest('bride', { role: BRIDE }),
      makeGuest('g-3'),
      makeGuest('g-4'),
      makeGuest('g-5'),
    ]
    const pinsForward: Pin[] = [
      { guestId: 'g-3', tableId: 'round-1' },
      { guestId: 'g-4', tableId: 'round-1' },
      { guestId: 'g-5', tableId: 'round-2' },
    ]
    const pinsShuffled: Pin[] = [pinsForward[2], pinsForward[0], pinsForward[1]].filter(
      (pin): pin is Pin => pin !== undefined,
    )

    expect(allocate(room, guests, pinsShuffled)).toEqual(allocate(room, guests, pinsForward))
  })

  it('guests copied into a fresh array produce a deeply equal plan', () => {
    const room: RoomConfig = { roundTables: 1, seatsEach: 4, topTableSeats: 4 }
    const guests = [makeGuest('groom', { role: GROOM }), makeGuest('g-2')]
    const pins: Pin[] = [{ guestId: 'g-2', tableId: 'round-1' }]

    expect(allocate(room, [...guests], pins)).toEqual(allocate(room, guests, pins))
  })
})

describe('allocate — the fill consults a caller-supplied guard (C11)', () => {
  it('a guard refusing every seat at round-1 leaves it untouched; guests land at round-2 onward', () => {
    const room: RoomConfig = { roundTables: 2, seatsEach: 4, topTableSeats: 0 }
    const guests = Array.from({ length: 4 }, (_, i) => makeGuest(`g-${i + 1}`))
    const refuseRoundOne: SeatGuard = (candidate) => candidate.tableId !== 'round-1'

    const plan = allocate(room, guests, [], { allowSeat: refuseRoundOne })

    const round1 = plan.tables.find((table) => table.id === 'round-1')
    const round2 = plan.tables.find((table) => table.id === 'round-2')
    expect(round1?.seats.every((seat) => seat === null)).toBe(true)
    expect(round2?.seats.filter((seat) => seat !== null)).toHaveLength(4)
  })

  it('the same guard does not stop a guest pinned to round-1, nor the protocol overflow block placed there (A8)', () => {
    const room: RoomConfig = { roundTables: 2, seatsEach: 8, topTableSeats: 6 }
    const guests = [...otherProtocolGuests(), makeGuest('best-man', { role: BEST_MAN }), makeGuest('pinned-guest')]
    const pins: Pin[] = [{ guestId: 'pinned-guest', tableId: 'round-1' }]
    const refuseRoundOne: SeatGuard = (candidate) => candidate.tableId !== 'round-1'

    const plan = allocate(room, guests, pins, { allowSeat: refuseRoundOne })

    expect(seatOf(plan, 'pinned-guest')?.table.id).toBe('round-1')
    expect(seatOf(plan, 'chief-bridesmaid')?.table.id).toBe('round-1')
    expect(seatOf(plan, 'best-man')?.table.id).toBe('round-1')
  })

  it('a guard refusing every seat leaves every unpinned, non-protocol guest unseated, while protocol seats and honoured pins stand', () => {
    const room: RoomConfig = { roundTables: 1, seatsEach: 8, topTableSeats: 8 }
    const guests = [
      ...otherProtocolGuests(),
      makeGuest('best-man', { role: BEST_MAN }),
      makeGuest('pinned-guest'),
      makeGuest('ordinary-1'),
      makeGuest('ordinary-2'),
    ]
    const pins: Pin[] = [{ guestId: 'pinned-guest', tableId: 'round-1' }]
    const refuseEverything: SeatGuard = () => false

    const plan = allocate(room, guests, pins, { allowSeat: refuseEverything })

    const top = plan.tables.find((table) => table.id === 'top')
    expect(top?.seats.every((seat) => seat !== null)).toBe(true)
    expect(seatOf(plan, 'pinned-guest')?.table.id).toBe('round-1')
    expect(plan.unseated.map((guest) => guest.id)).toEqual(['ordinary-1', 'ordinary-2'])
  })

  it('a recording guard sees the candidate table fill up as the pass proceeds, and every candidate carries a 0-based seat index', () => {
    const room: RoomConfig = { roundTables: 1, seatsEach: 4, topTableSeats: 0 }
    const guests = [makeGuest('g-1'), makeGuest('g-2'), makeGuest('g-3')]
    const seatedIds = new Set(guests.map((guest) => guest.id))
    const seen: SeatCandidate[] = []
    const recordingGuard: SeatGuard = (candidate) => {
      seen.push(candidate)
      return true
    }

    const plan = allocate(room, guests, [], { allowSeat: recordingGuard })

    expect(seen.length).toBeGreaterThanOrEqual(3)
    for (const candidate of seen) {
      expect(candidate.tableId).toBe('round-1')
      expect(candidate.seatIndex).toBeGreaterThanOrEqual(0)
      expect(candidate.seatIndex).toBeLessThan(4)
      expect(seatedIds.has(candidate.guest.id)).toBe(true)
    }

    const occupiedCounts = seen.map((candidate) => {
      const table = candidate.plan.tables.find((t) => t.id === 'round-1')
      return table?.seats.filter((seat) => seat !== null).length ?? 0
    })
    const sorted = [...occupiedCounts].sort((a, b) => a - b)
    expect(occupiedCounts).toEqual(sorted)
    expect(occupiedCounts.at(-1)).toBe(3)
    expect(plan.unseated).toEqual([])
  })
})

describe('allocate — capacity is enforced by the seat model, not a rule (C17)', () => {
  it('with no guard, 40 guests into four tables of 8 and no top table seats 32 and leaves 8 unseated', () => {
    const room: RoomConfig = { roundTables: 4, seatsEach: 8, topTableSeats: 0 }
    const guests = Array.from({ length: 40 }, (_, i) => makeGuest(`g-${i + 1}`))

    const plan = allocate(room, guests, [])

    const seatedCount = plan.tables.reduce(
      (sum, table) => sum + table.seats.filter((seat) => seat !== null).length,
      0,
    )
    expect(seatedCount).toBe(32)
    expect(plan.unseated).toHaveLength(8)
    for (const table of plan.tables) {
      expect(table.seats.length).toBe(table.capacity)
    }
  })

  it('seated occupants never exceed totalSeats(room), and overflow stays empty unless a hand pin overfilled a table', () => {
    const room: RoomConfig = { roundTables: 3, seatsEach: 4, topTableSeats: 4 }
    const guests = Array.from({ length: 20 }, (_, i) => makeGuest(`g-${i + 1}`))

    const plan = allocate(room, guests, [])

    const seatedCount = plan.tables.reduce(
      (sum, table) => sum + table.seats.filter((seat) => seat !== null).length,
      0,
    )
    expect(seatedCount).toBeLessThanOrEqual(totalSeats(room))
    expect(plan.tables.every((table) => table.overflow.length === 0)).toBe(true)
  })
})

describe('allocate — no violation exists yet to detect (C18)', () => {
  it('a plan carries no violation data at all — rules and violations belong to a later ticket', () => {
    const room: RoomConfig = { roundTables: 1, seatsEach: 4, topTableSeats: 4 }
    const guests = [makeGuest('groom', { role: GROOM }), makeGuest('g-2')]

    const plan = allocate(room, guests, [])

    for (const table of plan.tables) {
      expect(Object.keys(table).some((key) => /violation/i.test(key))).toBe(false)
      for (const seat of table.seats) {
        if (seat) expect(Object.keys(seat).some((key) => /violation/i.test(key))).toBe(false)
      }
    }
  })
})

describe('allocate — what a guard is handed (C11)', () => {
  it('leaves every table structurally valid when the guard only reads, however often it is asked', () => {
    const room: RoomConfig = { roundTables: 2, seatsEach: 4, topTableSeats: 0 }
    const guests = Array.from({ length: 6 }, (_, i) => makeGuest(`g-${i + 1}`))

    let asked = 0
    const readingGuard: SeatGuard = (candidate) => {
      asked += 1
      candidate.plan.tables.find((table) => table.id === candidate.tableId)
      return true
    }

    const plan = allocate(room, guests, [], { allowSeat: readingGuard })

    expect(asked).toBeGreaterThan(0)
    for (const table of plan.tables) {
      expect(table.seats.length).toBe(table.capacity)
    }
  })

  it('types the seats it hands a guard as readonly, so a rule cannot write to them by accident', () => {
    // Never invoked: the guarantee is the type, not a runtime freeze. If SeatedTable.seats ever
    // stops being readonly, the directive below becomes an unused-directive error and the gate
    // fails. A guard that casts the marker away can corrupt the plan, and nothing prevents that
    // at runtime — TT-14's rules read this plan and must not write to it.
    const wouldNotTypecheck = (candidate: SeatCandidate): void => {
      const table = candidate.plan.tables[0]
      // @ts-expect-error SeatedTable.seats is readonly
      table?.seats.push(null)
    }

    expect(typeof wouldNotTypecheck).toBe('function')
  })
})
