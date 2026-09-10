import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { Guest } from '../domain/types'
import { STORAGE_KEY, STORAGE_VERSION } from './store'

/**
 * Rehydration happens once, when the module is first evaluated. Testing a refresh
 * therefore means evaluating the module again against whatever is in storage, which is
 * what `freshStore` does. A plain re-import would hand back the cached singleton.
 */
async function freshStore() {
  vi.resetModules()
  return import('./store')
}

function seedStorage(value: unknown, version: number = STORAGE_VERSION) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify({ state: value, version }))
}

const guest = (id: string, name: string): Guest => ({
  id,
  name,
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
})

beforeEach(() => {
  localStorage.clear()
})

describe('the store', () => {
  it('holds the event, the room config and the guest list', async () => {
    const { useTopTableStore } = await freshStore()

    expect(useTopTableStore.getState()).toMatchObject({
      event: { name: '' },
      room: { roundTables: 0, seatsEach: 0, topTableSeats: 0 },
      guests: [],
    })
  })

  it('records the event name', async () => {
    const { useTopTableStore } = await freshStore()

    useTopTableStore.getState().setEventName('Priya and Tom, 14 March')

    expect(useTopTableStore.getState().event.name).toBe('Priya and Tom, 14 March')
  })

  it('patches one room number without disturbing the others', async () => {
    const { useTopTableStore } = await freshStore()

    useTopTableStore.getState().setRoom({ roundTables: 9, seatsEach: 8, topTableSeats: 6 })
    useTopTableStore.getState().setRoom({ roundTables: 8 })

    expect(useTopTableStore.getState().room).toEqual({
      roundTables: 8,
      seatsEach: 8,
      topTableSeats: 6,
    })
  })

  it('replaces the whole guest list rather than merging into it', async () => {
    const { useTopTableStore } = await freshStore()

    useTopTableStore.getState().setGuests([guest('g-001', 'Priya Shah')])
    useTopTableStore.getState().setGuests([guest('g-002', 'Tom Whitaker')])

    expect(useTopTableStore.getState().guests).toEqual([guest('g-002', 'Tom Whitaker')])
  })
})

describe('persistence', () => {
  it('writes the data to local storage under one key', async () => {
    const { useTopTableStore } = await freshStore()

    useTopTableStore.getState().setEventName('Priya and Tom, 14 March')

    const raw = localStorage.getItem(STORAGE_KEY)
    expect(raw).not.toBeNull()
    expect(JSON.parse(raw ?? '')).toMatchObject({
      version: STORAGE_VERSION,
      state: { event: { name: 'Priya and Tom, 14 March' } },
    })
  })

  it('does not write the actions', async () => {
    const { useTopTableStore } = await freshStore()

    useTopTableStore.getState().setEventName('Priya and Tom, 14 March')

    const stored = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? '') as {
      state: Record<string, unknown>
    }
    expect(Object.keys(stored.state).sort()).toEqual(['event', 'guests', 'pins', 'room', 'scenario'])
  })

  it('survives a refresh', async () => {
    const before = await freshStore()
    before.useTopTableStore.getState().setEventName('Priya and Tom, 14 March')
    before.useTopTableStore.getState().setRoom({ roundTables: 9, seatsEach: 8, topTableSeats: 6 })
    before.useTopTableStore.getState().setGuests([guest('g-001', 'Priya Shah')])

    const after = await freshStore()

    expect(after.useTopTableStore.getState()).toMatchObject({
      event: { name: 'Priya and Tom, 14 March' },
      room: { roundTables: 9, seatsEach: 8, topTableSeats: 6 },
      guests: [guest('g-001', 'Priya Shah')],
    })
  })

  it('returns to first visit when reset', async () => {
    const { useTopTableStore, firstVisitState } = await freshStore()

    useTopTableStore.getState().setEventName('Priya and Tom, 14 March')
    useTopTableStore.getState().setGuests([guest('g-001', 'Priya Shah')])
    useTopTableStore.getState().reset()

    expect(useTopTableStore.getState()).toMatchObject(firstVisitState)
  })
})

describe('storage that cannot be trusted', () => {
  it('returns to first visit when storage has been cleared', async () => {
    const seeded = await freshStore()
    seeded.useTopTableStore.getState().setEventName('Priya and Tom, 14 March')

    localStorage.clear()
    const after = await freshStore()

    expect(after.useTopTableStore.getState()).toMatchObject(after.firstVisitState)
  })

  it('returns to first visit when the stored value is not JSON', async () => {
    localStorage.setItem(STORAGE_KEY, 'not json {{{')

    const { useTopTableStore, firstVisitState } = await freshStore()

    expect(useTopTableStore.getState()).toMatchObject(firstVisitState)
  })

  it('returns to first visit when the stored shape is wrong', async () => {
    seedStorage({ event: 'a string', room: null, guests: 'not a list' })

    const { useTopTableStore, firstVisitState } = await freshStore()

    expect(useTopTableStore.getState()).toMatchObject(firstVisitState)
  })

  it('returns to first visit when a room number is missing', async () => {
    seedStorage({ event: { name: 'Priya and Tom' }, room: { roundTables: 9 }, guests: [] })

    const { useTopTableStore, firstVisitState } = await freshStore()

    expect(useTopTableStore.getState()).toMatchObject(firstVisitState)
  })

  it('discards a stored version it does not recognise', async () => {
    seedStorage(
      {
        event: { name: 'Priya and Tom, 14 March' },
        room: { roundTables: 9, seatsEach: 8, topTableSeats: 6 },
        guests: [],
      },
      STORAGE_VERSION + 1,
    )

    const { useTopTableStore, firstVisitState } = await freshStore()

    expect(useTopTableStore.getState()).toMatchObject(firstVisitState)
  })

  it('stays standing when local storage throws on every call', async () => {
    const boom = () => {
      throw new Error('SecurityError: storage is blocked')
    }
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(boom)
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(boom)

    const { useTopTableStore, firstVisitState } = await freshStore()

    expect(useTopTableStore.getState()).toMatchObject(firstVisitState)
    expect(() => {
      useTopTableStore.getState().setEventName('Priya and Tom, 14 March')
    }).not.toThrow()
    expect(useTopTableStore.getState().event.name).toBe('Priya and Tom, 14 March')
  })
})
