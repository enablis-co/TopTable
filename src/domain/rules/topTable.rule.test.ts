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
 * TT-49 (KB-8): a top-table seat is an opportunity when `topTableRoleOrder(capacity)` names it a
 * protocol role and somebody on the guest list — seated anywhere, in overflow, or in
 * `plan.unseated` — holds that role. Occupancy and pins never decide it, and a table wider than
 * eight seats can never carry more than eight opportunities, because `topTableRoleOrder` never
 * names a role past the eighth.
 *
 * Missed is counted seat by seat, not gated behind that seat being an opportunity: an empty seat
 * is missed only when it is one (KB-8's "given the guest list"), but an occupied, unpinned seat
 * holding someone who is not that seat's own role holder is a miss and a finding regardless of
 * whether that seat's own role is held by anyone (findings are untouched by this ticket). So a
 * plan can report more misses than opportunities where an unpinned occupant sits in a seat whose
 * own role nobody holds — a state neither `allocate` nor a hand pin can ever produce (a hand pin
 * exempts the seat entirely, and `allocate` only ever seats a role holder in their own seat), which
 * is why every fixture below that puts an unpinned wrong occupant in a seat also gives that seat's
 * own role a holder somewhere else on the list. `evaluate` now takes the full `RulePlan` (tables
 * and `unseated`), not just `{ tables }`.
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
 *  `plan.unseated` so the guest list "holds" every role this table has without occupying a seat.
 *  Capped at eight guests, whatever `capacity` is, because `topTableRoleOrder` never names more. */
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
  it("the groom in the bride's seat and the bride in the groom's seat both fire, and nobody else does — the guest list holds every role this table has, so every chance the table had was taken", () => {
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

describe('top table — quiet when the room has no top table at all, and there is nothing this rule could have got right (KB-8)', () => {
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

  it('reports 0 opportunities and 0 missed — this rule had no chance to give', () => {
    const roundOnly: SeatedTable = {
      id: 'round-1',
      kind: 'round',
      number: 1,
      label: 'Table 1',
      capacity: 8,
      seats: new Array(8).fill(null),
      overflow: [],
    }

    const { opportunities, missed } = topTableRule.evaluate({ tables: [roundOnly], unseated: [] })

    expect(opportunities).toBe(0)
    expect(missed).toBe(0)
  })
})

describe("top table — opportunities holds steady across occupancy and pins on the same table and the same guest list (TT-49)", () => {
  it('a top table of eight, three seats held by their correct role holders and five empty, on a list holding all eight roles', () => {
    const holders = roleHolders(8, 'steady-holder')
    const table = seatFirstN(8, holders, 3)
    const plan: RulePlan = { tables: [table], unseated: holders.slice(3) }

    expect(topTableRule.evaluate(plan).opportunities).toBe(8)
  })

  it('the same list, fully seated and then entirely empty, reports the same opportunities both times', () => {
    const holders = roleHolders(8, 'steady-same-list')
    const filled: RulePlan = { tables: [seatFirstN(8, holders, 8)], unseated: [] }
    const empty: RulePlan = { tables: [emptyTopTable(8)], unseated: holders }

    expect(topTableRule.evaluate(filled).opportunities).toBe(8)
    expect(topTableRule.evaluate(empty).opportunities).toBe(8)
  })

  it('the same fully-seated table with four of the eight occupants pinned', () => {
    const holders = roleHolders(8, 'steady-pinned')
    const table = withPinned(seatFirstN(8, holders, 8), [0, 1, 2, 3])

    expect(topTableRule.evaluate({ tables: [table], unseated: [] }).opportunities).toBe(8)
  })
})

describe('top table — an empty top table on a guest list holding its protocol roles scores nought rather than dropping out of the mean (TT-49; KB-8)', () => {
  it('a top table of six, every seat empty, and the guest list (unseated) holding all six roles topTableRoleOrder(6) names', () => {
    const holders = roleHolders(6, 'nought-six')
    const plan: RulePlan = { tables: [emptyTopTable(6)], unseated: holders }

    const { findings, opportunities, missed } = topTableRule.evaluate(plan)

    expect(opportunities).toBe(6)
    expect(missed).toBe(6)
    expect(findings).toEqual([])
  })

  it('a top table of eight, empty, and the guest list holding all eight roles', () => {
    const holders = roleHolders(8, 'nought-eight')
    const plan: RulePlan = { tables: [emptyTopTable(8)], unseated: holders }

    const { findings, opportunities, missed } = topTableRule.evaluate(plan)

    expect(opportunities).toBe(8)
    expect(missed).toBe(8)
    expect(findings).toEqual([])
  })
})

describe("top table — a seat is only ever an opportunity when somebody on the guest list holds that seat's protocol role (TT-49; KB-8)", () => {
  it('a top table of six, every seat empty, and a guest list holding no protocol role at all (everyone "guest", seated on a round table): no chance was ever on offer', () => {
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

    expect(opportunities).toBe(0)
    expect(missed).toBe(0)
    expect(findings).toEqual([])
  })

  it('a top table of six holding only the couple in their correct seats, the guest list naming only bride and groom: two opportunities, not six', () => {
    const roles6 = topTableRoleOrder(6)
    const groomIndex = roles6.indexOf(GROOM)
    const brideIndex = roles6.indexOf(BRIDE)
    const groomGuest = makeGuest('only-couple-groom', { role: GROOM })
    const brideGuest = makeGuest('only-couple-bride', { role: BRIDE })
    const seats: (Seat | null)[] = new Array<Seat | null>(6).fill(null)
    seats[groomIndex] = { guest: groomGuest, pinned: false }
    seats[brideIndex] = { guest: brideGuest, pinned: false }
    const table: SeatedTable = { id: 'top', kind: 'top', number: null, label: 'Top table', capacity: 6, seats, overflow: [] }

    const { findings, opportunities, missed } = topTableRule.evaluate({ tables: [table], unseated: [] })

    expect(opportunities).toBe(2)
    expect(missed).toBe(0)
    expect(findings).toEqual([])
  })

  it("the same list and table, but the bride is genuinely unseated (plan.unseated) and her seat is the one left empty — that seat alone is missed, out of the two opportunities this list gives", () => {
    const roles6 = topTableRoleOrder(6)
    const groomIndex = roles6.indexOf(GROOM)
    const groomGuest = makeGuest('bride-absent-groom', { role: GROOM })
    const brideGuest = makeGuest('bride-absent-bride', { role: BRIDE })
    // The bride's seat is left null throughout: she is on the guest list, but as `plan.unseated`
    // rather than in it.
    const seats: (Seat | null)[] = new Array<Seat | null>(6).fill(null)
    seats[groomIndex] = { guest: groomGuest, pinned: false }
    const table: SeatedTable = { id: 'top', kind: 'top', number: null, label: 'Top table', capacity: 6, seats, overflow: [] }
    const plan: RulePlan = { tables: [table], unseated: [brideGuest] }

    const { findings, opportunities, missed } = topTableRule.evaluate(plan)

    expect(opportunities).toBe(2)
    expect(missed).toBe(1)
    expect(findings).toEqual([])
  })
})

describe('top table — opportunities never counts a seat past the eighth, however wide the table (TT-49; KB-4)', () => {
  it('a top table of ten seats, every seat empty, on a guest list holding all eight protocol roles: opportunities and missed both cap at eight', () => {
    const holders = roleHolders(10, 'wide-empty')
    const plan: RulePlan = { tables: [emptyTopTable(10)], unseated: holders }

    const { findings, opportunities, missed } = topTableRule.evaluate(plan)

    expect(opportunities).toBe(8)
    expect(missed).toBe(8)
    expect(findings).toEqual([])
  })

  it('the same ten-seat table fully occupied — eight correct role holders and two guests hand-pinned into the seats past the eighth — still reports eight opportunities, not ten', () => {
    const holders = roleHolders(10, 'wide-full')
    const base = seatFirstN(10, holders, 8)
    const table: SeatedTable = {
      ...base,
      seats: base.seats.map((seat, index) => {
        if (index === 8) return { guest: makeGuest('wide-extra-a'), pinned: true }
        if (index === 9) return { guest: makeGuest('wide-extra-b'), pinned: true }
        return seat
      }),
    }

    const { findings, opportunities, missed } = topTableRule.evaluate({ tables: [table], unseated: [] })

    expect(opportunities).toBe(8)
    expect(missed).toBe(0)
    expect(findings).toEqual([])
  })
})

describe('top table — a pinned seat is never missed, whatever it holds (TT-49, TT-14)', () => {
  it('a top table of eight, every occupant pinned, reports the full capacity as opportunities and nothing missed', () => {
    const holders = roleHolders(8, 'all-pinned-holder')
    const table = withPinned(seatFirstN(8, holders, 8), [0, 1, 2, 3, 4, 5, 6, 7])

    const { findings, opportunities, missed } = topTableRule.evaluate({ tables: [table], unseated: [] })

    expect(opportunities).toBe(8)
    expect(missed).toBe(0)
    expect(findings).toEqual([])
  })

  it("a civilian hand-pinned into the chief bridesmaid's seat is quiet and not a miss, even though that seat is a genuine opportunity — the chief bridesmaid herself is on the guest list, just not seated", () => {
    const seated = topTableSeatedByProtocol(8)
    const chiefBridesmaidSeat = seated.seats[0]
    if (!chiefBridesmaidSeat) throw new Error('expected the chief bridesmaid seat to be filled')
    const chiefBridesmaid = chiefBridesmaidSeat.guest
    const civilian = makeGuest('pinned-into-wrong-seat')
    const table: SeatedTable = {
      ...seated,
      seats: seated.seats.map((seat, index) => (index === 0 ? { guest: civilian, pinned: true } : seat)),
    }
    const plan: RulePlan = { tables: [table], unseated: [chiefBridesmaid] }

    const { findings, opportunities, missed } = topTableRule.evaluate(plan)

    expect(opportunities).toBe(8)
    expect(missed).toBe(0)
    expect(findings).toEqual([])
  })
})

describe('top table — a role holder hand-pinned away to a round table leaves their protocol seat empty, and that empty seat is still a missed chance, with no finding to explain it (KB-4; KB-8)', () => {
  it("the bride pinned to a round table leaves the top table's bride seat as the plan's one missed chance, and raises no finding", () => {
    const room: RoomConfig = { roundTables: 1, seatsEach: 4, topTableSeats: 8 }
    const bride = makeGuest('pinned-away-bride', { role: BRIDE })
    const plan = seatPins(room, [bride], [{ guestId: 'pinned-away-bride', tableId: 'round-1' }])

    const { findings, opportunities, missed } = topTableRule.evaluate(plan)

    expect(opportunities).toBe(1)
    expect(missed).toBe(1)
    expect(findings).toEqual([])
  })
})

describe("top table — a role holder wrongly seated can cost two chances at once: the seat they are wrongly sitting in, and their own seat left empty (TT-49)", () => {
  it('two role holders unpinned in seats that are themselves genuine opportunities (each held by a third guest), one pinned civilian, and their own two seats left empty: two findings, four misses', () => {
    // Seat order (topTableRoleOrder(8)): 0 chief bridesmaid, 1 father of the groom,
    // 2 mother of the bride, 3 groom, 4 bride, 5 father of the bride, 6 mother of the groom,
    // 7 best man.
    const bestMan = makeGuest('wandering-best-man', { role: PROTOCOL_ROLES[7] })
    const motherOfGroom = makeGuest('wandering-mother-of-groom', { role: PROTOCOL_ROLES[6] })
    const civilian = makeGuest('pinned-civilian')
    // Present on the guest list but not seated: the guests who actually hold seat 0 and seat 1's
    // roles, so those two seats are genuine opportunities and not just findings with nothing to
    // miss (KB-8; the registry's own `buildViolatingPlan` fixture turns on the same shape).
    const rightfulChiefBridesmaid = makeGuest('rightful-chief-bridesmaid', { role: PROTOCOL_ROLES[0] })
    const rightfulFatherOfGroom = makeGuest('rightful-father-of-groom', { role: PROTOCOL_ROLES[1] })
    const table: SeatedTable = {
      id: 'top',
      kind: 'top',
      number: null,
      label: 'Top table',
      capacity: 8,
      seats: [
        { guest: bestMan, pinned: false }, // seat 0 (chief bridesmaid) — not his seat, unpinned: a finding, and a miss
        { guest: motherOfGroom, pinned: false }, // seat 1 (father of the groom) — likewise
        { guest: civilian, pinned: true }, // seat 2 (mother of the bride) — nobody holds this role, and it is pinned besides
        null, // seat 3 (groom) — nobody holds this role
        null, // seat 4 (bride) — nobody holds this role
        null, // seat 5 (father of the bride) — nobody holds this role
        null, // seat 6 (mother of the groom) — his own seat, held, empty: a second miss for him
        null, // seat 7 (best man) — his own seat, held, empty: a second miss for him
      ],
      overflow: [],
    }
    const plan: RulePlan = { tables: [table], unseated: [rightfulChiefBridesmaid, rightfulFatherOfGroom] }

    const { findings, opportunities, missed } = topTableRule.evaluate(plan)

    expect(findings).toHaveLength(2)
    expect([...findings.flatMap((finding) => finding.guestIds)].sort()).toEqual(
      ['wandering-best-man', 'wandering-mother-of-groom'].sort(),
    )
    expect(opportunities).toBe(4)
    expect(missed).toBe(4)
  })
})

describe('top table — the opportunities contract holds on every scenario above that carries a real guest list (contract.ts)', () => {
  function sixEmptyRoleHeldPlan(): RulePlan {
    return { tables: [emptyTopTable(6)], unseated: roleHolders(6, 'contract-six') }
  }

  function sixEmptyNoRolePlan(): RulePlan {
    return { tables: [emptyTopTable(6)], unseated: [] }
  }

  function tenEmptyRoleHeldPlan(): RulePlan {
    return { tables: [emptyTopTable(10)], unseated: roleHolders(10, 'contract-ten') }
  }

  function misplacedRoleHoldersPlan(): RulePlan {
    const bestMan = makeGuest('contract-best-man', { role: PROTOCOL_ROLES[7] })
    const motherOfGroom = makeGuest('contract-mother-of-groom', { role: PROTOCOL_ROLES[6] })
    const civilian = makeGuest('contract-civilian')
    const rightfulChiefBridesmaid = makeGuest('contract-rightful-chief-bridesmaid', { role: PROTOCOL_ROLES[0] })
    const rightfulFatherOfGroom = makeGuest('contract-rightful-father-of-groom', { role: PROTOCOL_ROLES[1] })
    const table: SeatedTable = {
      id: 'top',
      kind: 'top',
      number: null,
      label: 'Top table',
      capacity: 8,
      seats: [
        { guest: bestMan, pinned: false },
        { guest: motherOfGroom, pinned: false },
        { guest: civilian, pinned: true },
        null,
        null,
        null,
        null,
        null,
      ],
      overflow: [],
    }
    return { tables: [table], unseated: [rightfulChiefBridesmaid, rightfulFatherOfGroom] }
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
    ['a top table of ten, empty, on a list holding all eight protocol roles', tenEmptyRoleHeldPlan()],
    ['two role holders misplaced, unpinned, their own seats held by others still present, plus a pinned civilian', misplacedRoleHoldersPlan()],
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

describe('top table — deterministic, order-independent and non-mutating (docs/engineering-standards.md)', () => {
  function buildAssessedPlan(): RulePlan {
    const holders = roleHolders(6, 'deterministic-six')
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

describe('top table — quiet on the real top table allocate produces for each shipped scenario, and every chance the room gave is taken (KB-3; TT-49)', () => {
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
    // The whole plan, not just the top table: the rule's own guest-list scan has to see every
    // role holder wherever `allocate` actually put them (KB-4 seats a top table's overflow roles
    // at the nearest round table), or a role holder seated there is invisible to it and `missed`
    // reads low for a reason that has nothing to do with the rule being correct.
    const { findings, missed } = topTableRule.evaluate(plan)
    expect(findings).toEqual([])
    expect(missed).toBe(0)
  })
})
