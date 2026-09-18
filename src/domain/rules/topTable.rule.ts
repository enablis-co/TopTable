import { PROTOCOL_ROLES } from '../types'
import { topTableRoleOrder } from '../seating'
import type { SeatedTable } from '../seating'
import type { Finding, RulePlan, SeatingRule } from './contract'

/** Every role KB-4 gives a top table seat, for an O(1) "does this guest hold one" check. */
const PROTOCOL_ROLE_IDS = new Set<string>(PROTOCOL_ROLES)

/**
 * Every protocol role somebody on this guest list actually holds — walked from every table's
 * seats and overflow, plus the unseated, so a role nobody holds is never counted as a chance.
 * Private to this file, modelled on `partnersAdjacent.rule.ts`'s `knownGuestsById`: a rule stays
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
 * Protocol roles held by someone actually occupying a top table seat — pinned or not, right seat
 * or wrong. Reads `table.seats` only: `overflow` holds no seat index, so a role holder bumped
 * there is not "at the top table" for this purpose, only for `protocolRolesOnGuestList`'s wider
 * "held somewhere" check above.
 */
function protocolRolesSeatedAtTopTable(table: SeatedTable): ReadonlySet<string> {
  const roles = new Set<string>()
  for (const seat of table.seats) {
    if (seat && PROTOCOL_ROLE_IDS.has(seat.guest.role)) {
      roles.add(seat.guest.role)
    }
  }
  return roles
}

/**
 * KB-2, hard: the top table holds only guests with a protocol role, in KB-4's order. Reads
 * `topTableRoleOrder` — TT-13's own definition of that order — so the placement and this check
 * can never disagree.
 *
 * An empty seat is not a violation: `allocate`'s phase 1 leaves a role nobody holds `null`, and
 * KB-4 fixes the order, not that every seat is filled. The per-seat loop below only reads
 * `table.seats`; an over-capacity top table's overflow is the capacity rule's finding, so the
 * panel does not say the same thing twice. `protocolRolesOnGuestList`, above, is a separate pass
 * and does read every table's `overflow` — a role holder bumped there by capacity still counts as
 * held.
 *
 * A pinned occupant fires no finding, which diverges from KB-4's "no children, no partners of the
 * above, no exceptions". The seat is a human instruction that `allocate` honours rather than
 * overrides, so restoring the check to match that page would make every hand-pinned top table
 * seat a hard violation.
 *
 * `opportunities`/`missed` (TT-49, KB-8) score presence, not position. A seat is a chance only
 * when `topTableRoleOrder` names a role somebody on the guest list holds, or when the seat fires
 * a finding above. A pin names a table, never a seat index — `allocate` and `seatPins` drop a
 * pinned guest into whichever slot is free — so a pinned occupant's own seat is never judged;
 * only whether that role's holder sits *somewhere* at the top table is. `findings.length <=
 * missed <= opportunities` (`contract.ts`) holds because each fact is read once, never summed twice.
 */
export const rule = {
  id: 'top-table',
  severity: 'hard',
  // `remedy: 'flag'` is forced, not chosen: `contract.ts` types a hard `remedy: 'seating'` rule's
  // `evaluate` against `GuardPlan` (tables only), and this rule needs the full guest list. That
  // drops it out of `seatGuardFrom`'s guardable set, which is inert twice over even setting that
  // aside: `seatProtocolOverflowBlock` (phase 3) and `seatIntoFirstAllowedSeat` (phase 4) are the
  // only other callers of `allowSeat`, and — as `allocate`'s own doc comment says — both walk
  // round slots only, while every finding this rule raises carries `tableIds: ['top']`, a value
  // `seatGuardFrom`'s `finding.tableIds.includes(candidate.tableId)` can never match. A top table
  // becoming a fill destination must re-examine this; allocateWithRules.test.ts is the suite that
  // would catch it.
  remedy: 'flag',
  description: 'The top table contains only guests holding a protocol role, in the protocol order',
  evaluate: (plan) => {
    const table = plan.tables.find((candidate) => candidate.kind === 'top')
    if (!table) return { findings: [], opportunities: 0, missed: 0 }

    const expected = topTableRoleOrder(table.capacity)
    const rolesOnGuestList = protocolRolesOnGuestList(plan)
    const roleHeld = expected.map((role) => rolesOnGuestList.has(role))
    const seatedAtTopTable = protocolRolesSeatedAtTopTable(table)
    const findings: Finding[] = []
    let opportunities = 0
    let missed = 0

    table.seats.forEach((seat, index) => {
      const expectedRole = expected[index]
      let firesFinding = false

      // A pin fires no finding (TT-14): a human instruction, not a breach. An empty seat fires
      // none either — there is no occupant to complain about. Only an unpinned occupant can.
      if (seat && !seat.pinned) {
        const { guest } = seat
        const seatLabel = `Seat ${index + 1}`

        if (expectedRole === undefined || !PROTOCOL_ROLE_IDS.has(guest.role)) {
          firesFinding = true
          findings.push({
            tableIds: [table.id],
            guestIds: [guest.id],
            message: `${guest.name} is not a top table role`,
            detail: seatLabel,
          })
        } else if (guest.role !== expectedRole) {
          firesFinding = true
          findings.push({
            tableIds: [table.id],
            guestIds: [guest.id],
            message: `${guest.name} is in the wrong top table seat`,
            detail: `${seatLabel}, expected ${expectedRole}`,
          })
        }
      }

      // A seat is a chance only when its own role is held by someone on the list, or when it
      // fires a finding above — a pinned occupant's seat index was never a decision, so it is
      // judged by presence at the top table, not by where the solver happened to leave it.
      const isOpportunity = (expectedRole !== undefined && roleHeld[index]) || firesFinding
      if (!isOpportunity) return

      opportunities += 1

      const holderAbsent = expectedRole !== undefined && roleHeld[index] && !seatedAtTopTable.has(expectedRole)
      if (firesFinding || holderAbsent) {
        missed += 1
      }
    })

    return { findings, opportunities, missed }
  },
} satisfies SeatingRule
