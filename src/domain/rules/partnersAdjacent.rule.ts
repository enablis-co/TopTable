import type { Guest } from '../types'
import type { SeatedTable } from '../seating'
import { adjacentSeats } from '../seating'
import type { Finding, RulePlan, SeatingRule } from './contract'

/**
 * KB-2, soft: partners should sit next to each other, "not merely at the same table".
 *
 * `opportunities` counts every partner pair on the guest list, seated or not — never a function
 * of how much of the plan is filled in (TT-16; see `RuleAssessment` in `contract.ts`). A pair
 * where at least one partner has no real seat — unseated, or in a table's overflow, the same fact
 * — is `missed` but never a `Finding`: it is a chance this plan did not take, not a fault in the
 * seating it did make.
 */

type Location = { table: SeatedTable; seatIndex: number | null }
/** A location with a real seat — the only kind `isAdjacent` and a `Finding` can be built from. */
type SeatedLocation = { table: SeatedTable; seatIndex: number }

/** Seated and overflow guests, keyed by id. Overflow is recorded with `seatIndex: null` — present
 *  on this plan, but not given a real seat, which is what keeps it out of `isAdjacent`. */
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

function isAdjacent(a: SeatedLocation, b: SeatedLocation): boolean {
  if (a.table.id !== b.table.id) return false
  return adjacentSeats(a.table, a.seatIndex).includes(b.seatIndex)
}

function findingFor(aGuest: Guest, aLocation: SeatedLocation, bGuest: Guest, bLocation: SeatedLocation): Finding {
  const sameTable = aLocation.table.id === bLocation.table.id

  return {
    tableIds: sameTable ? [aLocation.table.id] : [aLocation.table.id, bLocation.table.id],
    guestIds: [aGuest.id, bGuest.id],
    message: `${aGuest.name} and ${bGuest.name} are not sitting together`,
    detail: sameTable ? aLocation.table.label : `${aLocation.table.label} and ${bLocation.table.label}`,
  }
}

/** Every guest this plan knows about, seated or not — the population `opportunities` counts
 *  pairs over. Rebuilt from `tables` and `unseated` rather than a single `guests` list, because
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

export const rule = {
  id: 'partners-adjacent',
  severity: 'soft',
  remedy: 'seating',
  description: 'Partners should sit next to each other, not merely at the same table',
  evaluate: (plan) => {
    const guests = knownGuestsById(plan)
    const locations = locationsByGuestId(plan.tables)
    const findings: Finding[] = []
    const reportedPairs = new Set<string>()
    let opportunities = 0
    let missed = 0

    for (const guest of guests.values()) {
      const { partnerOf } = guest
      if (partnerOf === null) continue

      // Sorted, not `a.id < b.id`-gated: a one-sided `partnerOf` (KB-3 asks writers to keep both
      // sides in step, but storage is not a trusted input) must still be counted once, not
      // silently dropped whenever the lone id happens to sort second.
      const pairKey = [guest.id, partnerOf].sort().join('::')
      if (reportedPairs.has(pairKey)) continue
      reportedPairs.add(pairKey)

      const partner = guests.get(partnerOf)
      if (!partner) continue // the named partner is not on this guest list at all

      // Every pair this guest list contains is one opportunity, seated or not — the fix to the
      // defect this file used to have, where an unseated pair cost the score nothing.
      opportunities += 1

      const guestSeat = seatedLocation(locations.get(guest.id))
      const partnerSeat = seatedLocation(locations.get(partner.id))

      if (!guestSeat || !partnerSeat) {
        // At least one partner has no real seat — unseated or overflow, the same fact. A chance
        // this plan did not take, not a fault in the seating it did make, so no Finding.
        missed += 1
        continue
      }

      if (!isAdjacent(guestSeat, partnerSeat)) {
        missed += 1
        findings.push(findingFor(guest, guestSeat, partner, partnerSeat))
      }
    }

    // findings.length <= missed <= opportunities holds structurally: each pair increments
    // opportunities at most once, then missed at most once, and findings only inside the branch
    // that also just incremented missed — never the reverse.
    return { findings, opportunities, missed }
  },
} satisfies SeatingRule
