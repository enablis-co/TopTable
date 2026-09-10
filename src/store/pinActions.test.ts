import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { Guest } from '../domain/types'
import { STORAGE_KEY, STORAGE_VERSION, useTopTableStore } from './store'

/**
 * TT-12, "Place a guest by clicking" — the store's two new actions, pinGuest and unpinGuest,
 * plus how the existing actions now touch pins. Written from the acceptance criteria and
 * docs/state.md, in the shape of guestActions.test.ts. Does not open store.ts or
 * src/domain/pins.ts — the store's contract (each action a one-line delegate to the domain
 * module, STORAGE_VERSION bumped, pins cleared by setGuests and importScenario but not setRoom)
 * comes from the plan's file-by-file section only.
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

const ADDING_UP_ROOM = { roundTables: 9, seatsEach: 8, topTableSeats: 6 }
const CELEBRITY_SCALE_ROOM = { roundTables: 26, seatsEach: 8, topTableSeats: 8 }

beforeEach(() => {
  useTopTableStore.getState().reset()
  localStorage.clear()
})

describe('pinGuest', () => {
  it('adds a pin naming the guest and the table, and leaves event, room, guests and scenario alone', () => {
    useTopTableStore.getState().setEventName('Priya and Tom, 14 March')
    useTopTableStore.getState().importScenario('adding-up', [makeGuest('g-1')])

    useTopTableStore.getState().pinGuest('g-1', 'round-3')

    const state = useTopTableStore.getState()
    expect(state.pins).toEqual([{ guestId: 'g-1', tableId: 'round-3' }])
    expect(state.event).toEqual({ name: 'Priya and Tom, 14 March' })
    expect(state.room).toEqual(ADDING_UP_ROOM)
    expect(state.guests.map((g) => g.id)).toEqual(['g-1'])
    expect(state.scenario).toBe('adding-up')
  })

  it('a pin survives a reload: a fresh store reading the same storage still shows it', async () => {
    useTopTableStore.getState().setGuests([makeGuest('g-1')])
    useTopTableStore.getState().pinGuest('g-1', 'round-1')

    vi.resetModules()
    const { useTopTableStore: reloaded } = await import('./store')

    expect(reloaded.getState().pins).toEqual([{ guestId: 'g-1', tableId: 'round-1' }])
  })
})

describe('unpinGuest', () => {
  it('removes the named pin and leaves every other pin untouched', () => {
    useTopTableStore.getState().setGuests([makeGuest('g-1'), makeGuest('g-2')])
    useTopTableStore.getState().pinGuest('g-1', 'round-1')
    useTopTableStore.getState().pinGuest('g-2', 'round-2')

    useTopTableStore.getState().unpinGuest('g-1')

    expect(useTopTableStore.getState().pins).toEqual([{ guestId: 'g-2', tableId: 'round-2' }])
  })

  it('an unpin survives a reload the same way a pin does', async () => {
    useTopTableStore.getState().setGuests([makeGuest('g-1')])
    useTopTableStore.getState().pinGuest('g-1', 'round-1')
    useTopTableStore.getState().unpinGuest('g-1')

    vi.resetModules()
    const { useTopTableStore: reloaded } = await import('./store')

    expect(reloaded.getState().pins).toEqual([])
  })
})

describe('removeGuest reconciles pins through the store', () => {
  it('removing a pinned guest leaves no pin naming them, and the action still takes only an id', () => {
    useTopTableStore.getState().setGuests([makeGuest('g-1'), makeGuest('g-2')])
    useTopTableStore.getState().pinGuest('g-1', 'round-1')
    useTopTableStore.getState().pinGuest('g-2', 'round-2')

    useTopTableStore.getState().removeGuest('g-1')

    expect(useTopTableStore.getState().pins).toEqual([{ guestId: 'g-2', tableId: 'round-2' }])
  })
})

describe('setGuests and importScenario clear pins; setRoom does not', () => {
  it('setGuests clears every pin', () => {
    useTopTableStore.getState().setGuests([makeGuest('g-1')])
    useTopTableStore.getState().pinGuest('g-1', 'round-1')

    useTopTableStore.getState().setGuests([makeGuest('g-2')])

    expect(useTopTableStore.getState().pins).toEqual([])
  })

  it('importScenario clears every pin in the same step that replaces the guest list and the room', () => {
    useTopTableStore.getState().setRoom(ADDING_UP_ROOM)
    useTopTableStore.getState().setGuests([makeGuest('g-1')])
    useTopTableStore.getState().pinGuest('g-1', 'round-1')

    useTopTableStore.getState().importScenario('celebrity-scale', [makeGuest('g-9')])

    const state = useTopTableStore.getState()
    expect(state.pins).toEqual([])
    expect(state.guests.map((g) => g.id)).toEqual(['g-9'])
    expect(state.room).toEqual(CELEBRITY_SCALE_ROOM)
    expect(state.scenario).toBe('celebrity-scale')
  })

  it('setRoom leaves pins alone when it genuinely changes a number', () => {
    useTopTableStore.getState().setRoom(ADDING_UP_ROOM)
    useTopTableStore.getState().setGuests([makeGuest('g-1')])
    useTopTableStore.getState().pinGuest('g-1', 'round-1')

    useTopTableStore.getState().setRoom({ seatsEach: 10 })

    expect(useTopTableStore.getState().pins).toEqual([{ guestId: 'g-1', tableId: 'round-1' }])
  })

  it('setRoom leaves pins alone even with a patch that changes nothing at all', () => {
    useTopTableStore.getState().setRoom(ADDING_UP_ROOM)
    useTopTableStore.getState().setGuests([makeGuest('g-1')])
    useTopTableStore.getState().pinGuest('g-1', 'round-1')

    useTopTableStore.getState().setRoom({ roundTables: ADDING_UP_ROOM.roundTables })

    expect(useTopTableStore.getState().pins).toEqual([{ guestId: 'g-1', tableId: 'round-1' }])
  })
})

describe('a store from before pins existed', () => {
  async function freshStore() {
    vi.resetModules()
    return import('./store')
  }

  function seedStorage(value: unknown, version: number) {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ state: value, version }))
  }

  it('a store seeded at the previous storage version opens at first visit with pins: [], discarded rather than migrated', async () => {
    seedStorage(
      {
        event: { name: 'Priya and Tom, 14 March' },
        room: ADDING_UP_ROOM,
        guests: [makeGuest('g-1')],
        scenario: 'adding-up',
        // No pins field at all — this is the actual shape a version-3 store had.
      },
      STORAGE_VERSION - 1,
    )

    const { useTopTableStore: reloaded, firstVisitState } = await freshStore()

    expect(reloaded.getState()).toMatchObject(firstVisitState)
    expect(reloaded.getState().pins).toEqual([])
  })
})

describe('storage that cannot be trusted', () => {
  async function freshStore() {
    vi.resetModules()
    return import('./store')
  }

  function seedStorage(value: unknown, version: number = STORAGE_VERSION) {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ state: value, version }))
  }

  it('falls back to first visit, without throwing, when pins is not an array', async () => {
    seedStorage({
      event: { name: 'Priya and Tom, 14 March' },
      room: ADDING_UP_ROOM,
      guests: [],
      scenario: null,
      pins: 'nonsense',
    })

    const { useTopTableStore: reloaded, firstVisitState } = await freshStore()

    expect(reloaded.getState()).toMatchObject(firstVisitState)
  })

  it('falls back to first visit, without throwing, when pins is missing entirely', async () => {
    seedStorage({
      event: { name: 'Priya and Tom, 14 March' },
      room: ADDING_UP_ROOM,
      guests: [],
      scenario: null,
    })

    const { useTopTableStore: reloaded, firstVisitState } = await freshStore()

    expect(reloaded.getState()).toMatchObject(firstVisitState)
  })
})
