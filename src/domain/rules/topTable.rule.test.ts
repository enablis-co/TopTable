import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { rule as topTableRule } from './topTable.rule'
import { allocate } from '../allocate'
import { seatPins, topTableRoleOrder } from '../seating'
import type { Seat, SeatedTable } from '../seating'
import { PROTOCOL_ROLES } from '../types'
import type { Guest, RoomConfig } from '../types'
import type { ScenarioId } from '../scenarios'
import type { RulePlan } from './contract'

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
 * TT-49 (KB-8): `opportunities` is the top table's capacity, flat — it never moves with occupancy
 * or pins. An empty seat is `missed` only when the guest list (seated elsewhere, in overflow, or
 * in `plan.unseated`) holds the protocol role `topTableRoleOrder` gives that seat; nobody holding
 * a role the table has means no chance was ever given for that seat. `evaluate` therefore now
 * takes the full `RulePlan` (tables and `unseated`), not just `{ tables }`.
 *
 * Written from TT-14's and TT-49's acceptance criteria and KB-8. Does not open topTable.rule.ts.
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

/** An empty top table of this capacity — no occupant in any seat. */
function emptyTopTable(capacity: number): SeatedTable {
  return {
    id: 'top',
    kind: 'top',
    number: null,
    label: 'Top table',
    capacity,
    seats: new Array(capacity).fill(null),
    overflow: [],
  }
}

/** One guest per role `topTableRoleOrder(capacity)` names, not seated anywhere — for putting on
 *  `plan.unseated` so the guest list "holds" every role this table has without occupying a seat. */
function roleHolders(capacity: number, idPrefix: string): Guest[] {
  return topTableRoleOrder(capacity).map((role, index) => makeGuest(`${idPrefix}-${index}-${role}`, { role }))
}

/** The first `n` of `holders` seated at seats 0..n-1 (their correct seats, by construction —
 *  `holders[i]`'s role is `topTableRoleOrder(capacity)[i]`), the rest of the table empty. */
function seatFirstN(capacity: number, holders: readonly Guest[], n: number): SeatedTable {
  const seats: (Seat | null)[] = holders.slice(0, n).map((guest) => ({ guest, pinned: false }))
  while (seats.length < capacity) seats.push(null)
  return { id: 'top', kind: 'top', number: null, label: 'Top table', capacity, seats, overflow: [] }
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

    const { findings } = topTableRule.evaluate({ tables: [table], unseated: [] })

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

    expect(topTableRule.evaluate(plan).findings).toEqual([])
  })
})

describe('top table — two protocol holders swapped between seats, both unpinned, each fire (KB-4 protocol order)', () => {
  it("the groom in the bride's seat and the bride in the groom's seat both fire, and nobody else does — and this is the whole guest list, so every chance the table had was taken (TT-49)", () => {
    const roles = topTableRoleOrder(8)
    const groomSeat = roles.indexOf(GROOM)
    const brideSeat = roles.indexOf(BRIDE)
    const table = swapSeats(topTableSeatedByProtocol(8), groomSeat, brideSeat)
    const groomId = `holder-of-${GROOM}`
    const brideId = `holder-of-${BRIDE}`

    const { findings, opportunities, missed } = topTableRule.evaluate({ tables: [table], unseated: [] })

    expect(findings).toHaveLength(2)
    expect([...findings.flatMap((finding) => finding.guestIds)].sort()).toEqual([brideId, groomId].sort())
    expect(findings.every((finding) => finding.tableIds.includes('top'))).toBe(true)
    expect(opportunities).toBe(8)
    expect(missed).toBe(2)
  })

  it('TT-14: the same swap, but both occupants pinned in their seats, is quiet — a pin is a deliberate placement, not a breach', () => {
    const roles = topTableRoleOrder(8)
    const groomSeat = roles.indexOf(GROOM)
    const brideSeat = roles.indexOf(BRIDE)
    const swapped = swapSeats(topTableSeatedByProtocol(8), groomSeat, brideSeat)
    const pinned = withPinned(swapped, [groomSeat, brideSeat])

    expect(topTableRule.evaluate({ tables: [pinned], unseated: [] }).findings).toEqual([])
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

    const { findings } = topTableRule.evaluate({ tables: [tenSeats], unseated: [] })

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

    expect(topTableRule.evaluate({ tables: [tenSeats], unseated: [] }).findings).toEqual([])
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

    expect(topTableRule.evaluate({ tables: [table], unseated: [] }).findings).toEqual([])
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

    expect(() => topTableRule.evaluate({ tables: [roundOnly], unseated: [] })).not.toThrow()
    expect(topTableRule.evaluate({ tables: [roundOnly], unseated: [] }).findings).toEqual([])
  })
})

