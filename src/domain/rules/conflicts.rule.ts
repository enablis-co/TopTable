import type { Guest } from '../types'
import type { SeatedTable } from '../seating'
import type { Finding, RulePlan, SeatingRule } from './contract'

/**
 * KB-2, hard: "Two guests recorded as in conflict must not share a table." `conflictsWith` is
 * reciprocal (KB-3) but not a trusted input, so a pair recorded on one side only, on both sides,
 * or listed twice over is still one pair — one chance, counted once (KB-8: `opportunities` is
 * every distinct unordered pair {a, b}, a ≠ b, with both on this guest list, seated or not;
 * `missed` is that chance not taken — the pair shares a table, or either half has no table at
 * all).
 *
 * Trap: a finding's `guestIds` must name both guests in the pair, or `seatGuardFrom` — which
 * matches a finding to a candidate seat by table id *and* guest id together — will detect the
 * conflict in the violations panel but never refuse the seat that creates it.
 */

/** Every guest this plan knows about, seated or not — the population pairs are read against.
 *  Rebuilt from `tables` and `unseated` rather than a single `guests` list, because `RulePlan`
 *  carries no such list directly. Copied from `partnersAdjacent.rule.ts`'s `knownGuestsById`, not
 *  imported: each rule stays self-contained (AGENTS.md). */
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

/** guestId -> the table holding that guest, in a real seat or its overflow: a guest pinned to a
 *  table with no room left still shares it (A3/C7). A guest with no entry here is unseated. */
function tableByGuestId(tables: RulePlan['tables']): Map<string, SeatedTable> {
  const byGuestId = new Map<string, SeatedTable>()

  for (const table of tables) {
    for (const seat of table.seats) {
      if (seat) byGuestId.set(seat.guest.id, table)
    }
    for (const seat of table.overflow) {
      byGuestId.set(seat.guest.id, table)
    }
  }

  return byGuestId
}

export const rule = {
  id: 'conflicts',
  severity: 'hard',
  remedy: 'seating',
  description: 'Two guests recorded as in conflict must not share a table',
  evaluate: (plan) => {
    const guests = knownGuestsById(plan)
    const tables = tableByGuestId(plan.tables)

    // One entry per unordered pair, keyed so a pair recorded on one side, both sides, or twice
    // over all collapse to the same key. `\u0000` cannot appear in a guest id, so two distinct
    // ids can never collide into one key.
    const pairs = new Map<string, readonly [string, string]>()
    for (const guest of guests.values()) {
      for (const id of guest.conflictsWith) {
        if (id === guest.id || !guests.has(id)) continue
        const [lo, hi] = guest.id < id ? [guest.id, id] : [id, guest.id]
        pairs.set(`${lo}\u0000${hi}`, [lo, hi])
      }
    }

    const findings: Finding[] = []
    let opportunities = 0
    let missed = 0

    // Sorted by plain comparison, never `localeCompare` — locale- and ICU-dependent, and would
    // make a deterministic rule's own internal order vary by machine.
    const sortedPairs = [...pairs.entries()].sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))

    for (const [, [lo, hi]] of sortedPairs) {
      opportunities += 1

      const tableA = tables.get(lo)
      const tableB = tables.get(hi)

      if (!tableA || !tableB) {
        // Either guest has no table at all — a chance this plan did not take, not a fault in the
        // seating it did make, so no Finding (mirrors partnersAdjacent.rule.ts).
        missed += 1
        continue
      }

      if (tableA.id === tableB.id) {
        missed += 1
        const guestA = guests.get(lo)
        const guestB = guests.get(hi)
        // guestA and guestB are guaranteed present: lo and hi both came from guests.values() or
        // a conflictsWith id already checked against guests.has(id) above.
        if (guestA && guestB) {
          findings.push({
            tableIds: [tableA.id],
            guestIds: [lo, hi],
            message: `${guestA.name} and ${guestB.name} are in conflict`,
            detail: tableA.label,
          })
        }
      }
    }

    // findings.length <= missed <= opportunities holds structurally: each pair increments
    // opportunities at most once, then missed at most once, and findings only inside the branch
    // that also just incremented missed — never the reverse.
    return { findings, opportunities, missed }
  },
} satisfies SeatingRule
