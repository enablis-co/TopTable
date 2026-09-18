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
 * `opportunities` (TT-49, KB-8) counts a top-table seat when `topTableRoleOrder` names it a
 * protocol role somebody on this guest list holds, or when the seat fires a finding below — so
 * `findings.length <= missed <= opportunities` (`contract.ts`) holds by construction, even for an
 * unpinned interloper in a seat whose own role nobody holds. `missed` counts a seat as a chance
 * lost when it is empty and its role is held, when it fires a finding, or when it is pinned to
 * someone other than that seat's own role holder while the role is held — a pin never fires a
 * finding, but a chance the guest list gave and the plan did not take is still a miss (KB-8).
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
        // A pin never fires a finding (TT-14): a human instruction, not a breach. But KB-8 scores
        // a chance given and not taken as a miss regardless of why, so the pin only takes the
        // chance when it seats this seat's own role holder — that guest is necessarily counted in
        // `rolesOnGuestList`, so the role is held here too. Anyone else pinned into a seat whose
        // role is held is quiet, but still a chance missed, exactly as an empty held seat would be.
        const { guest } = seat
        if (expectedRole !== undefined && guest.role === expectedRole) {
          opportunities += 1
        } else if (roleHeld[index]) {
          opportunities += 1
          missed += 1
        }
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
      } else {
        // Correctly filled: the occupant holds this seat's own role, so that role is necessarily
        // held on the guest list — a chance this plan took.
        opportunities += 1
      }
    })

    return { findings, opportunities, missed }
  },
} satisfies SeatingRule