// TT-49: re-derived against the capacity-flat denominator. The block used to be titled
// "opportunities counts the non-pinned occupied seats" and check exactly that; the two sub-tests
// below re-derive the same two scenarios (every occupant pinned; a mix of pinned, unpinned and
// empty) against what the rule now reports, rather than adding further scenarios.
describe("top table — opportunities is the top table's capacity, flat: it does not move with occupancy or pins (TT-49; KB-8)", () => {
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

    expect(topTableRule.evaluate({ tables: [roundOnly], unseated: [] }).opportunities).toBe(0)
  })

  it('reports the full capacity for a top table whose every occupant is pinned, with nothing missed and nothing to report', () => {
    const holders = roleHolders(8, 'pinned-holder')
    const table = withPinned(seatFirstN(8, holders, 8), [0, 1, 2, 3, 4, 5, 6, 7])

    const { findings, opportunities, missed } = topTableRule.evaluate({ tables: [table], unseated: [] })

    expect(opportunities).toBe(8)
    expect(missed).toBe(0)
    expect(findings).toEqual([])
  })

  it('reports the full capacity for a mix of two unpinned interlopers, one pinned occupant and five empty seats on a list holding no protocol role — the two interlopers are both missed and both findings, the empty seats are neither', () => {
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

    const { findings, opportunities, missed } = topTableRule.evaluate({ tables: [table], unseated: [] })

    expect(opportunities).toBe(8)
    expect(missed).toBe(2)
    expect(findings).toHaveLength(2)
  })
})

describe('top table — opportunities holds steady across occupancy and pins on the same table and the same guest list (TT-49 A1)', () => {
  it('a top table of eight, three seats held by their correct role holders and five empty, on a list holding all eight roles', () => {
    const holders = roleHolders(8, 'a1-holder')
    const table = seatFirstN(8, holders, 3)
    const plan: RulePlan = { tables: [table], unseated: holders.slice(3) }

    expect(topTableRule.evaluate(plan).opportunities).toBe(8)
  })

  it('the same list, fully seated and then entirely empty, reports the same opportunities both times', () => {
    const holders = roleHolders(8, 'a1-same-list')
    const filled: RulePlan = { tables: [seatFirstN(8, holders, 8)], unseated: [] }
    const empty: RulePlan = { tables: [emptyTopTable(8)], unseated: holders }

    expect(topTableRule.evaluate(filled).opportunities).toBe(8)
    expect(topTableRule.evaluate(empty).opportunities).toBe(8)
  })

  it('the same fully-seated table with four of the eight occupants pinned', () => {
    const holders = roleHolders(8, 'a1-pinned')
    const table = withPinned(seatFirstN(8, holders, 8), [0, 1, 2, 3])

    expect(topTableRule.evaluate({ tables: [table], unseated: [] }).opportunities).toBe(8)
  })
})

describe('top table — an empty top table on a guest list holding its protocol roles scores nought rather than dropping out of the mean (TT-49 A2)', () => {
  it('a top table of six, every seat empty, and the guest list (unseated) holding all six roles topTableRoleOrder(6) names', () => {
    const holders = roleHolders(6, 'a2-six')
    const plan: RulePlan = { tables: [emptyTopTable(6)], unseated: holders }

    const { findings, opportunities, missed } = topTableRule.evaluate(plan)

    expect(opportunities).toBe(6)
    expect(missed).toBe(6)
    expect(findings).toEqual([])
  })

  it('a top table of eight, every seat empty, and the guest list holding all eight roles', () => {
    const holders = roleHolders(8, 'a2-eight')
    const plan: RulePlan = { tables: [emptyTopTable(8)], unseated: holders }

    const { findings, opportunities, missed } = topTableRule.evaluate(plan)

    expect(opportunities).toBe(8)
    expect(missed).toBe(8)
    expect(findings).toEqual([])
  })
})

