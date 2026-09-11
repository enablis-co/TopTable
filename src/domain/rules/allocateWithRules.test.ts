import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { allocate } from '../allocate'
import { registeredSeatGuard } from './registry'
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
