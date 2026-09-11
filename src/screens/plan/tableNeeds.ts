import type { Guest } from '../../domain/types'

/**
 * TT-15, KB-3, KB-6 "Table detail". View aggregation for the panel's needs block — not a rule
 * (TT-18 owns the kitchen-brief rule) and not domain logic, so it lives in the screen folder
 * rather than `src/domain/`: it reads a guest list and reports counts, and mutates nothing.
 *
 * Allergies and dietary preferences are counted separately and never merged into one list —
 * `src/domain/types.ts`'s own `Guest` comment is explicit that the two mean different things
 * (a safety matter versus a catering count), and KB-6's own worked example ("Nuts × 1 ·
 * Vegan × 2") keeps them as two runs rather than one combined tally.
 */

export type NeedCount = { term: string; count: number }

function capitalise(term: string): string {
  return term.length === 0 ? term : `${term[0]?.toUpperCase() ?? ''}${term.slice(1)}`
}

/**
 * Counts occurrences of each distinct term across every guest, then sorts by the capitalised
 * term ascending — never object key or insertion order, which is why this always runs the
 * counts through a fresh sort rather than trusting `Map` iteration order to stay put.
 */
function countsFrom(guests: readonly Guest[], termsOf: (guest: Guest) => readonly string[]): NeedCount[] {
  const counts = new Map<string, number>()

  for (const guest of guests) {
    for (const term of termsOf(guest)) {
      counts.set(term, (counts.get(term) ?? 0) + 1)
    }
  }

  return [...counts.entries()]
    .map(([term, count]) => ({ term: capitalise(term), count }))
    .sort((a, b) => a.term.localeCompare(b.term))
}

export function allergyCounts(guests: readonly Guest[]): NeedCount[] {
  return countsFrom(guests, (guest) => guest.allergies)
}

export function dietaryCounts(guests: readonly Guest[]): NeedCount[] {
  return countsFrom(guests, (guest) => guest.dietaryPreferences)
}
