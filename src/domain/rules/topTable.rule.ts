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
 */
export const rule: SeatingRule = {
  id: 'top-table',
  severity: 'hard',
  remedy: 'seating',
  description: 'The top table contains only guests holding a protocol role, in the protocol order',
  evaluate: (plan) => {
    const table = plan.tables.find((candidate) => candidate.kind === 'top')
    if (!table) return []

    const expected = topTableRoleOrder(table.capacity)
    const findings: Finding[] = []

    table.seats.forEach((seat, index) => {
      if (!seat) return

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

    return findings
  },
}