describe('top table — an empty seat is missed only when the guest list holds that seat\'s protocol role (TT-49 A4)', () => {
  it('a top table of six, every seat empty, and a guest list holding no protocol role at all (everyone "guest", seated on a round table) misses nothing', () => {
    const roundTable: SeatedTable = {
      id: 'round-1',
      kind: 'round',
      number: 1,
      label: 'Table 1',
      capacity: 4,
      seats: [
        { guest: makeGuest('r1-a'), pinned: false },
        { guest: makeGuest('r1-b'), pinned: false },
        null,
        null,
      ],
      overflow: [],
    }
    const plan: RulePlan = { tables: [emptyTopTable(6), roundTable], unseated: [] }

    const { findings, opportunities, missed } = topTableRule.evaluate(plan)

    expect(opportunities).toBe(6)
    expect(missed).toBe(0)
    expect(findings).toEqual([])
  })

  it('a top table of six holding only the couple in their correct seats, the guest list naming only bride and groom, the rest of the table empty', () => {
    const roles6 = topTableRoleOrder(6)
    const groomIndex = roles6.indexOf(GROOM)
    const brideIndex = roles6.indexOf(BRIDE)
    const groomGuest = makeGuest('a4-groom', { role: GROOM })
    const brideGuest = makeGuest('a4-bride', { role: BRIDE })
    const seats: (Seat | null)[] = new Array<Seat | null>(6).fill(null)
    seats[groomIndex] = { guest: groomGuest, pinned: false }
    seats[brideIndex] = { guest: brideGuest, pinned: false }
    const table: SeatedTable = { id: 'top', kind: 'top', number: null, label: 'Top table', capacity: 6, seats, overflow: [] }

    const { findings, opportunities, missed } = topTableRule.evaluate({ tables: [table], unseated: [] })

    expect(opportunities).toBe(6)
    expect(missed).toBe(0)
    expect(findings).toEqual([])
  })

  it('the same list and table, but the bride is genuinely unseated (plan.unseated) and her seat is the one left empty — that seat alone is missed', () => {
    const roles6 = topTableRoleOrder(6)
    const groomIndex = roles6.indexOf(GROOM)
    const groomGuest = makeGuest('a4-groom-2', { role: GROOM })
    const brideGuest = makeGuest('a4-bride-2', { role: BRIDE })
    // The bride's seat is left null throughout: she is on the guest list, but as `plan.unseated`
    // rather than in it.
    const seats: (Seat | null)[] = new Array<Seat | null>(6).fill(null)
    seats[groomIndex] = { guest: groomGuest, pinned: false }
    const table: SeatedTable = { id: 'top', kind: 'top', number: null, label: 'Top table', capacity: 6, seats, overflow: [] }
    const plan: RulePlan = { tables: [table], unseated: [brideGuest] }

    const { findings, opportunities, missed } = topTableRule.evaluate(plan)

    expect(opportunities).toBe(6)
    expect(missed).toBe(1)
    expect(findings).toEqual([])
  })
})

describe('top table — a pinned seat is never missed, and the pin does not move opportunities (TT-49 A5, TT-14)', () => {
  it('a top table of eight, every occupant pinned, reports the full capacity as opportunities and nothing missed', () => {
    const holders = roleHolders(8, 'a5-holder')
    const table = withPinned(seatFirstN(8, holders, 8), [0, 1, 2, 3, 4, 5, 6, 7])

    const { findings, opportunities, missed } = topTableRule.evaluate({ tables: [table], unseated: [] })

    expect(opportunities).toBe(8)
    expect(missed).toBe(0)
    expect(findings).toEqual([])
  })
})

