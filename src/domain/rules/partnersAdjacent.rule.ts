import type { Guest } from '../types'
import type { SeatedTable } from '../seating'
import { adjacentSeats } from '../seating'
import type { Finding, SeatingRule } from './contract'

/**
 * KB-2, soft: partners should sit next to each other, "not merely at the same table". Builds
 * its own guest-location index rather than calling `seating.ts`'s `seatOf`, which needs a full
 * `SeatingPlan` (a rule is never given `unseated`) and answers a different question — "which
 * table", not "which seat, and is it next to this one".
 */

type Location = { table: SeatedTable; seatIndex: number | null; guest: Guest }

function locationsByGuestId(tables: readonly SeatedTable[]): Map<string, Location> {
  const locations = new Map<string, Location>()

  for (const table of tables) {
    table.seats.forEach((seat, seatIndex) => {
      if (seat) locations.set(seat.guest.id, { table, seatIndex, guest: seat.guest })
    })
    for (const seat of table.overflow) {
      locations.set(seat.guest.id, { table, seatIndex: null, guest: seat.guest })
    }
  }

  return locations
}

/** Overflow means no seat at all, so never adjacent to anything — only seated pairs can meet KB-2's rule. */
function isAdjacent(a: Location, b: Location): boolean {
  if (a.seatIndex === null || b.seatIndex === null) return false
  if (a.table.id !== b.table.id) return false
  return adjacentSeats(a.table, a.seatIndex).includes(b.seatIndex)
}

function findingFor(a: Location, b: Location): Finding {
  const sameTable = a.table.id === b.table.id

  return {
    tableIds: sameTable ? [a.table.id] : [a.table.id, b.table.id],
    guestIds: [a.guest.id, b.guest.id],
    message: `${a.guest.name} and ${b.guest.name} are not sitting together`,
    detail: sameTable ? a.table.label : `${a.table.label} and ${b.table.label}`,
  }
}

export const rule: SeatingRule = {
  id: 'partners-adjacent',
  severity: 'soft',
  remedy: 'seating',
  description: 'Partners should sit next to each other, not merely at the same table',
  evaluate: (plan) => {
    const locations = locationsByGuestId(plan.tables)
    const findings: Finding[] = []
    const reportedPairs = new Set<string>()

    for (const location of locations.values()) {
      const { partnerOf } = location.guest
      if (partnerOf === null) continue

      // Sorted, not `a.id < b.id`-gated: a one-sided `partnerOf` (KB-3 asks writers to keep
      // both sides in step, but storage is not a trusted input) must still be reported once,
      // not silently dropped whenever the lone id happens to sort second.
      const pairKey = [location.guest.id, partnerOf].sort().join('::')
      if (reportedPairs.has(pairKey)) continue
      reportedPairs.add(pairKey)

      const partnerLocation = locations.get(partnerOf)
      if (!partnerLocation) continue // unseated: KB-2's rule is about where two seated people sit

      if (!isAdjacent(location, partnerLocation)) {
        findings.push(findingFor(location, partnerLocation))
      }
    }

    return findings
  },
}
