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
  age: number
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
