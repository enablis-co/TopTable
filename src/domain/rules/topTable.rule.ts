import { PROTOCOL_ROLES } from '../types'
import { topTableRoleOrder } from '../seating'
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
 * `opportunities` (TT-49, KB-8) counts a top-table seat when `topTableRoleOrder` names it a
 * protocol role somebody on this guest list actually holds, **or** when the seat fires a finding
 * below (occupied, unpinned, by someone who should not be in it) — not the table's raw capacity.
 * A guest list holding none of KB-4's roles, on a plan with nothing wrongly seated, gives this
 * rule nothing to count, so it drops out of the mean rather than scoring a false 1.0, and a top
 * table wider than the roles in play never inflates the denominator with seats nobody could ever
 * fill. The second half of the "or" exists so that `findings.length <= missed <= opportunities`
 * (`contract.ts`) holds by construction: a wrong, unpinned occupant is always a miss, even in a
 * seat whose own role nobody on the list holds, and that miss must count as an opportunity or the
 * invariant breaks (a version of this rule that counted only role-held seats could report `missed
 * > opportunities` here — caught in review, not by a fixture, because the fixture had been shaped
 * to avoid the case rather than expose it). `missed` counts a seat as a chance lost exactly when
 * it is empty and its role is held, or when it fires a finding; every missed seat is therefore an
 * opportunity by construction. A pinned seat is never missed but stays an opportunity when its
 * role is held.
 */
export const rule = {
  id: 'top-table',
  severity: 'hard',
  // `remedy: 'flag'` is forced, not chosen: `contract.ts` types a hard `remedy: 'seating'` rule's
  // `evaluate` against `GuardPlan` (tables only), and this rule needs the full guest list. That
  // drops it out of `seatGuardFrom`'s guardable set, which is inert twice over even setting that
  // aside: phase 3 (`seatProtocolOverflowBlock`, `allocate.ts:282-287`) is the only other phase
  // that calls `allowSeat`, and it only ever offers round-table candidates, while every finding
  // this rule raises carries `tableIds: ['top']` — a value `seatGuardFrom`'s
  // `finding.tableIds.includes(candidate.tableId)` can never match. A top table becoming a fill
  // destination must re-examine this; allocateWithRules.test.ts is the suite that would catch it.
  remedy: 'flag',
  description: 'The top table contains only guests holding a protocol role, in the protocol order',
  evaluate: (plan) => {
    const table = plan.tables.find((candidate) => candidate.kind === 'top')
    if (!table) return { findings: [], opportunities: 0, missed: 0 }

    const expected = topTableRoleOrder(table.capacity)
    const rolesOnGuestList = protocolRolesOnGuestList(plan)
    const roleHeld = expected.map((role) => rolesOnGuestList.has(role))
    const findings: Finding[] = []
    let opportunities = 0
    let missed = 0

    table.seats.forEach((seat, index) => {
      const expectedRole = expected[index]

      if (!seat) {
        // Empty and held is a chance this list gave the table and the plan did not take.
        if (roleHeld[index]) {
          opportunities += 1
          missed += 1
        }
        return
      }

      if (seat.pinned) {
        // A pin is a deliberate placement, never a miss — but the seat is still an opportunity
        // when its role is held, exactly as an empty or correctly-filled one would be.
        if (roleHeld[index]) opportunities += 1
        return
      }

      const { guest } = seat
      const seatLabel = `Seat ${index + 1}`

      if (expectedRole === undefined || !PROTOCOL_ROLE_IDS.has(guest.role)) {
        // A finding is always a chance this rule had, whether or not the seat's own role is held
        // by anyone on the list — otherwise a miss could be reported with no opportunity behind
        // it (contract.ts's `missed <= opportunities`).
        opportunities += 1
        missed += 1
        findings.push({
          tableIds: [table.id],
          guestIds: [guest.id],
          message: `${guest.name} is not a top table role`,
          detail: seatLabel,
        })
      } else if (guest.role !== expectedRole) {
        opportunities += 1
        missed += 1
        findings.push({
          tableIds: [table.id],
          guestIds: [guest.id],
          message: `${guest.name} is in the wrong top table seat`,
          detail: `${seatLabel}, expected ${expectedRole}`,
        })
      } else if (roleHeld[index]) {
        // Correctly filled and the role is held: a chance this plan took.
        opportunities += 1
      }
    })

    return { findings, opportunities, missed }
  },
} satisfies SeatingRule
