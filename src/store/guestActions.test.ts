import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { Guest } from '../domain/types'
import { STORAGE_KEY, STORAGE_VERSION, useTopTableStore } from './store'

/**
 * TT-5, the store's three new actions: addGuest, updateGuest, removeGuest. Written from the
 * acceptance criteria and .claude/plans/TT-5.md sections 3-5. Does not open store.ts or
 * src/domain/guests.ts — the store's contract (each action a one-line delegate to the domain
 * module, STORAGE_VERSION bumped) comes from the plan's file-by-file section only.
 *
 * A new file beside the store rather than growing store.test.ts, which is TT-2's — the same
 * choice scenarioState.test.ts made for TT-4, and the pattern this file follows for the
 * store-reset and localStorage-seeding conventions.
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

beforeEach(() => {
  useTopTableStore.getState().reset()
  localStorage.clear()
})

describe('addGuest', () => {
  it('changes guests and leaves event, room and scenario alone', () => {
    useTopTableStore.getState().setEventName('Priya and Tom, 14 March')
    useTopTableStore.getState().importScenario('adding-up', [makeGuest('g-1')])

    useTopTableStore.getState().addGuest(makeGuest('g-2'))

    const state = useTopTableStore.getState()
    expect(state.guests.map((g) => g.id)).toEqual(['g-1', 'g-2'])
    expect(state.event).toEqual({ name: 'Priya and Tom, 14 March' })
    expect(state.room).toEqual(ADDING_UP_ROOM)
    expect(state.scenario).toBe('adding-up')
  })

  it('writes partnerOf on both guests through the store, not only the one being added (C5)', () => {
    useTopTableStore.getState().setGuests([makeGuest('g-1')])

    useTopTableStore.getState().addGuest(makeGuest('g-2', { partnerOf: 'g-1' }))

    const guests = useTopTableStore.getState().guests
    expect(guests.find((g) => g.id === 'g-1')?.partnerOf).toBe('g-2')
    expect(guests.find((g) => g.id === 'g-2')?.partnerOf).toBe('g-1')
  })
})

describe('updateGuest', () => {
  it('changes guests and leaves event, room and scenario alone', () => {
    useTopTableStore.getState().setEventName('Priya and Tom, 14 March')
    useTopTableStore.getState().importScenario('adding-up', [makeGuest('g-1', { name: 'Before' })])

    useTopTableStore.getState().updateGuest(makeGuest('g-1', { name: 'After' }))

    const state = useTopTableStore.getState()
    expect(state.guests).toEqual([makeGuest('g-1', { name: 'After' })])
    expect(state.event).toEqual({ name: 'Priya and Tom, 14 March' })
    expect(state.room).toEqual(ADDING_UP_ROOM)
    expect(state.scenario).toBe('adding-up')
  })
})

describe('removeGuest', () => {
  it('changes guests and leaves event, room and scenario alone', () => {
    useTopTableStore.getState().setEventName('Priya and Tom, 14 March')
    useTopTableStore.getState().importScenario('adding-up', [makeGuest('g-1'), makeGuest('g-2')])

    useTopTableStore.getState().removeGuest('g-1')

    const state = useTopTableStore.getState()
    expect(state.guests).toEqual([makeGuest('g-2')])
    expect(state.event).toEqual({ name: 'Priya and Tom, 14 March' })
    expect(state.room).toEqual(ADDING_UP_ROOM)
    expect(state.scenario).toBe('adding-up')
  })

  it('clears partnerOf and conflictsWith on every guest who referenced the removed guest, through the store (C13)', () => {
    const removed = makeGuest('g-1', { partnerOf: 'g-2', conflictsWith: ['g-3'] })
    const partner = makeGuest('g-2', { partnerOf: 'g-1' })
    const conflictOwner = makeGuest('g-3', { conflictsWith: ['g-1'] })
    useTopTableStore.getState().setGuests([removed, partner, conflictOwner])

    useTopTableStore.getState().removeGuest('g-1')

    const guests = useTopTableStore.getState().guests
    expect(guests.map((g) => g.id)).toEqual(['g-2', 'g-3'])
    expect(guests.find((g) => g.id === 'g-2')?.partnerOf).toBeNull()
    expect(guests.find((g) => g.id === 'g-3')?.conflictsWith).toEqual([])
  })
})

describe('storage version (C18)', () => {
  async function freshStore() {
    vi.resetModules()
    return import('./store')
  }

  function seedStorage(value: unknown, version: number) {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ state: value, version }))
  }

  it('discards a guest list stored under a previous STORAGE_VERSION and opens at first visit', async () => {
    seedStorage(
      {
        event: { name: 'Priya and Tom, 14 March' },
        room: ADDING_UP_ROOM,
        guests: [makeGuest('g-1')],
        scenario: 'adding-up',
      },
      STORAGE_VERSION - 1,
    )

    const { useTopTableStore: reloaded, firstVisitState } = await freshStore()

    expect(reloaded.getState()).toMatchObject(firstVisitState)
  })
})
