import type { Guest } from './types'

/**
 * The whole of reciprocal relationship handling for the guest list, and the only place it
 * lives (AGENTS.md, docs/state.md). `partnerOf` and `conflictsWith` are reciprocal — present
 * on both guests, resolvable from either direction (KB-3) — so every write here touches every
 * guest the change implicates, never just the one the caller named.
 *
 * Pure throughout: every function returns a new array and new objects for the guests it
 * changes, never mutates an input, and never touches a guest it does not need to change.
 */

/**
 * Removes duplicate ids, keeping first-occurrence order. `conflictsWith` is conceptually a
 * set — the same id named twice describes one conflict, not two (C9) — but is typed and
 * stored as `string[]` (KB-3), so nothing in the type stops a caller repeating an id within
 * one array. `addGuest` and `updateGuest` both normalise an incoming guest's `conflictsWith`
 * through here before it is stored or used to drive the reciprocal write, so the guest whose
 * array was handed in is held to the same uniqueness the reciprocal write already gives the
 * guests on the other side of it.
 */
function dedupeIds(ids: string[]): string[] {
  return [...new Set(ids)]
}

/**
 * Shared by `addGuest` and `updateGuest`. Validates `guest`'s relationships against `guests`
 * — the list as it stood before this write — and throws rather than silently dropping a bad
 * reference, because a no-op here would leave the picker looking as though it worked while
 * reciprocity, which the generator enforces as a hard error, quietly broke. The UI's partner
 * picker (`availablePartners`) makes the "already partnered" case unreachable in normal use;
 * this is the bug guard for when it is reached anyway.
 */
function validateRelationships(guests: Guest[], guest: Guest): void {
  if (guest.partnerOf === guest.id) {
    throw new Error(`Guest ${guest.id}: cannot be their own partner`)
  }

  for (const conflictId of guest.conflictsWith) {
    if (conflictId === guest.id) {
      throw new Error(`Guest ${guest.id}: cannot conflict with themselves`)
    }
    if (!guests.some((candidate) => candidate.id === conflictId)) {
      throw new Error(`Guest ${guest.id}: conflictsWith names an unknown guest, ${conflictId}`)
    }
  }

  if (guest.partnerOf !== null) {
    const partner = guests.find((candidate) => candidate.id === guest.partnerOf)
    if (!partner) {
      throw new Error(`Guest ${guest.id}: partnerOf names an unknown guest, ${guest.partnerOf}`)
    }
    if (partner.partnerOf !== null && partner.partnerOf !== guest.id) {
      throw new Error(`Guest ${guest.id}: partner ${partner.id} already has a partner`)
    }
  }
}

/**
 * Appends `guest`, then applies reciprocity: writes `partnerOf` back onto the named partner,
 * and pushes `guest.id` onto each named conflict's `conflictsWith`. Appends rather than
 * sorting — row order is insertion order, so a new guest lands at the end of the list.
 *
 * A `conflictsWith` id repeated within `guest`'s own array is deduplicated (`dedupeIds`)
 * before it is stored or used to drive the reciprocal write — the same pair named twice in
 * one array is one conflict, not two (C9), and the array `guest` is stored under gets the
 * same treatment the reciprocal side already got.
 *
 * Throws (see `validateRelationships`) rather than silently accepting a `partnerOf` or
 * `conflictsWith` id that does not resolve, is the guest's own id, or names a guest already
 * partnered to someone else.
 */
export function addGuest(guests: Guest[], guest: Guest): Guest[] {
  validateRelationships(guests, guest)

  const conflictsWith = dedupeIds(guest.conflictsWith)
  let next = [...guests, { ...guest, conflictsWith }]

  if (guest.partnerOf !== null) {
    const partnerId = guest.partnerOf
    next = next.map((candidate) =>
      candidate.id === partnerId ? { ...candidate, partnerOf: guest.id } : candidate,
    )
  }

  if (conflictsWith.length > 0) {
    const conflictIds = new Set(conflictsWith)
    next = next.map((candidate) =>
      conflictIds.has(candidate.id)
        ? { ...candidate, conflictsWith: [...candidate.conflictsWith, guest.id] }
        : candidate,
    )
  }

  return next
}

/**
 * Replaces the guest with the matching `id` at the same index, then reconciles: if
 * `partnerOf` changed, clears the old partner's `partnerOf` and sets the new one's; diffs
 * `conflictsWith` against the stored value, adding `guest.id` to each newly named guest and
 * removing it from each dropped one — so the same conflict named twice in a row writes once.
 *
 * `guest.conflictsWith` is deduplicated (`dedupeIds`) before it is stored or diffed against,
 * the same as in `addGuest` — a duplicate within the incoming array collapses to one entry
 * rather than being carried into storage verbatim (C9).
 *
 * Throws if no guest has `guest.id`, and throws the same relationship errors as `addGuest`.
 */
