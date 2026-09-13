import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { rule as topTableRule } from './topTable.rule'
import { allocate } from '../allocate'
import { seatPins, topTableRoleOrder } from '../seating'
import type { SeatedTable } from '../seating'
import { PROTOCOL_ROLES } from '../types'
import type { Guest, RoomConfig } from '../types'
import type { ScenarioId } from '../scenarios'

/**
 * TT-14's top-table rule (KB-2 hard constraints; KB-4's protocol order). Checked against
 * topTableRoleOrder, the same function TT-13's solver places from, so the rule and the placement
 * cannot disagree about what a top table of this size should hold.
 *
 * TT-14 (product decision, relayed mid-build, not KB-4's own text): a pinned occupant is exempt
 * from this rule. `allocate` is being changed separately (not part of this ticket's file set) to
 * honour a hand pin to the top table rather than move that guest, and a pinned non-protocol
 * occupant is treated as a deliberate human choice, not a breach to report. KB-4 itself says "no
 * exceptions" — this is a recorded divergence from that wording, not a misreading of it. Every
 * test below that turns on pinned-vs-not is named TT-14 for that reason.
 *
 * Written from TT-14's acceptance criteria and this recorded decision. Does not open
 * topTable.rule.ts.
 *
 * TT-16: `evaluate` now returns `{ findings, opportunities, missed }` rather than a bare array.
 * `opportunities` is declared as the non-pinned occupied top-table seats — hard, so it never
 * scores, but `findings.length <= missed <= opportunities` must still hold (registry.test.ts
 * guards this across the registry).
 */

const [, , , GROOM, BRIDE] = PROTOCOL_ROLES

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

/** Every seat filled by its protocol holder, per topTableRoleOrder, none of them pinned. */
function topTableSeatedByProtocol(capacity: number): SeatedTable {
  const roles = topTableRoleOrder(capacity)
  return {
    id: 'top',
    kind: 'top',
    number: null,
    label: 'Top table',
    capacity,
    seats: roles.map((role) => ({ guest: makeGuest(`holder-of-${role}`, { role }), pinned: false })),
    overflow: [],
  }
}

function withPinned(table: SeatedTable, seatIndices: readonly number[]): SeatedTable {
  const indices = new Set(seatIndices)
  return {
    ...table,
    seats: table.seats.map((seat, index) => (seat && indices.has(index) ? { ...seat, pinned: true } : seat)),
  }
}

function swapSeats(table: SeatedTable, indexA: number, indexB: number): SeatedTable {
  return {
    ...table,
    seats: table.seats.map((seat, index) => {
      if (index === indexA) return table.seats[indexB] ?? null
      if (index === indexB) return table.seats[indexA] ?? null
      return seat
    }),
  }
}

describe('top table — TT-14: an unpinned non-protocol occupant is a violation; nobody but a protocol holder or a deliberate pin belongs there', () => {
  it('a guest with no protocol role and no pin, seated at the top table, fires — this occupant has no production path today and is built directly', () => {
    const guest = makeGuest('interloper')
    const table: SeatedTable = {
      id: 'top',
      kind: 'top',
      number: null,
      label: 'Top table',
      capacity: 8,
      seats: [{ guest, pinned: false }, null, null, null, null, null, null, null],
      overflow: [],
    }

    const { findings } = topTableRule.evaluate({ tables: [table] })

    expect(findings).toHaveLength(1)
    expect(findings[0]?.tableIds).toEqual(['top'])
    expect(findings[0]?.guestIds).toEqual(['interloper'])
  })
})

describe("top table — TT-14: a pinned occupant is exempt, a deliberate divergence from KB-4's 'no exceptions', decided by the product owner", () => {
  it('the same non-protocol guest, seated by a hand pin to the top table, is quiet', () => {
    const room: RoomConfig = { roundTables: 1, seatsEach: 8, topTableSeats: 8 }
    const guest = makeGuest('civilian')
    const plan = seatPins(room, [guest], [{ guestId: 'civilian', tableId: 'top' }])

    expect(topTableRule.evaluate({ tables: plan.tables }).findings).toEqual([])
  })
})

describe('top table — two protocol holders swapped between seats, both unpinned, each fire (KB-4 protocol order)', () => {
  it("the groom in the bride's seat and the bride in the groom's seat both fire, and nobody else does", () => {
    const roles = topTableRoleOrder(8)
    const groomSeat = roles.indexOf(GROOM)
    const brideSeat = roles.indexOf(BRIDE)
    const table = swapSeats(topTableSeatedByProtocol(8), groomSeat, brideSeat)
    const groomId = `holder-of-${GROOM}`
    const brideId = `holder-of-${BRIDE}`

    const { findings } = topTableRule.evaluate({ tables: [table] })

    expect(findings).toHaveLength(2)
    expect([...findings.flatMap((finding) => finding.guestIds)].sort()).toEqual([brideId, groomId].sort())
    expect(findings.every((finding) => finding.tableIds.includes('top'))).toBe(true)
  })

  it('TT-14: the same swap, but both occupants pinned in their seats, is quiet — a pin is a deliberate placement, not a breach', () => {
    const roles = topTableRoleOrder(8)
    const groomSeat = roles.indexOf(GROOM)
    const brideSeat = roles.indexOf(BRIDE)
    const swapped = swapSeats(topTableSeatedByProtocol(8), groomSeat, brideSeat)
    const pinned = withPinned(swapped, [groomSeat, brideSeat])

    expect(topTableRule.evaluate({ tables: [pinned] }).findings).toEqual([])
  })
})

