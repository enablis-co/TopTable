import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { allocate } from '../allocate'
import { evaluateRegistered, registeredSeatGuard } from './registry'
import { hardViolations } from './engine'
import { PROTOCOL_ROLES } from '../types'
import type { Guest, Pin, RoomConfig } from '../types'
import type { ScenarioId } from '../scenarios'

/**
 * TT-14's "no change to the placement code" claim (TT-14; KB-1: "Auto-allocate satisfies the hard
 * ones"), made checkable: wiring the registered rules' guard into the solver must not change a
 * single placement `allocate` makes. Written from TT-14's acceptance criteria. Does not open
 * registry.ts or any rule file.
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

/** The two protocol roles KB-4's fixed order seats first at any top table, however small — the
 *  newlyweds occupy the middle-out order's innermost pair, so this pair alone reaches the top
 *  table even at a 2-seat one, unlike an arbitrary pair of protocol roles. */
function makeNewlyweds(): Guest[] {
  return [makeGuest('protocol-0', { role: 'bride' }), makeGuest('protocol-1', { role: 'groom' })]
}

const DIR = dirname(fileURLToPath(import.meta.url))

type ScenarioFixture = { meta: { tables: RoomConfig }; guests: Guest[] }

function readScenario(id: ScenarioId): ScenarioFixture {
  const path = join(DIR, '../../../public/scenarios', `${id}.json`)
  return JSON.parse(readFileSync(path, 'utf8')) as ScenarioFixture
}

describe('allocate with the registered rules wired in produces exactly the plan allocate would without them (TT-14, A10)', () => {
  it.each(['small-and-cosy', 'adding-up', 'celebrity-scale'] as const)(
    '%s: identical plans, with and without the guard',
    (id) => {
      const { meta, guests } = readScenario(id)

      const withRules = allocate(meta.tables, guests, [], { allowSeat: registeredSeatGuard() })
      const withoutRules = allocate(meta.tables, guests, [])

      expect(withRules).toEqual(withoutRules)
    },
  )

  it('holds even where capacity bites immediately and every placement is forced ("Small and cosy": 40 guests, 40 seats, no spare)', () => {
    const { meta, guests } = readScenario('small-and-cosy')

    const withRules = allocate(meta.tables, guests, [], { allowSeat: registeredSeatGuard() })
    const withoutRules = allocate(meta.tables, guests, [])

    expect(withRules).toEqual(withoutRules)
    expect(withRules.unseated).toEqual([])
  })

  it('holds for a hand-built room with pins and a full set of protocol roles, not only the three shipped scenarios', () => {
    const room: RoomConfig = { roundTables: 2, seatsEach: 4, topTableSeats: 8 }
    const protocolGuests = PROTOCOL_ROLES.map((role, i) => makeGuest(`protocol-${i}`, { role }))
    const fillers = Array.from({ length: 6 }, (_, i) => makeGuest(`filler-${i + 1}`))
    const guests = [...protocolGuests, ...fillers]
    const pins: Pin[] = [{ guestId: 'filler-1', tableId: 'round-2' }]

    const withRules = allocate(room, guests, pins, { allowSeat: registeredSeatGuard() })
    const withoutRules = allocate(room, guests, pins)

    expect(withRules).toEqual(withoutRules)
  })
})

/**
 * TT-47 (KB-1: "Auto-allocate already seats everyone it can, so it should clear this rule
 * wherever seats allow. Where seats ran out it reports that, as it does now, and the rule stays
 * quiet."). Written from TT-47's acceptance criteria. Does not open everyoneSeated.rule.ts,
 * allocate.ts or score.ts.
 *
 * Both rooms below carry a real top table, sized to exactly the number of protocol-role holders
 * on the guest list, so it fills completely — this is a room the product can actually produce
 * (`PlanScreen` requires at least a two-seat top table; `topTableSeats: 0` is not a reachable
 * configuration).
 */
