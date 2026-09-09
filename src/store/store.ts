import { create } from 'zustand'
import { persist, type PersistStorage, type StorageValue } from 'zustand/middleware'
import type { EventDetails, Guest, RoomConfig } from '../domain/types'
import { isScenarioId, scenarioById } from '../domain/scenarios'
import type { ScenarioId } from '../domain/scenarios'
import {
  addGuest as domainAddGuest,
  removeGuest as domainRemoveGuest,
  updateGuest as domainUpdateGuest,
} from '../domain/guests'

/**
 * The single store. It holds the event, the room config, the guest list and which scenario
 * (if any) is loaded, and nothing else. Everything is local: this is the whole of the
 * product's persistent state.
 *
 * The plan, the violations and the allocation engine's output are not here. They are
 * derived from this data plus the rules, and they arrive with their own tickets.
 *
 * The write surface is eight actions: setEventName, setRoom, setGuests, importScenario,
 * reset, addGuest, updateGuest and removeGuest. The last three are thin delegates onto
 * `src/domain/guests.ts` — reciprocal `partnerOf`/`conflictsWith` writes are real domain
 * behaviour (TT-5) and are not improvised here.
 */

export const STORAGE_KEY = 'top-table'

/**
 * Bump when the shape of `TopTableData` changes. A stored version that does not match is
 * discarded rather than migrated, which is the honest option while there is no released
 * version to migrate from.
 */
export const STORAGE_VERSION = 3

/** null: nothing imported. 'custom': imported, then the room was edited (TT-4). */
export type ScenarioState = ScenarioId | 'custom' | null

export type TopTableData = {
  event: EventDetails
  room: RoomConfig
  guests: Guest[]
  scenario: ScenarioState
}

export type TopTableActions = {
  setEventName: (name: string) => void
  /** Detaches from a loaded scenario (TT-4): the chip reads "Custom" from here on. */
  setRoom: (patch: Partial<RoomConfig>) => void
  /** Replaces the whole list. A scenario import is a replacement, not a merge (KB-1). */
  setGuests: (guests: Guest[]) => void
  /** Replaces the guest list and the room together (TT-4). The event name is untouched. */
  importScenario: (id: ScenarioId, guests: Guest[]) => void
  /** Back to first visit. */
  reset: () => void
  /** Appends a guest and applies reciprocity (TT-5). See `src/domain/guests.ts`. */
  addGuest: (guest: Guest) => void
  /** Replaces a guest and reconciles its relationships (TT-5). See `src/domain/guests.ts`. */
  updateGuest: (guest: Guest) => void
  /** Drops a guest and unpicks every reference to them (TT-5). See `src/domain/guests.ts`. */
  removeGuest: (id: string) => void
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
  scenario: null,
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

  const { event, room, guests, scenario } = value
  if (!isRecord(event) || typeof event.name !== 'string') return false
  if (!isRecord(room)) return false
  if (
    typeof room.roundTables !== 'number' ||
    typeof room.seatsEach !== 'number' ||
    typeof room.topTableSeats !== 'number'
  ) {
    return false
  }
  if (!Array.isArray(guests)) return false
  return scenario === null || scenario === 'custom' || isScenarioId(scenario)
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

      // Any patch detaches, including one that patches a value to what it already was — a
      // user who typed in the field edited it. A store that never imported anything (scenario
      // is null) stays null: there is nothing to be "Custom" relative to (Assumed A5).
      setRoom: (patch) =>
        set((state) => ({
          room: { ...state.room, ...patch },
          scenario: state.scenario === null ? null : 'custom',
        })),

      setGuests: (guests) => set({ guests }),

      // The room is looked up from the manifest rather than passed in, so a caller cannot
      // pair one scenario's id with another's room. One `set` call replaces guests and room
      // together, so C3's atomicity is structural rather than a convention.
      importScenario: (id, guests) => set({ room: { ...scenarioById(id).room }, guests, scenario: id }),

      reset: () => set({ ...firstVisitState }),

      // Thin delegates onto src/domain/guests.ts. No reciprocity logic here — see the header
      // comment above and docs/state.md.
      addGuest: (guest) => set((state) => ({ guests: domainAddGuest(state.guests, guest) })),

      updateGuest: (guest) => set((state) => ({ guests: domainUpdateGuest(state.guests, guest) })),

      removeGuest: (id) => set((state) => ({ guests: domainRemoveGuest(state.guests, id) })),
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
        scenario: state.scenario,
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
