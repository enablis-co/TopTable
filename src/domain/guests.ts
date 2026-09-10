import type { Guest, Pin } from './types'
import { unpinGuest } from './pins'

/**
 * The whole of reciprocal relationship handling for the guest list, and the only place it
 * lives (AGENTS.md, docs/state.md). `partnerOf` and `conflictsWith` are reciprocal — present
 * on both guests, resolvable from either direction (KB-3) — so every write here touches every
 * guest the change implicates, never just the one the caller named.
 *
 * Pure throughout: every function returns a new array and new objects for the guests it
 * changes, never mutates an input, and never touches a guest it does not need to change.
 *
 * One policy for a bad id, held consistently across all three writers below rather than as
 * three separate habits: a write throws when the id it was given cannot be honoured without
 * either guessing at the caller's intent or silently discarding something — `addGuest` given
 * an id already in the list (overwrite the existing guest? append a second row sharing its
 * id, so every `find` in the codebase becomes ambiguous? neither is a repair), `updateGuest`
 * given an id that names nobody (there is no record to reconcile the patch against). A write
 * is a silent no-op only when the state the caller wants is already true and nothing is lost
 * by not acting on it — `removeGuest` given an id already absent, where "this guest is gone"
 * is both what was asked for and what already holds.
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
 * same treatment the reciprocal side already got. The reciprocal push onto the *other*
 * guest's `conflictsWith` is separately guarded by an `includes` check, so it stays
 * idempotent even against a target that already carries the id — storage is not a trusted
 * input (`docs/state.md`) and `isTopTableData` validates no individual guest field, so a
 * one-sided `conflictsWith` is representable there before this function ever runs.
 *
 * Throws (see `validateRelationships`) rather than silently accepting a `partnerOf` or
 * `conflictsWith` id that does not resolve, is the guest's own id, or names a guest already
 * partnered to someone else. Also throws if `guest.id` already names a guest in `guests` —
 * see the file header for why this, and not a silent no-op or an overwrite, is the policy.
 */
export function addGuest(guests: Guest[], guest: Guest): Guest[] {
  if (guests.some((candidate) => candidate.id === guest.id)) {
    throw new Error(`Guest ${guest.id}: already exists`)
  }

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
      conflictIds.has(candidate.id) && !candidate.conflictsWith.includes(guest.id)
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
 * rather than being carried into storage verbatim (C9). The add side of that diff is also
 * guarded by an `includes` check against the *other* guest's own array, so reconciling stays
 * idempotent even when that guest already carries the id from a one-sided stored state
 * (`docs/state.md`: storage is not a trusted input, and `isTopTableData` checks no individual
 * guest field) — without the guard, reconciling the same edit twice, or reconciling against a
 * target that already (wrongly) has the id, would grow a duplicate nothing here would remove.
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
      if (added.has(candidate.id) && !candidate.conflictsWith.includes(guest.id)) {
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
 * Drops the guest, then reconciles the other two: nulls the ex-partner's `partnerOf`, filters
 * the id out of every `conflictsWith`, and clears any pin naming them via `unpinGuest`
 * (src/domain/pins.ts) — all three inside this one function, so nothing calling it can do two
 * and forget the third.
 *
 * Returns `guests` unchanged (same reference) if `id` is absent — a double-fired remove is
 * plausible and there is nothing to corrupt — and `unpinGuest` gives `pins` that same
 * guarantee, clearing a pin stranded there even when the guest it named is already gone.
 *
 * Undo is out of the MVP (KB-1), so this is final: nothing here holds a copy to restore from.
 */
export function removeGuest(
  guests: Guest[],
  pins: Pin[],
  id: string,
): { guests: Guest[]; pins: Pin[] } {
  if (!guests.some((candidate) => candidate.id === id)) {
    return { guests, pins: unpinGuest(pins, id) }
  }

  const nextGuests = guests
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

  return { guests: nextGuests, pins: unpinGuest(pins, id) }
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
