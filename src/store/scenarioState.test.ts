import { describe, expect, it, beforeEach, vi } from 'vitest'
import { useTopTableStore, STORAGE_KEY } from './store'
import type { Guest, RoomConfig } from '../domain/types'

/**
 * TT-4, "Import a scenario". Written from .claude/plans/TT-4.md section 5 (the
 * scenarioState.test.ts row) and docs/state.md, which C27 and C28 are sourced from directly.
 * A new file beside the store, so store.test.ts (TT-2's) needs only the one-line change the
 * plan specifies for its persisted-keys assertion.
 *
 * Does not open store.ts. Guests are built minimally, in the same spirit as
 * SetupScreen.test.tsx's makeGuests: this ticket never reads a guest's contents (see the plan's
 * "Note on scope"), so only guests.length and array identity matter here.
 */

function makeGuests(count: number): Guest[] {
  return Array.from({ length: count }, (_, index) => ({
    id: `guest-${index}`,
    name: `Guest ${index}`,
    side: 'both',
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
  }))
}

const ADDING_UP_ROOM: RoomConfig = { roundTables: 9, seatsEach: 8, topTableSeats: 6 }
const SMALL_ROOM: RoomConfig = { roundTables: 4, seatsEach: 8, topTableSeats: 8 }

beforeEach(() => {
  useTopTableStore.getState().reset()
  localStorage.clear()
})

describe('first visit (C16)', () => {
  it('has scenario: null before anything is imported', () => {
    expect(useTopTableStore.getState().scenario).toBeNull()
  })
})

describe('importScenario (C3, C10, Assumed A2)', () => {
  it('replaces the guest list and the room together, and records which scenario was loaded', () => {
    useTopTableStore.getState().setGuests(makeGuests(5))
    useTopTableStore.getState().setRoom(SMALL_ROOM)

    const incoming = makeGuests(70)
    useTopTableStore.getState().importScenario('adding-up', incoming)

    const state = useTopTableStore.getState()
    expect(state.guests).toEqual(incoming)
    expect(state.guests).toHaveLength(70)
    expect(state.room).toEqual(ADDING_UP_ROOM)
    expect(state.scenario).toBe('adding-up')
  })

  it('leaves a previously typed event name untouched', () => {
    useTopTableStore.getState().setEventName('Priya and Tom, 14 March')
    useTopTableStore.getState().importScenario('adding-up', makeGuests(70))

    expect(useTopTableStore.getState().event).toEqual({ name: 'Priya and Tom, 14 March' })
  })
})

describe('setRoom detaching from a scenario (C8, Assumed A5)', () => {
  it('sets scenario to "custom" after an import, and still applies the room patch', () => {
    useTopTableStore.getState().importScenario('adding-up', makeGuests(70))

    useTopTableStore.getState().setRoom({ roundTables: 8, seatsEach: 8, topTableSeats: 6 })

    const state = useTopTableStore.getState()
    expect(state.scenario).toBe('custom')
    expect(state.room.roundTables).toBe(8)
  })

  it('leaves scenario as null when nothing has been imported yet', () => {
    useTopTableStore.getState().setRoom({ roundTables: 5, seatsEach: 8, topTableSeats: 6 })
    expect(useTopTableStore.getState().scenario).toBeNull()
  })

  it('leaves scenario as "custom" once it is already "custom"', () => {
    useTopTableStore.getState().importScenario('adding-up', makeGuests(70))
    useTopTableStore.getState().setRoom({ roundTables: 8, seatsEach: 8, topTableSeats: 6 })
    expect(useTopTableStore.getState().scenario).toBe('custom')

    useTopTableStore.getState().setRoom({ roundTables: 8, seatsEach: 7, topTableSeats: 6 })
    expect(useTopTableStore.getState().scenario).toBe('custom')
  })
})

describe('short capacity is a warning, never a block (C11)', () => {
  it('writes a room that leaves the guest list short, with nothing blocked', () => {
    useTopTableStore.getState().importScenario('celebrity-scale', makeGuests(200))

    useTopTableStore.getState().setRoom({ roundTables: 1, seatsEach: 8, topTableSeats: 8 })

    const state = useTopTableStore.getState()
    expect(state.room.roundTables).toBe(1)
    expect(state.guests).toHaveLength(200)
  })
})

describe('persistence (C27, C28)', () => {
  async function freshStore() {
    vi.resetModules()
    const mod = await import('./store')
    return mod.useTopTableStore
  }

  function storedPayload(): { state: Record<string, unknown>; version: number } {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (raw === null) throw new Error(`expected a persisted payload under "${STORAGE_KEY}"`)
    return JSON.parse(raw) as { state: Record<string, unknown>; version: number }
  }

  it('keeps the loaded scenario, its guests and its room across a re-evaluation of the module', async () => {
    useTopTableStore.getState().importScenario('adding-up', makeGuests(70))

    const reloaded = await freshStore()

    expect(reloaded.getState().scenario).toBe('adding-up')
    expect(reloaded.getState().guests).toHaveLength(70)
    expect(reloaded.getState().room).toEqual(ADDING_UP_ROOM)
  })

  it('returns to first visit when the stored scenario value is not recognisable', async () => {
    useTopTableStore.getState().importScenario('adding-up', makeGuests(70))
    const payload = storedPayload()
    payload.state.scenario = 'not-a-scenario'
    localStorage.setItem(STORAGE_KEY, JSON.stringify(payload))

    const reloaded = await freshStore()

    expect(reloaded.getState().scenario).toBeNull()
    expect(reloaded.getState().guests).toEqual([])
  })

  it('returns to first visit when the stored payload carries no scenario key at all', async () => {
    useTopTableStore.getState().importScenario('adding-up', makeGuests(70))
    const payload = storedPayload()
    delete payload.state.scenario
    localStorage.setItem(STORAGE_KEY, JSON.stringify(payload))

    const reloaded = await freshStore()

    expect(reloaded.getState().scenario).toBeNull()
    expect(reloaded.getState().guests).toEqual([])
  })
})

describe('reset', () => {
  it('returns scenario to null', () => {
    useTopTableStore.getState().importScenario('adding-up', makeGuests(70))
    useTopTableStore.getState().reset()
    expect(useTopTableStore.getState().scenario).toBeNull()
  })
})
