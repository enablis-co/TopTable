import { capitalizeFirst } from '../../ui'
import type { Guest } from '../../domain/types'

/**
 * TT-36, KB-3. View helper for the guest hover summary — not domain logic: reads the guest list
 * and reports strings, mutating nothing, the same standing `guestFacts.ts` already has.
 *
 * Never reads `dietaryPreferences` (C4) — the field is not referenced anywhere in this file, so
 * the summary's silence on diet is structural rather than a filter a later edit could loosen.
 */

export type SummaryField = { label: string; value: string }

function nameOf(guests: readonly Guest[], id: string): string | null {
  return guests.find((candidate) => candidate.id === id)?.name ?? null
}

/**
 * `conflictsWith` (and `partnerOf`, above) name ids that may no longer resolve — storage is not
 * a trusted input (`docs/state.md`) and nothing here re-validates it. An id that resolves to
 * nobody is dropped rather than rendered raw.
 */
function namesOf(guests: readonly Guest[], ids: readonly string[]): string[] {
  return ids.map((id) => nameOf(guests, id)).filter((name): name is string => name !== null)
}

/**
 * C3's nine facts, in the ticket's own order (A2) rather than KB-3's field order: side, role,
 * household, partner, kept apart from, allergies, accessibility, tags, social type. A field the
 * guest has nothing in is omitted outright (C6) — no label, no placeholder, no empty row.
 * `side`, `role` and `socialType` are non-nullable enums (`src/domain/types.ts`), so they always
 * render; every other field here is the genuinely optional one.
 */
export function guestSummaryFields(guest: Guest, guests: readonly Guest[]): SummaryField[] {
  const fields: SummaryField[] = [
    { label: 'Side', value: capitalizeFirst(guest.side) },
    { label: 'Role', value: capitalizeFirst(guest.role) },
  ]

  if (guest.household) {
    fields.push({ label: 'Household', value: guest.household })
  }

  const partnerName = guest.partnerOf === null ? null : nameOf(guests, guest.partnerOf)
  if (partnerName) {
    fields.push({ label: 'Partner', value: partnerName })
  }

  const conflictNames = namesOf(guests, guest.conflictsWith)
  if (conflictNames.length > 0) {
    fields.push({ label: 'Kept apart from', value: conflictNames.join(', ') })
  }

  if (guest.allergies.length > 0) {
    fields.push({ label: 'Allergies', value: guest.allergies.map(capitalizeFirst).join(', ') })
  }

  if (guest.accessibility.length > 0) {
    fields.push({ label: 'Accessibility', value: guest.accessibility.map(capitalizeFirst).join(', ') })
  }

  if (guest.tags.length > 0) {
    fields.push({ label: 'Tags', value: guest.tags.join(', ') })
  }

  fields.push({ label: 'Social type', value: capitalizeFirst(guest.socialType) })

  return fields
}
