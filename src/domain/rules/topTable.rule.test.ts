import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { rule as topTableRule } from './topTable.rule'
import { allocate } from '../allocate'
import { planOccupancy, seatPins, topTableRoleOrder } from '../seating'
import type { Seat, SeatedTable } from '../seating'
import { PROTOCOL_ROLES } from '../types'
import type { Guest, RoomConfig } from '../types'
import type { ScenarioId } from '../scenarios'
import type { RulePlan } from './contract'
import { evaluateRegistered } from './registry'
import { scorePlan } from './score'

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
 * TT-49 (KB-8): a top-table seat is an opportunity when either `topTableRoleOrder(capacity)`
 * names it a protocol role that somebody on the guest list — seated anywhere, in overflow, or in
 * `plan.unseated` — holds, OR the seat itself fires a finding under this rule (an unpinned
 * occupant who is not that seat's own role holder). A seat is missed when it fires a finding, or
 * when its own role is held and that role's holder is not seated *anywhere at the top table* —
 * not only not in this particular seat. Position decides only the seat that actually fires a
 * finding; every other seat judges presence.
 *
 * That distinction is TT-49's fourth defect, found after the pin-position fix above landed. A pin
 * names a table, never a seat: `seatPins` drops a pinned guest into the first free seat in
 * guest-list order, and `allocate`'s own phase assigns its own indices, so which seat a pinned
 * role holder actually lands in is a builder artefact, not a fact about the plan. Checking a
 * seat's occupant against that seat's own name made the artefact visible in the score: hand-pin a
 * second, unrelated guest onto the same top table and the first guest's seat index could shift,
 * flipping a miss to a hit — Fit moved between 0 and 1 with nothing about the plan's correctness
 * changing, and reordering the guest list alone could move it the same way. Judging presence
 * across the whole top table instead removes the seat index from the question.
 *
 * A finding therefore always counts as both an opportunity and a miss, by construction, so
 * `findings.length <= missed <= opportunities` cannot fail the way it once did for an unpinned
 * interloper sitting in a seat whose own role nobody on the guest list held — that seat used to be
 * a miss with no opportunity to have earned it, because opportunities came from the guest list
 * alone. Occupancy alone never decides opportunities, and a table wider than eight seats can never
 * carry more than eight, because `topTableRoleOrder` never names a role past the eighth.
 * `evaluate` takes the full `RulePlan` (tables and `unseated`), not just `{ tables }`.
 *
 * TT-14's pin exemption is about findings, not chances: a pinned seat never fires, whatever it
 * holds, but pinning does not manufacture a chance taken. A wrongly-seated occupant — pinned or
 * not — still costs only the seat they are actually sitting in when that seat itself fires a
 * finding; their own designated seat is not a second miss once they are present anywhere at this
 * same top table, because presence, not placement, is what an otherwise-quiet seat judges.
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

describe("top table — opportunities does not move when a held seat is filled, emptied or pinned (TT-49)", () => {
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

describe('top table — a pinned seat is a missed chance only when it does not hold the guest list\'s actual role holder (TT-49, TT-14)', () => {
  it('a top table of eight, every occupant pinned to their own correct protocol seat, reports the full capacity as opportunities and nothing missed', () => {
    const holders = roleHolders(8, 'all-pinned-holder')
    const table = withPinned(seatFirstN(8, holders, 8), [0, 1, 2, 3, 4, 5, 6, 7])

    const { findings, opportunities, missed } = topTableRule.evaluate({ tables: [table], unseated: [] })

    expect(opportunities).toBe(8)
    expect(missed).toBe(0)
    expect(findings).toEqual([])
  })

  it("a civilian hand-pinned into the chief bridesmaid's seat costs the chance but stays quiet — the chief bridesmaid herself is on the guest list, just not seated, and the pin exempts the finding, not the miss", () => {
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

    // The seat is a genuine opportunity (the chief bridesmaid is on the guest list) and the
    // civilian pinned into it is not her, so it is missed — but the pin still buys quiet: no
    // finding, exactly as TT-14 decided. A plan that scored this seat as a chance taken would
    // let displacing a role holder and hand-pinning someone else in score no worse than leaving
    // the seat alone, which is the inversion TT-49 exists to close.
    expect(opportunities).toBe(8)
    expect(missed).toBe(1)
    expect(findings).toEqual([])
  })
})

describe('top table — TT-49: displacing a role holder and hand-pinning someone else into the empty seat must not score the plan higher than leaving it displaced (KB-8, through the real allocate and registry)', () => {
  it('room 3×8 + top 8, a guest list holding all eight protocol roles: plan C (the best man displaced, plus a civilian pinned into his empty seat) does not score above plan B (the best man simply displaced)', () => {
    const room: RoomConfig = { roundTables: 3, seatsEach: 8, topTableSeats: 8 }
    const roleHoldersList = PROTOCOL_ROLES.map((role, index) => makeGuest(`inversion-role-${index}`, { role }))
    const bestMan = roleHoldersList.find((guest) => guest.role === PROTOCOL_ROLES[7])
    if (!bestMan) throw new Error('expected a best man among the eight protocol role holders')
    const civilian = makeGuest('inversion-civilian')
    const guests = [...roleHoldersList, civilian]

    // Plan A: nothing pinned — every role holder lands in their own top-table seat.
    const planA = allocate(room, guests, [])
    // Plan B: the best man hand-pinned away to a round table, leaving his top-table seat empty —
    // a genuine miss, quiet, no finding.
    const planB = allocate(room, guests, [{ guestId: bestMan.id, tableId: 'round-1' }])
    // Plan C: plan B, plus a civilian hand-pinned into the best man's now-empty seat — still
    // nobody the seat's role belongs to, and still quiet, but the score must not treat this as a
    // chance taken.
    const planC = allocate(room, guests, [
      { guestId: bestMan.id, tableId: 'round-1' },
      { guestId: civilian.id, tableId: 'top' },
    ])

    const scoreA = scorePlan(evaluateRegistered(planA), planOccupancy(planA)).score
    const scoreB = scorePlan(evaluateRegistered(planB), planOccupancy(planB)).score
    const scoreC = scorePlan(evaluateRegistered(planC), planOccupancy(planC)).score

    if (scoreA === null || scoreB === null || scoreC === null) {
      throw new Error('expected every plan here to have guests and at least one dimension to score')
    }

    // The inversion this ticket exists to close: plan C is plan B plus one more pin, and it must
    // not score above plan B. A figures-only test asserting one exact number would have passed
    // before the fix too, by coincidence of the numbers involved — this is an ordering property,
    // and it is what actually holds it.
    expect(scoreC).toBeLessThanOrEqual(scoreB)
    // Both B and C genuinely have the best man out of his seat, so both must fall short of the
    // fully-correct plan A.
    expect(scoreB).toBeLessThan(scoreA)
    expect(scoreC).toBeLessThan(scoreA)
  })
})

describe('top table — TT-49 (fourth defect): a pin names a table, never a seat, so the free seat a builder drops a pinned guest into cannot be allowed to decide this dimension (KB-4; KB-8)', () => {
  it('seatPins: hand-pinning a second, role-free guest to the same top table must not raise the fit a lone bride pin already earns', () => {
    const room: RoomConfig = { roundTables: 0, seatsEach: 0, topTableSeats: 2 }
    const filler = makeGuest('fourth-defect-filler')
    const bride = makeGuest('fourth-defect-bride', { role: BRIDE })
    const guests = [filler, bride]

    const brideOnly = topTableRule.evaluate(seatPins(room, guests, [{ guestId: bride.id, tableId: 'top' }]))
    const brideAndFiller = topTableRule.evaluate(
      seatPins(room, guests, [
        { guestId: bride.id, tableId: 'top' },
        { guestId: filler.id, tableId: 'top' },
      ]),
    )

    // A1: opportunities come from who holds a role, never from who is pinned where.
    expect(brideAndFiller.opportunities).toBe(brideOnly.opportunities)
    expect(brideOnly.opportunities).toBeGreaterThan(0)
    // The regression this closes: under a seat-position check, hand-pinning the filler could
    // shuffle which free seat the bride lands in and flip a miss to a hit by accident of guest-list
    // order, raising Fit with nothing about the plan genuinely improving. An ordering assertion,
    // not a hard-coded figure — a fixed-number test would have passed before this fix too, for
    // whichever pair of numbers this fixture happened to produce.
    expect(brideAndFiller.missed).toBeGreaterThanOrEqual(brideOnly.missed)
  })

  it('allocate: hand-pinning a third, role-free guest to the same top table must not raise the fit the groom and a filler pin already earn', () => {
    const room: RoomConfig = { roundTables: 1, seatsEach: 4, topTableSeats: 3 }
    const secondFiller = makeGuest('fourth-defect-second-filler')
    const filler = makeGuest('fourth-defect-allocate-filler')
    const groom = makeGuest('fourth-defect-groom', { role: GROOM })
    const guests = [secondFiller, filler, groom]

    const groomAndFiller = topTableRule.evaluate(
      allocate(room, guests, [
        { guestId: filler.id, tableId: 'top' },
        { guestId: groom.id, tableId: 'top' },
      ]),
    )
    const allThreePinned = topTableRule.evaluate(
      allocate(room, guests, [
        { guestId: filler.id, tableId: 'top' },
        { guestId: groom.id, tableId: 'top' },
        { guestId: secondFiller.id, tableId: 'top' },
      ]),
    )

    expect(allThreePinned.opportunities).toBe(groomAndFiller.opportunities)
    expect(groomAndFiller.opportunities).toBeGreaterThan(0)
    expect(allThreePinned.missed).toBeGreaterThanOrEqual(groomAndFiller.missed)
  })
})

describe('top table — TT-49 (fourth defect): the order a guest list happens to be built in must not move this dimension (KB-8 — the property the fourth defect actually broke)', () => {
  it('seatPins: the same room, guests and pins report the same opportunities, missed and findings whichever order the two guests are listed in', () => {
    const room: RoomConfig = { roundTables: 0, seatsEach: 0, topTableSeats: 2 }
    const filler = makeGuest('order-stable-filler')
    const bride = makeGuest('order-stable-bride', { role: BRIDE })
    const pins = [
      { guestId: filler.id, tableId: 'top' },
      { guestId: bride.id, tableId: 'top' },
    ]

    const fillerFirst = topTableRule.evaluate(seatPins(room, [filler, bride], pins))
    const brideFirst = topTableRule.evaluate(seatPins(room, [bride, filler], pins))

    expect(brideFirst.opportunities).toBe(fillerFirst.opportunities)
    expect(brideFirst.missed).toBe(fillerFirst.missed)
    expect(brideFirst.findings).toEqual(fillerFirst.findings)
  })

  it('allocate: the same room, guests and pins report the same opportunities, missed and findings whichever order the three guests are listed in', () => {
    const room: RoomConfig = { roundTables: 1, seatsEach: 4, topTableSeats: 3 }
    const secondFiller = makeGuest('order-stable-second-filler')
    const filler = makeGuest('order-stable-allocate-filler')
    const groom = makeGuest('order-stable-groom', { role: GROOM })
    const pins = [
      { guestId: filler.id, tableId: 'top' },
      { guestId: groom.id, tableId: 'top' },
      { guestId: secondFiller.id, tableId: 'top' },
    ]

    const listOrderA = topTableRule.evaluate(allocate(room, [secondFiller, filler, groom], pins))
    const listOrderB = topTableRule.evaluate(allocate(room, [groom, secondFiller, filler], pins))

    expect(listOrderB.opportunities).toBe(listOrderA.opportunities)
    expect(listOrderB.missed).toBe(listOrderA.missed)
    expect(listOrderB.findings).toEqual(listOrderA.findings)
  })
})

describe('top table — TT-49: a genuinely unseated role holder and an unpinned civilian sitting in her seat is one opportunity and one miss, not two (KB-8)', () => {
  it('a top table of two, the bride unseated and a role-free civilian unpinned in her own seat: opportunities 1, missed 1, findings 1 — the seat earns its opportunity once, from the OR of "role held" and "fires a finding", never from both at once', () => {
    const roles = topTableRoleOrder(2)
    const brideIndex = roles.indexOf(BRIDE)
    const civilian = makeGuest('double-count-civilian')
    const seats: (Seat | null)[] = new Array<Seat | null>(2).fill(null)
    seats[brideIndex] = { guest: civilian, pinned: false }
    const table: SeatedTable = { id: 'top', kind: 'top', number: null, label: 'Top table', capacity: 2, seats, overflow: [] }
    const bride = makeGuest('double-count-bride', { role: BRIDE })
    const plan: RulePlan = { tables: [table], unseated: [bride] }

    const { findings, opportunities, missed } = topTableRule.evaluate(plan)

    expect(findings).toHaveLength(1)
    expect(opportunities).toBe(1)
    expect(missed).toBe(1)
    // Explicit, on top of the exact figures above: a naive OR-as-sum implementation (incrementing
    // once for "role held" and again for "seat fires a finding") would still pass a bare inequality
    // check here since findings/missed/opportunities would inflate together (1 <= 2 <= 2) — the
    // exact figures above are what actually catches that, this is the invariant TT-49 leans on.
    expect(findings.length).toBeLessThanOrEqual(missed)
    expect(missed).toBeLessThanOrEqual(opportunities)
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

describe('top table — a role holder wrongly seated costs only the seat they are sitting in; their own seat is saved by their presence elsewhere at the same top table (TT-49, corrected)', () => {
  it('two role holders unpinned in seats that are themselves genuine opportunities (each held by a third guest), one pinned civilian, and their own two seats left empty: two findings, two misses — not four, because each wanderer is seated somewhere at this top table', () => {
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
        null, // seat 6 (mother of the groom) — her own seat, held, empty, but she is seated at seat 1 —
        // present at this top table, just in the wrong chair — so this seat is not missed
        null, // seat 7 (best man) — his own seat, held, empty, but he is seated at seat 0 for the same reason
      ],
      overflow: [],
    }
    const plan: RulePlan = { tables: [table], unseated: [rightfulChiefBridesmaid, rightfulFatherOfGroom] }

    const { findings, opportunities, missed } = topTableRule.evaluate(plan)

    expect(findings).toHaveLength(2)
    expect([...findings.flatMap((finding) => finding.guestIds)].sort()).toEqual(
      ['wandering-best-man', 'wandering-mother-of-groom'].sort(),
    )
    // Opportunities are unaffected (seats 0, 1, 6 and 7 are all genuine chances, same as before);
    // missed drops from four to two, because seat 6 and seat 7 are saved by their own occupants
    // being present elsewhere at this table rather than absent from it altogether — the case a
    // seat-position check could not tell apart from a role holder pinned away to a round table.
    expect(opportunities).toBe(4)
    expect(missed).toBe(2)
  })
})

describe("top table — an unpinned interloper in a seat whose own role nobody holds is still an opportunity, not only a miss (TT-49: the case that broke the invariant twice)", () => {
  it("a top table of six: an unpinned non-protocol occupant sits in a seat whose own protocol role nobody on the guest list holds, while the one role the list does hold — the bride's — is genuinely unseated. The interloper's own seat is an opportunity because it fires a finding, not because its role is held, so findings.length <= missed <= opportunities still holds", () => {
    const roles6 = topTableRoleOrder(6)
    const brideIndex = roles6.indexOf(BRIDE)
    const interloperIndex = brideIndex === 0 ? 1 : 0
    const bride = makeGuest('invariant-bride', { role: BRIDE })
    const interloper = makeGuest('invariant-interloper')
    const seats: (Seat | null)[] = new Array<Seat | null>(6).fill(null)
    seats[interloperIndex] = { guest: interloper, pinned: false }
    const table: SeatedTable = { id: 'top', kind: 'top', number: null, label: 'Top table', capacity: 6, seats, overflow: [] }
    const plan: RulePlan = { tables: [table], unseated: [bride] }

    const { findings, opportunities, missed } = topTableRule.evaluate(plan)

    expect(findings).toHaveLength(1)
    expect(findings[0]?.guestIds).toEqual(['invariant-interloper'])
    // The interloper's own seat's role is held by nobody on this guest list, so it earns its
    // opportunity only by firing a finding — the case that broke the invariant before this fix,
    // and the bride's seat is the one genuinely held opportunity/miss the old, correct half of
    // the rule already counted.
    expect(opportunities).toBe(2)
    expect(missed).toBe(2)
    expect(findings.length).toBeLessThanOrEqual(missed)
    expect(missed).toBeLessThanOrEqual(opportunities)
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

      // Opportunities come from the guest list, not from capacity (TT-49, KB-8): the roles
      // `topTableRoleOrder` names for this table's width, intersected with the roles this
      // scenario's guest list actually holds — never `meta.tables.topTableSeats` on its own,
      // which is the withdrawn capacity-flat denominator and would pass here only because every
      // shipped scenario happens to hold all eight protocol roles.
      const rolesAtThisTable = topTableRoleOrder(meta.tables.topTableSeats)
      const rolesHeld = new Set(guests.map((guest) => guest.role))
      const expectedOpportunities = rolesAtThisTable.filter((role) => rolesHeld.has(role)).length

      expect(findings).toEqual([])
      expect(missed).toBe(0)
      expect(opportunities).toBe(expectedOpportunities)
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
