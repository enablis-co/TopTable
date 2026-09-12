import type { Guest, Role, Side } from '../../domain/types'
import { hasNeeds } from '../../domain/guests'
import { filterGuests } from '../guests/guestFilter'

/**
 * TT-38, KB-6 "Plan". View-layer filtering for the unseated rail — beside the screen rather
 * than `src/domain/`, the same reasoning `guestFilter.ts` gives for search and `tableNeeds.ts`
 * sets as precedent in this folder: a plain function that reads a guest list and reports a
 * narrowed one, mutating nothing.
 */
export type NeedsFilter = 'any' | 'with' | 'without'

export type UnseatedFilters = {
  query: string
  side: Side | 'any'
  role: Role | 'any'
  needs: NeedsFilter
}

export const NO_FILTERS: UnseatedFilters = {
  query: '',
  side: 'any',
  role: 'any',
  needs: 'any',
}

/** True when any field differs from `NO_FILTERS` — search or any of the three filters. */
export function isFiltered(filters: UnseatedFilters): boolean {
  return (
    filters.query.trim() !== '' ||
    filters.side !== 'any' ||
    filters.role !== 'any' ||
    filters.needs !== 'any'
  )
}

/**
 * Applies search first (`filterGuests`, identical behaviour to the guest list — TT-38's own
 * requirement), then the three filters, in order: side, role, needs. `hasNeeds` is called
 * rather than re-derived here — allergies or accessibility only, never `dietaryPreferences`,
 * which is a catering count (TT-25, KB-3) — so this and `GuestTable`/`GuestSummary` can never
 * silently drift apart. Order of the input is preserved throughout; the input array is never
 * mutated.
 */
export function filterUnseated(guests: readonly Guest[], filters: UnseatedFilters): readonly Guest[] {
  let result = filterGuests(guests, filters.query)

  if (filters.side !== 'any') {
    const side = filters.side
    result = result.filter((guest) => guest.side === side)
  }

  if (filters.role !== 'any') {
    const role = filters.role
    result = result.filter((guest) => guest.role === role)
  }

  if (filters.needs !== 'any') {
    const wantsNeeds = filters.needs === 'with'
    result = result.filter((guest) => hasNeeds(guest) === wantsNeeds)
  }

  return result
}