describe('top table — the opportunities contract holds on every scenario above that carries a real guest list (TT-49 A7; contract.ts)', () => {
  function sixEmptyRoleHeldPlan(): RulePlan {
    return { tables: [emptyTopTable(6)], unseated: roleHolders(6, 'a7-six') }
  }

  function sixEmptyNoRolePlan(): RulePlan {
    return { tables: [emptyTopTable(6)], unseated: [] }
  }

  function eightMixedPlan(): RulePlan {
    const table: SeatedTable = {
      id: 'top',
      kind: 'top',
      number: null,
      label: 'Top table',
      capacity: 8,
      seats: [
        { guest: makeGuest('a7-a'), pinned: false },
        { guest: makeGuest('a7-b'), pinned: false },
        { guest: makeGuest('a7-c'), pinned: true },
        null,
        null,
        null,
        null,
        null,
      ],
      overflow: [],
    }
    return { tables: [table], unseated: [] }
  }

  function eightSwappedPlan(): RulePlan {
    const roles = topTableRoleOrder(8)
    const groomSeat = roles.indexOf(GROOM)
    const brideSeat = roles.indexOf(BRIDE)
    const table = swapSeats(topTableSeatedByProtocol(8), groomSeat, brideSeat)
    return { tables: [table], unseated: [] }
  }

  const fixtures: [string, RulePlan][] = [
    ['a top table of six, empty, on a list holding all six roles', sixEmptyRoleHeldPlan()],
    ['a top table of six, empty, on a list holding no protocol role', sixEmptyNoRolePlan()],
    ['a top table of eight with two unpinned interlopers, one pinned occupant, five empty seats', eightMixedPlan()],
    ["a top table of eight with the groom and bride swapped into each other's seats", eightSwappedPlan()],
  ]

  it.each(fixtures)('%s: findings.length <= missed <= opportunities', (_name, plan) => {
    const { findings, opportunities, missed } = topTableRule.evaluate(plan)

    expect(findings.length).toBeLessThanOrEqual(missed)
    expect(missed).toBeLessThanOrEqual(opportunities)
  })
})

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

describe('top table — deterministic, order-independent and non-mutating (TT-49 A8; docs/engineering-standards.md)', () => {
  function buildAssessedPlan(): RulePlan {
    const holders = roleHolders(6, 'a8-six')
    return { tables: [emptyTopTable(6)], unseated: holders }
  }

  it('two separately-built but equal plans give deeply equal assessments', () => {
    expect(topTableRule.evaluate(buildAssessedPlan())).toEqual(topTableRule.evaluate(buildAssessedPlan()))
  })

  it('neither throws nor mutates a deeply frozen plan', () => {
    const frozen = deepFreeze(buildAssessedPlan())

    expect(() => topTableRule.evaluate(frozen)).not.toThrow()
  })
})

const DIR = dirname(fileURLToPath(import.meta.url))

type ScenarioFixture = { meta: { tables: RoomConfig }; guests: Guest[] }

function readScenario(id: ScenarioId): ScenarioFixture {
  const path = join(DIR, '../../../public/scenarios', `${id}.json`)
  return JSON.parse(readFileSync(path, 'utf8')) as ScenarioFixture
}

describe('top table — quiet on the real top table allocate produces for each shipped scenario, and every chance the room gave is taken (KB-3; TT-49 A6, A11)', () => {
  it.each(['small-and-cosy', 'adding-up', 'celebrity-scale'] as const)(
    "%s: the solver's own top table breaks no protocol rule, and misses no chance the room gave it",
    (id) => {
      const { meta, guests } = readScenario(id)
      const plan = allocate(meta.tables, guests, [])

      const { findings, opportunities, missed } = topTableRule.evaluate(plan)

      expect(findings).toEqual([])
      expect(missed).toBe(0)
      expect(opportunities).toBe(meta.tables.topTableSeats)
    },
  )

  it("Adding up's top table of six, filled from the middle out, is exactly as protocol-clean as a full eight (KB-4)", () => {
    const { meta, guests } = readScenario('adding-up')
    const plan = allocate(meta.tables, guests, [])
    const top = plan.tables.find((table) => table.id === 'top')

    if (!top) throw new Error("expected Adding up's room to carry a top table")
    expect(top.capacity).toBe(6)
    const { findings, missed } = topTableRule.evaluate({ tables: [top], unseated: plan.unseated })
    expect(findings).toEqual([])
    expect(missed).toBe(0)
  })
})
