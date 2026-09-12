import type { Guest } from '../../domain/types'

export type Suggestion = { value: string; kind: 'name' | 'tag' }

/**
 * TT-38. The pool `Combobox` filters over: every guest's name in guest order, then every tag
 * in use, first-seen only. Tags are de-duplicated case-insensitively but keep the casing they
 * were first written in — the same discipline `guestFilter.ts`'s own search holds, never
 * lowercasing a stored value. A string that is both a name and a tag appears twice, once per
 * `kind`, since the two are different facts about the guest list rather than one collapsed
 * into the other. Input never mutated.
 */
export function suggestionsFrom(guests: readonly Guest[]): Suggestion[] {
  const suggestions: Suggestion[] = guests.map((guest) => ({ value: guest.name, kind: 'name' as const }))

  const seenTags = new Set<string>()
  for (const guest of guests) {
    for (const tag of guest.tags) {
      const key = tag.toLowerCase()
      if (seenTags.has(key)) continue
      seenTags.add(key)
      suggestions.push({ value: tag, kind: 'tag' })
    }
  }

  return suggestions
}