export function updateGuest(guests: Guest[], guest: Guest): Guest[] {
  const previous = guests.find((candidate) => candidate.id === guest.id)
  if (!previous) {
    throw new Error(`Guest ${guest.id}: not found`)
  }

  validateRelationships(guests, guest)

  const conflictsWith = dedupeIds(guest.conflictsWith)
  let next = guests.map((candidate) =>
    candidate.id === guest.id ? { ...guest, conflictsWith } : candidate,
  )

  if (previous.partnerOf !== guest.partnerOf) {
    const oldPartnerId = previous.partnerOf
    const newPartnerId = guest.partnerOf
    next = next.map((candidate) => {
      if (candidate.id === oldPartnerId) return { ...candidate, partnerOf: null }
      if (candidate.id === newPartnerId) return { ...candidate, partnerOf: guest.id }
      return candidate
    })
  }

  const before = new Set(previous.conflictsWith)
  const after = new Set(conflictsWith)
  const added = new Set(conflictsWith.filter((id) => !before.has(id)))
  const removed = new Set(previous.conflictsWith.filter((id) => !after.has(id)))

  if (added.size > 0 || removed.size > 0) {
    next = next.map((candidate) => {
      if (added.has(candidate.id)) {
        return { ...candidate, conflictsWith: [...candidate.conflictsWith, guest.id] }
      }
      if (removed.has(candidate.id)) {
        return { ...candidate, conflictsWith: candidate.conflictsWith.filter((id) => id !== guest.id) }
      }
      return candidate
    })
  }

  return next
}

/**
 * Drops the guest, sets `partnerOf` to `null` on anyone whose partner they were, and filters
 * their id out of every `conflictsWith`. Returns `guests` unchanged (same reference) if `id`
 * is absent — a double-fired remove is plausible and there is nothing to corrupt.
 *
 * Undo is out of the MVP (KB-1), so this is final: nothing here holds a copy to restore from.
 */
export function removeGuest(guests: Guest[], id: string): Guest[] {
  if (!guests.some((candidate) => candidate.id === id)) {
    return guests
  }

  return guests
    .filter((candidate) => candidate.id !== id)
    .map((candidate) => {
      const partnerOf = candidate.partnerOf === id ? null : candidate.partnerOf
      const conflictsWith = candidate.conflictsWith.includes(id)
        ? candidate.conflictsWith.filter((conflictId) => conflictId !== id)
        : candidate.conflictsWith

      if (partnerOf === candidate.partnerOf && conflictsWith === candidate.conflictsWith) {
        return candidate
      }
      return { ...candidate, partnerOf, conflictsWith }
    })
}

/**
 * The partner picker's options (answer to B2, plan section 2, and A24): every guest with no
 * partner yet, excluding the guest being edited, plus that guest's own current partner if
 * they have one — so re-selecting an existing pairing is possible without first clearing it.
 * Order is list order.
 *
 * This predicate lives here rather than in the picker so it can never disagree with
 * `validateRelationships`'s "already partnered" guard — if the two disagreed, a user could
 * pick an option the picker offered and have the domain throw on save.
 */
export function availablePartners(guests: Guest[], editingId: string | null): Guest[] {
  const editing = editingId === null ? undefined : guests.find((candidate) => candidate.id === editingId)
  const currentPartnerId = editing?.partnerOf ?? null

  return guests.filter(
    (candidate) =>
      candidate.id !== editingId && (candidate.partnerOf === null || candidate.id === currentPartnerId),
  )
}

/**
 * Every distinct tag across the list, sorted alphabetically rather than left in insertion
 * order (`docs/engineering-standards.md`: no output may depend on key insertion order).
 */
export function tagsInUse(guests: Guest[]): string[] {
  const tags = new Set<string>()
  for (const guest of guests) {
    for (const tag of guest.tags) {
      tags.add(tag)
    }
  }
  return [...tags].sort()
}

/**
 * The single predicate behind both the Needs column (C20) and the summary's "with needs"
 * count (C27), so the two can never disagree. Allergies and accessibility only — a dietary
 * preference is a catering count, not a need (KB-2, KB-3).
 */
export function hasNeeds(guest: Guest): boolean {
  return guest.allergies.length > 0 || guest.accessibility.length > 0
}
