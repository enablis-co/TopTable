import type { AgeBand, Guest, Role, Side, SocialType } from '../../domain/types'

/**
 * TT-5, A12 (rewritten by the second-pass answer to B1). The panel's working value. `side` is
 * the one field that starts unset — "only name and side are required" is meaningless for side
 * unless side can be absent — so it carries a placeholder value the domain's `Side` never
 * does. `age` and `socialType` are *not* given the same treatment (A21, A23): both are
 * non-optional on `Guest`, TT-5 forbids requiring either, and both are visibly preselected
 * here rather than left blank and silently resolved on save.
 */
export type GuestDraft = {
  name: string
  side: Side | ''
  role: Role
  age: AgeBand
  /** '' converts to null on save (Guest.household is nullable; this field is not). */
  household: string
  partnerOf: string | null
  conflictsWith: string[]
  tags: string[]
  allergies: string[]
  dietaryPreferences: string[]
  accessibility: string[]
  socialType: SocialType
}

/** A fresh add-guest draft. Preselects age to 'adult' and socialType to 'sociable' (A21, A23). */
export function emptyDraft(): GuestDraft {
  return {
    name: '',
    side: '',
    role: 'guest',
    age: 'adult',
    household: '',
    partnerOf: null,
    conflictsWith: [],
    tags: [],
    allergies: [],
    dietaryPreferences: [],
    accessibility: [],
    socialType: 'sociable',
  }
}

/** Populates a draft from an existing guest, for the edit path through the same panel (C1). */
export function draftFromGuest(guest: Guest): GuestDraft {
  return {
    name: guest.name,
    side: guest.side,
    role: guest.role,
    age: guest.age,
    household: guest.household ?? '',
    partnerOf: guest.partnerOf,
    conflictsWith: guest.conflictsWith,
    tags: guest.tags,
    allergies: guest.allergies,
    dietaryPreferences: guest.dietaryPreferences,
    accessibility: guest.accessibility,
    socialType: guest.socialType,
  }
}

/**
 * Only name and side block a save (C3); every other field can be left as the panel opened.
 * Returns an empty object when the draft is valid. Messages say what is missing, not sorry
 * (KB-5), and are wired to their field through `aria-describedby` by the caller (C4).
 */
export function validateDraft(draft: GuestDraft): { name?: string; side?: string } {
  const errors: { name?: string; side?: string } = {}
  if (draft.name.trim() === '') {
    errors.name = 'Enter a name'
  }
  if (draft.side === '') {
    errors.side = 'Choose a side'
  }
  return errors
}

/**
 * Removes duplicate entries, keeping first-occurrence order. Reviewer finding (TT-5/TT-6
 * review): `src/domain/guests.ts` already normalises `conflictsWith` this way before it is
 * stored, but `tags`, `allergies`, `dietaryPreferences` and `accessibility` never pass through
 * that file at all — they are plain guest attributes, not relationships — so nothing dedupes
 * them. `PillInput`'s own `commit` now refuses to add a pill already present, which stops a
 * *new* duplicate being typed in, but storage is not a trusted input (docs/state.md): a guest
 * loaded from an already-tainted stored record — hand-edited, or saved before that PillInput
 * fix existed — can still carry a duplicate into `draftFromGuest` untouched. Deduping here, at
 * the point a draft becomes a `Guest`, means every save heals it, whether or not the field
 * that carries the duplicate was itself edited this time.
 */
function dedupe(values: string[]): string[] {
  return [...new Set(values)]
}

/**
 * Converts a valid draft to a `Guest`. Only call this once `validateDraft` returns no errors
 * — `side` is still typed `Side | ''` here, so an empty side throws rather than silently
 * writing an invalid `Guest.side`, which stays non-optional.
 */
export function guestFromDraft(draft: GuestDraft, id: string): Guest {
  if (draft.side === '') {
    throw new Error('guestFromDraft: side must be chosen before a draft can become a guest')
  }

  const household = draft.household.trim()

  return {
    id,
    name: draft.name.trim(),
    side: draft.side,
    role: draft.role,
    age: draft.age,
    household: household === '' ? null : household,
    partnerOf: draft.partnerOf,
    conflictsWith: draft.conflictsWith,
    tags: dedupe(draft.tags),
    allergies: dedupe(draft.allergies),
    dietaryPreferences: dedupe(draft.dietaryPreferences),
    accessibility: dedupe(draft.accessibility),
    socialType: draft.socialType,
  }
}
