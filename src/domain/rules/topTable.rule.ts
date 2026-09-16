import { PROTOCOL_ROLES } from '../types'
import { topTableRoleOrder } from '../seating'
import type { Finding, SeatingRule } from './contract'

/** Every role KB-4 gives a top table seat, for an O(1) "does this guest hold one" check. */
const PROTOCOL_ROLE_IDS = new Set<string>(PROTOCOL_ROLES)

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
 * `opportunities` (TT-16) is the count of non-pinned occupied top-table seats — exactly the set
 * the `forEach` below judges, counted in that same pass. No top table, or a top table whose
 * every occupant is pinned, reports 0. `missed` equals `findings.length`: every judged seat
 * produces at most one finding, so the two count the same thing one-to-one. Being hard, neither
 * ever scores. No `weight`.
 */
export const rule = {
  id: 'top-table',
  severity: 'hard',
  remedy: 'seating',
  description: 'The top table contains only guests holding a protocol role, in the protocol order',
  evaluate: (plan) => {
    const table = plan.tables.find((candidate) => candidate.kind === 'top')
    if (!table) return { findings: [], opportunities: 0, missed: 0 }

    const expected = topTableRoleOrder(table.capacity)
    const findings: Finding[] = []
    let opportunities = 0

    table.seats.forEach((seat, index) => {
      if (!seat || seat.pinned) return
      opportunities += 1

      const { guest } = seat
      const expectedRole = expected[index]
      const seatLabel = `Seat ${index + 1}`

      if (expectedRole === undefined || !PROTOCOL_ROLE_IDS.has(guest.role)) {
        findings.push({
          tableIds: [table.id],
          guestIds: [guest.id],
          message: `${guest.name} is not a top table role`,
          detail: seatLabel,
        })
      } else if (guest.role !== expectedRole) {
        findings.push({
          tableIds: [table.id],
          guestIds: [guest.id],
          message: `${guest.name} is in the wrong top table seat`,
          detail: `${seatLabel}, expected ${expectedRole}`,
        })
      }
    })

    return { findings, opportunities, missed: findings.length }
  },
} satisfies SeatingRule
