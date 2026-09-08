import { create } from 'zustand'
import { persist, type PersistStorage, type StorageValue } from 'zustand/middleware'
import type { EventDetails, Guest, RoomConfig } from '../domain/types'

/**
 * The single store. It holds the event, the room config and the guest list, and nothing
 * else. Everything is local: this is the whole of the product's persistent state.
 *
 * The plan, the violations and the allocation engine's output are not here. They are
 * derived from this data plus the rules, and they arrive with their own tickets.
 */

export const STORAGE_KEY = 'top-table'

/**
 * Bump when the shape of `TopTableData` changes. A stored version that does not match is
 * discarded rather than migrated, which is the honest option while there is no released
 * version to migrate from.
 */
export const STORAGE_VERSION = 1

export type TopTableData = {
  event: EventDetails
  room: RoomConfig
  guests: Guest[]
}

export type TopTableActions = {
  setEventName: (name: string) => void
  setRoom: (patch: Partial<RoomConfig>) => void
  /** Replaces the whole list. A scenario import is a replacement, not a merge (KB-1). */
  setGuests: (guests: Guest[]) => void
  /** Back to first visit. */
  reset: () => void
}

export type TopTableStore = TopTableData & TopTableActions

/**
 * First visit. Zeroed room numbers are the unconfigured state: KB-6's first-visit screen
 * shows empty config fields and reads "No guests yet, so nothing to work out".
 */
export const firstVisitState: TopTableData = {
  event: { name: '' },
  room: { roundTables: 0, seatsEach: 0, topTableSeats: 0 },
  guests: [],
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

/**
 * A structural check on what came out of storage, not a validation of the guest list.
 * Storage is not a trusted input: it survives across versions, it is editable by hand and
 * it is shared with whatever else used this origin.
 */
export function isTopTableData(value: unknown): value is TopTableData {
  if (!isRecord(value)) return false

  const { event, room, guests } = value
  if (!isRecord(event) || typeof event.name !== 'string') return false
  if (!isRecord(room)) return false
  if (
    typeof room.roundTables !== 'number' ||
    typeof room.seatsEach !== 'number' ||
    typeof room.topTableSeats !== 'number'
  ) {
    return false
  }
  return Array.isArray(guests)
}

/**
 * Every path through storage is wrapped. Cleared storage, hand-edited JSON, a full quota
 * and a browser that refuses access altogether all have to leave the app standing, so a
 * read that cannot be trusted returns null and the store falls back to first visit.
 */
const storage: PersistStorage<TopTableData> = {
  getItem: (name) => {
    try {
      const raw = globalThis.localStorage?.getItem(name)
      if (raw === null || raw === undefined) return null
      return JSON.parse(raw) as StorageValue<TopTableData>
    } catch {
      return null
    }
  },
  setItem: (name, value) => {
    try {
      globalThis.localStorage?.setItem(name, JSON.stringify(value))
    } catch {
      // A store that is full or unavailable must not take the app down with it.
    }
  },
  removeItem: (name) => {
    try {
      globalThis.localStorage?.removeItem(name)
    } catch {
      // As above.
    }
  },
}

export const useTopTableStore = create<TopTableStore>()(
  persist(
    (set) => ({
      ...firstVisitState,

      setEventName: (name) => set({ event: { name } }),

      setRoom: (patch) => set((state) => ({ room: { ...state.room, ...patch } })),

      setGuests: (guests) => set({ guests }),

      reset: () => set({ ...firstVisitState }),
    }),
    {
      name: STORAGE_KEY,
      version: STORAGE_VERSION,
      storage,
      // Actions are not state and are never written.
      partialize: (state): TopTableData => ({
        event: state.event,
        room: state.room,
        guests: state.guests,
      }),
      // An older or unrecognised version is discarded, not repaired.
      migrate: () => firstVisitState,
      merge: (persisted, current) => ({
        ...current,
        ...(isTopTableData(persisted) ? persisted : firstVisitState),
      }),
    },
  ),
)