describe('everyone-seated, over the real registry and the real solver (TT-47)', () => {
  it('a room with spare seats: allocate seats everyone it can, top table included, and the everyone-seated rule stays quiet', () => {
    const room: RoomConfig = { roundTables: 2, seatsEach: 5, topTableSeats: 2 }
    const fillers = Array.from({ length: 6 }, (_, i) => makeGuest(`filler-${i}`))
    const guests = [...makeNewlyweds(), ...fillers]

    const plan = allocate(room, guests, [], { allowSeat: registeredSeatGuard() })

    expect(plan.unseated).toEqual([])
    const report = evaluateRegistered(plan)
    expect(hardViolations(report).some((violation) => violation.ruleId === 'everyone-seated')).toBe(false)
  })

  it('a room short of seats: allocate seats what it can and leaves the rest in plan.unseated, and the rule stays quiet once every seat — including the top table — is full', () => {
    const room: RoomConfig = { roundTables: 1, seatsEach: 3, topTableSeats: 2 }
    const seatableFillers = Array.from({ length: 3 }, (_, i) => makeGuest(`filler-${i}`))
    const standingFillers = Array.from({ length: 3 }, (_, i) => makeGuest(`standing-${i}`))
    const guests = [...makeNewlyweds(), ...seatableFillers, ...standingFillers]

    const plan = allocate(room, guests, [], { allowSeat: registeredSeatGuard() })

    // 2 top seats + 3 round seats = 5 total, for 8 guests — 3 are genuinely left standing, and
    // every seat the room has, top table included, is full.
    expect(plan.unseated).toHaveLength(3)
    const report = evaluateRegistered(plan)
    expect(hardViolations(report).some((violation) => violation.ruleId === 'everyone-seated')).toBe(false)
  })
})

/**
 * Product decision: the everyone-seated rule's scope stays exactly as built. A free top-table
 * seat counts as free — a hand-pin could fill it — so `freeSeats`, `missed` and `opportunities`
 * never ask whether an unseated guest could legally take that seat. Two consequences follow, and
 * both are accepted behaviour, not defects, however much they look like one to a future reader:
 *
 * - Auto-allocate's phase 4 fills round tables only; the top table is never a fill destination.
 *   So when the guest list holds fewer protocol-role holders than the top table has seats,
 *   auto-allocate leaves those top seats empty and this rule fires — and re-running auto-allocate
 *   changes nothing, because nothing about the inputs changed.
 * - A room with fewer seats than guests overall still raises this rule for as long as any seat,
 *   including a top-table one, remains free — it is only silent once every seat is full.
 */
describe('everyone-seated — the accepted top-table-scope behaviour, over the real registry and the real solver (TT-47, KB-1, KB-2)', () => {
  it('fewer protocol-role holders than top-table seats: auto-allocate never clears the rule, and running it again does not help', () => {
    const room: RoomConfig = { roundTables: 2, seatsEach: 4, topTableSeats: 10 }
    const fillers = Array.from({ length: 14 }, (_, i) => makeGuest(`filler-${i}`))
    const guests = [...makeNewlyweds(), ...fillers]

    // 18 total seats (8 round + 10 top); 16 guests, only 2 of them protocol-role holders. Round
    // tables seat 8 of the 14 fillers; the other 6 stand while 8 top seats sit empty, because
    // phase 4 never sends a filler to the top table.
    const plan = allocate(room, guests, [], { allowSeat: registeredSeatGuard() })
    expect(plan.unseated).toHaveLength(6)

    const report = evaluateRegistered(plan)
    const finding = hardViolations(report).find((violation) => violation.ruleId === 'everyone-seated')
    expect(finding).toBeDefined()
    expect(finding?.message).toBe('6 guests have no seat')
    expect(finding?.detail).toBe('8 seats are still free')

    // Running auto-allocate again, from the same room and guest list, changes nothing — there is
    // no route to a publishable plan here except a hand pin onto the top table.
    const rerun = allocate(room, guests, [], { allowSeat: registeredSeatGuard() })
    expect(rerun).toEqual(plan)
  })

  it('fewer seats than guests overall: the rule still raises while top-table seats remain free, naming the true number left standing', () => {
    const room: RoomConfig = { roundTables: 1, seatsEach: 4, topTableSeats: 8 }
    const fillers = Array.from({ length: 12 }, (_, i) => makeGuest(`filler-${i}`))
    const guests = [...makeNewlyweds(), ...fillers]

    // 12 total seats (4 round + 8 top); 14 guests, only 2 of them protocol-role holders. Round
    // tables seat 4 of the 12 fillers; the other 8 stand while 6 top seats sit empty.
    const plan = allocate(room, guests, [], { allowSeat: registeredSeatGuard() })
    expect(plan.unseated).toHaveLength(8)

    const report = evaluateRegistered(plan)
    const finding = hardViolations(report).find((violation) => violation.ruleId === 'everyone-seated')
    expect(finding).toBeDefined()
    // The message names the true number of unseated guests (8), not the free-seat-capped `missed`
    // (6) — the detail is where that 6 lives.
    expect(finding?.message).toBe('8 guests have no seat')
    expect(finding?.detail).toBe('6 seats are still free')
  })
})
