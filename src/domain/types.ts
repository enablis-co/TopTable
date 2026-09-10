/**
 * The domain model. Field names and types come from KB-3, the protocol roles and their
 * seat order from KB-4. Nothing here knows about rendering, storage or React.
 */

/** KB-3. Required on every guest. */
export type Side = 'bride' | 'groom' | 'both'

/**
 * KB-4. The eight protocol roles in top table seat order, left to right. The order is the
 * page's order and is not negotiable: the venue has it printed and the photographer's
 * running order depends on it. Read positionally, never re-sorted.
 */
export const PROTOCOL_ROLES = [
  'chief bridesmaid',
  'father of the groom',
  'mother of the bride',
  'groom',
  'bride',
  'father of the bride',
  'mother of the groom',
  'best man',
] as const

export type ProtocolRole = (typeof PROTOCOL_ROLES)[number]

/** KB-3. Everyone who holds no protocol role. */
export const OTHER_ROLES = ['guest', 'bridesmaid', 'groomsman', 'usher'] as const

export type OtherRole = (typeof OTHER_ROLES)[number]

export type Role = ProtocolRole | OtherRole

/**
 * Product decision, 2026-09-09 (superseding KB-3 — see the comment on `Guest.age`). Ascending:
 * baby is under 4, child is 4-9, teen is 10-17, adult is 18 and over.
 */
export const AGE_BANDS = ['baby', 'child', 'teen', 'adult'] as const

export type AgeBand = (typeof AGE_BANDS)[number]

export function isAgeBand(value: unknown): value is AgeBand {
  return typeof value === 'string' && (AGE_BANDS as readonly string[]).includes(value)
}

/**
 * The 4/10/18 boundaries above, as data a caller can read rather than only as that comment's
 * prose. `scripts/generate-scenarios.mjs` keeps its own copy of these same three numbers in
 * its `ageBand()` — it is a plain Node script and cannot import this file (verified: no
 * `tsx`/`ts-node`/register hook in `devDependencies`, and Node is pinned at 22.14.0 with no
 * strip-types flag) — and `src/domain/scenarioAges.test.ts` checks the two against each other
 * at every edge (3/4, 9/10, 17/18) so they cannot drift apart silently.
 *
 * `src/screens/guests/GuestPanel.tsx`'s `AGE_BAND_LABELS` states these same three numbers a
 * third time, in its option-label prose ("under 4", "under 10", "under 18"). Nothing stops it
 * reading its bounds from here instead — that is `ui-developer`'s edit to make, not this one's.
 */
export const AGE_BAND_UPPER_BOUND: Record<Exclude<AgeBand, 'adult'>, number> = {
  baby: 4,
  child: 10,
  teen: 18,
}

/** Converts a raw age in years to its band, using the boundaries above. */
export function ageBandFromYears(years: number): AgeBand {
  if (years < AGE_BAND_UPPER_BOUND.baby) return 'baby'
  if (years < AGE_BAND_UPPER_BOUND.child) return 'child'
  if (years < AGE_BAND_UPPER_BOUND.teen) return 'teen'
  return 'adult'
}

/** KB-3. Drives the social balance rule in KB-2. */
export type SocialType = 'livewire' | 'sociable' | 'quiet'

/**
 * KB-3 types these four as `string[]`, not as enums, so they stay open. The known
 * vocabularies below are for pickers and for generating scenarios; they do not constrain
 * what a guest may carry. `tags` is free text by definition.
 */
export const KNOWN_ALLERGIES = ['nuts', 'shellfish', 'sesame', 'dairy'] as const
export const KNOWN_DIETARY_PREFERENCES = [
  'vegetarian',
  'vegan',
  'pescatarian',
  'halal',
  'gluten free',
] as const
export const KNOWN_ACCESSIBILITY_NEEDS = [
  'step-free access',
  'away from the speakers',
  'near an exit',
] as const

/**
 * KB-3, thirteen fields.
 *
 * `partnerOf` and `conflictsWith` are reciprocal: they appear on both guests in a pair and
 * either side resolves the relationship. Whatever writes them is responsible for keeping
 * both sides in step.
 *
 * `allergies` and `dietaryPreferences` are separate fields deliberately and must never be
 * merged into one list. An allergy is a safety matter with a hard rule attached (KB-2). A
 * dietary preference is a catering count and is not a violation of anything.
 */
export type Guest = {
  id: string
  name: string
  side: Side
  role: Role
  /**
   * KB-3 types this `number` and says "Always present. Drives the generation mix rule."
   * Both clauses are wrong as of the product decision of 2026-09-09: this field holds one of
   * the four `AgeBand`s above, not a number, and a band cannot answer KB-2's generation-mix
   * rule ("at least one guest over 30 and one under 30") — `adult` alone spans both sides of
   * that line. TT-20 owns the rule and has to re-specify it against bands before it can be
   * built. KB-3 has not been updated to match; this comment is the record of the divergence
   * until it is.
   */
  age: AgeBand
  /** Who arrived together. Null when the guest came alone. */
  household: string | null
  /** Guest id. Reciprocal. */
  partnerOf: string | null
  /** Guest ids. Reciprocal. */
  conflictsWith: string[]
  tags: string[]
  /** A safety matter. Hard constraint in KB-2. */
  allergies: string[]
  /** A catering count. Never a violation. */
  dietaryPreferences: string[]
  /** Recorded, not yet used by any rule. */
  accessibility: string[]
  socialType: SocialType
}

/**
 * KB-1, three numbers. Total seats is `roundTables * seatsEach + topTableSeats`.
 *
 * Seats may exceed guests. Seats may fall short of guests, which is a warning and never a
 * block. The derived capacity figures belong to the setup screen, TT-3.
 */
export type RoomConfig = {
  roundTables: number
  seatsEach: number
  topTableSeats: number
}

/** KB-6 shows one free text field, for example "Priya and Tom, 14 March". */
export type EventDetails = {
  name: string
}

/**
 * A pin is a human decision, not a derivation, so — unlike the rest of a plan — it is stored
 * (KB-1, "Pinning is the idea the product turns on"). `tableId` is opaque here: the domain
 * matches on `guestId` only and never interprets the address, which today is the Plan screen's
 * `TableSlot.id`. TT-13 defines a table address canonically.
 */
export type Pin = {
  guestId: string
  tableId: string
}
