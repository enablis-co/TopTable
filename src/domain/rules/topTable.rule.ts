import { PROTOCOL_ROLES } from '../types'
import { topTableRoleOrder } from '../seating'
import type { Finding, RulePlan, SeatingRule } from './contract'

/** Every role KB-4 gives a top table seat, for an O(1) "does this guest hold one" check. */
const PROTOCOL_ROLE_IDS = new Set<string>(PROTOCOL_ROLES)

/**
 * Every protocol role somebody on this guest list actually holds — walked from every table's
 * seats and overflow, plus the unseated, so a role nobody holds is never counted as a chance
 * (A4). Private to this file, on `partnersAdjacent.rule.ts`'s `knownGuestsById`: a rule stays
 * self-contained rather than sharing a helper across two files.
 */
function protocolRolesOnGuestList(plan: RulePlan): ReadonlySet<string> {
  const roles = new Set<string>()
  const record = (role: string) => {
    if (PROTOCOL_ROLE_IDS.has(role)) roles.add(role)
  }

  for (const table of plan.tables) {
    for (const seat of table.seats) {
      if (seat) record(seat.guest.role)
    }
    for (const seat of table.overflow) {
      record(seat.guest.role)
    }
  }
  for (const guest of plan.unseated) {
    record(guest.role)
  }

  return roles
}

/**
 * KB-2, hard: the top table holds only guests with a protocol role, in KB-4's order. Reads
 * `topTableRoleOrder` — TT-13's own definition of that order — so the placement and this check
 * can never disagree.
 *
 * An empty seat is not a violation: `allocate`'s phase 1 leaves a role nobody holds `null`, and
 * KB-4 fixes the order, not that every seat is filled. `table.overflow` is not read here — an
 * over-capacity top table is the capacity rule's finding, so the panel does not say the same
 * thing twice.
 *
 * A pinned occupant is exempt, which diverges from KB-4's "no children, no partners of the
 * above, no exceptions". The seat is a human instruction that `allocate` honours rather than
 * overrides, so restoring the check to match that page would make every hand-pinned top table
 * seat a hard violation.
 *
 * `opportunities` (TT-49, KB-8) is the top table's capacity, flat — never a function of who is
 * seated or pinned, so an incomplete plan cannot outscore a complete one. `missed` counts a seat
 * as a chance lost only when the guest list holds that seat's protocol role: an occupied,
 * unpinned seat that fires a finding, or an empty seat whose role somebody on the list holds. A
 * role nobody holds costs nothing while its seat sits empty.
 */
export const rule = {
  id: 'top-table',
  severity: 'hard',
  // No longer in seatGuardFrom's set — inert only because allocate.ts's phase 4 (the only phase
  // that calls allowSeat) is round tables only. A top table becoming a fill destination must
  // re-examine this; allocateWithRules.test.ts is the suite that would catch it.
  remedy: 'flag',
  description: 'The top table contains only guests holding a protocol role, in the protocol order',
  evaluate: (plan) => {
    const table = plan.tables.find((candidate) => candidate.kind === 'top')
    if (!table) return { findings: [], opportunities: 0, missed: 0 }

    const expected = topTableRoleOrder(table.capacity)
    const rolesOnGuestList = protocolRolesOnGuestList(plan)
    const opportunities = table.capacity
    const findings: Finding[] = []
    let missed = 0

    table.seats.forEach((seat, index) => {
      const expectedRole = expected[index]

      if (!seat) {
        if (expectedRole !== undefined && rolesOnGuestList.has(expectedRole)) missed += 1
        return
      }
      if (seat.pinned) return

      const { guest } = seat
      const seatLabel = `Seat ${index + 1}`

      if (expectedRole === undefined || !PROTOCOL_ROLE_IDS.has(guest.role)) {
        missed += 1
        findings.push({
          tableIds: [table.id],
          guestIds: [guest.id],
          message: `${guest.name} is not a top table role`,
          detail: seatLabel,
        })
      } else if (guest.role !== expectedRole) {
        missed += 1
        findings.push({
          tableIds: [table.id],
          guestIds: [guest.id],
          message: `${guest.name} is in the wrong top table seat`,
          detail: `${seatLabel}, expected ${expectedRole}`,
        })
      }
    })

    return { findings, opportunities, missed }
  },
} satisfies SeatingRule
