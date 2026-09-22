import type { Guest } from '../types'
import type { SeatedTable } from '../seating'
import type { Finding, RulePlan, SeatingRule } from './contract'

/**
 * KB-2, soft: "A household should not be spread across more than two tables".
 *
 * `opportunities` counts only households of three or more members (A1): a household of one or
 * two can never occupy more than two tables, so it is not a chance this rule could have missed,
 * and counting it anyway would inflate the score for free. A household with any member lacking a
 * real seat — unseated, or in a table's overflow, the same fact (A4) — is `missed` but raises no
 * `Finding` (A2): a chance this plan did not take, not a fault in the seating it did make, the
 * same convention as `partnersAdjacent.rule.ts`.
 */

type Location = { table: SeatedTable; seatIndex: number | null }
/** A location with a real seat — the only kind that counts toward a household's distinct tables. */
type SeatedLocation = { table: SeatedTable; seatIndex: number }

/** Seated and overflow guests, keyed by id. Overflow is recorded with `seatIndex: null` — present
 *  on this plan, but not given a real seat (A4). */
function locationsByGuestId(tables: readonly SeatedTable[]): Map<string, Location> {
  const locations = new Map<string, Location>()

  for (const table of tables) {
    table.seats.forEach((seat, seatIndex) => {
      if (seat) locations.set(seat.guest.id, { table, seatIndex })
    })
    for (const seat of table.overflow) {
      locations.set(seat.guest.id, { table, seatIndex: null })
    }
  }

  return locations
}

/** Only a location with a real seat index counts as seated — overflow's `seatIndex: null` and an
 *  entirely absent location (unseated) are treated alike, on purpose. */
function seatedLocation(location: Location | undefined): SeatedLocation | null {
  if (!location || location.seatIndex === null) return null
  return { table: location.table, seatIndex: location.seatIndex }
}

/** Every guest this plan knows about, seated or not — the population households are grouped
 *  from. Rebuilt from `tables` and `unseated` rather than a single `guests` list, because
 *  `RulePlan` carries no such list directly. */
function knownGuestsById(plan: RulePlan): Map<string, Guest> {
  const guests = new Map<string, Guest>()

  for (const table of plan.tables) {
    for (const seat of table.seats) {
      if (seat) guests.set(seat.guest.id, seat.guest)
    }
    for (const seat of table.overflow) {
      guests.set(seat.guest.id, seat.guest)
    }
  }
  for (const guest of plan.unseated) {
    guests.set(guest.id, guest)
  }

  return guests
}

/** Guests grouped by their exact `household` string (A5: no trimming, no case folding — an
 *  identity KB-3 leaves as plain text, and inventing a normalisation here would be a second,
 *  undocumented definition of who arrived together). A null household is not a household (A3
 *  of TT-19's criteria — criterion 3 here). */
function householdsByName(guests: Iterable<Guest>): Map<string, Guest[]> {
  const households = new Map<string, Guest[]>()

  for (const guest of guests) {
    if (guest.household === null) continue

    const members = households.get(guest.household)
    if (members) members.push(guest)
    else households.set(guest.household, [guest])
  }

  return households
}

function findingFor(household: string, seatedMembers: readonly Guest[], seatedTables: readonly SeatedTable[]): Finding {
  const tableIds = seatedTables.map((table) => table.id).sort()
  const tableLabels = seatedTables.map((table) => table.label).sort()

  return {
    tableIds,
    guestIds: seatedMembers.map((member) => member.id),
    message: `${household} is spread across ${tableIds.length} tables`,
    detail: tableLabels.join(', '),
  }
}

export const rule = {
  id: 'household-together',
  severity: 'soft',
  remedy: 'seating',
  description: 'A household should not be spread across more than two tables',
  evaluate: (plan) => {
    const guests = knownGuestsById(plan)
    const locations = locationsByGuestId(plan.tables)
    const households = householdsByName(guests.values())
    const findings: Finding[] = []
    let opportunities = 0
    let missed = 0

    // Sorted household names so iteration order never depends on Map insertion order
    // (docs/engineering-standards.md).
    for (const household of [...households.keys()].sort()) {
      const members = households.get(household)!
      if (members.length < 3) continue // A1: not a chance this rule could have missed

      opportunities += 1

      const seatedTablesById = new Map<string, SeatedTable>()
      const seatedMembers: Guest[] = []
      let everyoneSeated = true

      for (const member of members) {
        const location = seatedLocation(locations.get(member.id))
        if (location) {
          seatedTablesById.set(location.table.id, location.table)
          seatedMembers.push(member)
        } else {
          everyoneSeated = false
        }
      }

      const spread = seatedTablesById.size >= 3
      if (!everyoneSeated || spread) {
        missed += 1
      }
      if (spread) {
        findings.push(findingFor(household, seatedMembers, [...seatedTablesById.values()]))
      }
    }

    // findings.length <= missed <= opportunities holds structurally: a finding is only ever
    // pushed for a household that has just incremented missed, and missed only inside a
    // household that has just incremented opportunities.
    return { findings, opportunities, missed }
  },
} satisfies SeatingRule