describe('top table — an occupant past the eighth seat fires when unpinned, however large the table (KB-4)', () => {
  it('a top table of ten seats someone unpinned in seat nine (index 8), and that alone fires', () => {
    const base = topTableSeatedByProtocol(8)
    const extra = makeGuest('seat-nine-guest')
    const tenSeats: SeatedTable = {
      ...base,
      capacity: 10,
      seats: [...base.seats, { guest: extra, pinned: false }, null],
    }

    const { findings } = topTableRule.evaluate({ tables: [tenSeats] })

    expect(findings).toHaveLength(1)
    expect(findings[0]?.guestIds).toEqual(['seat-nine-guest'])
    expect(findings[0]?.tableIds).toEqual(['top'])
  })

  it('TT-14: the same seat-nine occupant, pinned there instead, is quiet', () => {
    const base = topTableSeatedByProtocol(8)
    const extra = makeGuest('seat-nine-guest')
    const tenSeats: SeatedTable = {
      ...base,
      capacity: 10,
      seats: [...base.seats, { guest: extra, pinned: true }, null],
    }

    expect(topTableRule.evaluate({ tables: [tenSeats] }).findings).toEqual([])
  })
})

describe('top table — quiet on an empty seat; an unheld role is not a violation (KB-4; KB-1: "no hard violations where one is possible")', () => {
  it('a top table with only the couple seated, everyone else empty, has nothing wrong with it', () => {
    const roles = topTableRoleOrder(8)
    const table: SeatedTable = {
      id: 'top',
      kind: 'top',
      number: null,
      label: 'Top table',
      capacity: 8,
      seats: roles.map((role) =>
        role === GROOM || role === BRIDE ? { guest: makeGuest(`holder-of-${role}`, { role }), pinned: false } : null,
      ),
      overflow: [],
    }

    expect(topTableRule.evaluate({ tables: [table] }).findings).toEqual([])
  })
})

describe('top table — quiet when the room has no top table at all', () => {
  it('a plan of round tables only produces no findings, and does not throw', () => {
    const roundOnly: SeatedTable = {
      id: 'round-1',
      kind: 'round',
      number: 1,
      label: 'Table 1',
      capacity: 8,
      seats: new Array(8).fill(null),
      overflow: [],
    }

    expect(() => topTableRule.evaluate({ tables: [roundOnly] })).not.toThrow()
    expect(topTableRule.evaluate({ tables: [roundOnly] }).findings).toEqual([])
  })
})

describe('top table — opportunities counts the non-pinned occupied seats, no more and no less (TT-16)', () => {
  it('reports 0 when there is no top table at all', () => {
    const roundOnly: SeatedTable = {
      id: 'round-1',
      kind: 'round',
      number: 1,
      label: 'Table 1',
      capacity: 8,
      seats: new Array(8).fill(null),
      overflow: [],
    }

    expect(topTableRule.evaluate({ tables: [roundOnly] }).opportunities).toBe(0)
  })

  it('reports 0 for a top table whose every occupant is pinned', () => {
    const table = withPinned(topTableSeatedByProtocol(8), [0, 1, 2, 3, 4, 5, 6, 7])

    expect(topTableRule.evaluate({ tables: [table] }).opportunities).toBe(0)
  })

  it('counts every unpinned occupied seat and excludes empty seats and pinned occupants', () => {
    // Eight seats: two occupied-and-unpinned, one occupied-and-pinned, five empty.
    const table: SeatedTable = {
      id: 'top',
      kind: 'top',
      number: null,
      label: 'Top table',
      capacity: 8,
      seats: [
        { guest: makeGuest('a'), pinned: false },
        { guest: makeGuest('b'), pinned: false },
        { guest: makeGuest('c'), pinned: true },
        null,
        null,
        null,
        null,
        null,
      ],
      overflow: [],
    }

    expect(topTableRule.evaluate({ tables: [table] }).opportunities).toBe(2)
  })
})

const DIR = dirname(fileURLToPath(import.meta.url))

type ScenarioFixture = { meta: { tables: RoomConfig }; guests: Guest[] }

function readScenario(id: ScenarioId): ScenarioFixture {
  const path = join(DIR, '../../../public/scenarios', `${id}.json`)
  return JSON.parse(readFileSync(path, 'utf8')) as ScenarioFixture
}

describe('top table — quiet on the real top table allocate produces for each shipped scenario (KB-3)', () => {
  it.each(['small-and-cosy', 'adding-up', 'celebrity-scale'] as const)(
    "%s: the solver's own top table breaks no protocol rule",
    (id) => {
      const { meta, guests } = readScenario(id)
      const plan = allocate(meta.tables, guests, [])

      expect(topTableRule.evaluate({ tables: plan.tables }).findings).toEqual([])
    },
  )

  it("Adding up's top table of six, filled from the middle out, is exactly as protocol-clean as a full eight (KB-4)", () => {
    const { meta, guests } = readScenario('adding-up')
    const plan = allocate(meta.tables, guests, [])
    const top = plan.tables.find((table) => table.id === 'top')

    if (!top) throw new Error("expected Adding up's room to carry a top table")
    expect(top.capacity).toBe(6)
    expect(topTableRule.evaluate({ tables: [top] }).findings).toEqual([])
  })
})
