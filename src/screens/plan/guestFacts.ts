import type { Guest } from '../../domain/types'

/**
 * TT-44, KB-6 "Table detail". View logic for the detail panel's second line — not domain logic:
 * it reads a guest and reports strings, mutating nothing.
 */

function capitalise(term: string): string {
  return term.length === 0 ? term : `${term[0]?.toUpperCase() ?? ''}${term.slice(1)}`
}

/**
 * The parts present, in KB-6's order: role, tags, social type. The caller joins them with
 * " · ". `role` and `socialType` are non-nullable enums (`src/domain/types.ts`), so the array
 * is never empty for a real guest — `tags` is the only genuinely absent part, included only
 * when non-empty so a guest with none renders no empty segment and no stray separator.
 */
export function guestFactParts(guest: Guest): string[] {
  const parts: string[] = [capitalise(guest.role)]
  if (guest.tags.length > 0) parts.push(guest.tags.join(', '))
  parts.push(guest.socialType)
  return parts
}
