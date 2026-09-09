import type { Guest } from '../../domain/types'

/**
 * TT-6, C23. Case-insensitive substring match over name and tags. Search is view state, not
 * product data (Assumed A18) — `src/shell/navigation.ts` sets the precedent that view state
 * never reaches the store — so this is a plain function beside the screen rather than a
 * `src/domain/` module.
 */
export function filterGuests(guests: Guest[], query: string): Guest[] {
  // Reviewer finding: ConflictPicker's own search already trims (`query.trim().toLowerCase()`)
  // — this one did not, so a trailing space (easy to leave in a search box without noticing)
  // matched nothing at all, since no guest name or tag ends in a space.
  const needle = query.trim().toLowerCase()
  if (needle === '') return guests

  return guests.filter(
    (guest) =>
      guest.name.toLowerCase().includes(needle) || guest.tags.some((tag) => tag.toLowerCase().includes(needle)),
  )
}
