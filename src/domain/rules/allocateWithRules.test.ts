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
 * TT-47, 47-A6: "Auto-allocate already seats everyone it can, so it should clear this rule
 * wherever seats allow. Where seats ran out it reports that, as it does now, and the rule stays
 * quiet." Written from TT-47's acceptance criteria. Does not open everyoneSeated.rule.ts.
 */
describe('everyone-seated, over the real registry and the real solver (TT-47, A6)', () => {
  it('a room with spare seats: allocate seats everyone it can, and the everyone-seated rule stays quiet', () => {
    const room: RoomConfig = { roundTables: 2, seatsEach: 5, topTableSeats: 0 }
    const guests = Array.from({ length: 8 }, (_, i) => makeGuest(`filler-${i}`))

    const plan = allocate(room, guests, [], { allowSeat: registeredSeatGuard() })

    expect(plan.unseated).toEqual([])
    const report = evaluateRegistered(plan)
    expect(hardViolations(report).some((violation) => violation.ruleId === 'everyone-seated')).toBe(false)
  })

  it('a room short of seats: allocate seats what it can and leaves the rest in plan.unseated, and the rule stays quiet', () => {
    const room: RoomConfig = { roundTables: 1, seatsEach: 3, topTableSeats: 0 }
    const guests = Array.from({ length: 6 }, (_, i) => makeGuest(`filler-${i}`))

    const plan = allocate(room, guests, [], { allowSeat: registeredSeatGuard() })

    // The room only has 3 seats for 6 guests — 3 are genuinely left standing.
    expect(plan.unseated).toHaveLength(3)
    const report = evaluateRegistered(plan)
    expect(hardViolations(report).some((violation) => violation.ruleId === 'everyone-seated')).toBe(false)
  })
})
