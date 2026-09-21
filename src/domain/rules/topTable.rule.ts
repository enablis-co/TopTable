import { PROTOCOL_ROLES } from '../types'
import type { ProtocolRole } from '../types'
import { topTableRoleOrder, topTableSeatPlacement } from '../seating'
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
 * How many of this table's seats hold a pinned occupant with no protocol role — the count
 * `allocate.ts`'s `seatTopTable` uses to decide how far KB-4's role order is reduced. Read back
 * from the plan's own seats rather than recomputed from a guest list, so a hand-built `RulePlan`
 * is graded by the same rule as a solver-built one.
 */
function pinnedWithoutRoleCount(table: SeatedTable): number {
  return table.seats.filter(
    (seat) => seat !== null && seat.pinned && !PROTOCOL_ROLE_IDS.has(seat.guest.role),
  ).length
}

/**
 * KB-2, hard: the top table holds only guests with a protocol role, in KB-4's order. Reads
 * `topTableSeatPlacement` — `seating.ts`'s single definition of that placement, shared with
 * `allocate.ts`'s `seatTopTable` (TT-49) — so a table where pins have reduced the role order is
 * graded against the same reduced, centred layout the solver actually produced, never the
 * full-size order shifted into fewer slots.
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
 * `opportunities`/`missed` (TT-49, KB-8) score presence, not position, and are counted per
 * **role**, not per seat: the universe is `topTableRoleOrder(table.capacity)`, KB-4's full-size
 * order, so a role a pin's reduction bumped clean off the layout is still a chance the guest list
 * gave, judged on presence alone via `seatedAtTopTable` (which reads every seat, not a position).
 * Trap: counting per *seat* of the reduced layout instead erases a miss the moment an unrelated
 * pin lands — best man displaced to a round table, then a civilian hand-pinned into his empty
 * seat, must score the same as the first pin alone; a per-seat count drops best man's seat from
 * the layout and drops the miss with it. `topTableSeatPlacement`'s reduced layout decides
 * `expectedRole` for the finding checks above only, never the count of chances.
 *
 * A pin names a table, never a seat index — `allocate` and `seatPins` drop a pinned guest into
 * whichever slot is free — so a pinned occupant's own seat is never judged; only whether that
 * role's holder sits *somewhere* at the top table is. `findings.length <= missed <= opportunities`
 * (`contract.ts`) holds because every finding maps to one seat, and every seat's finding is folded
 * into exactly one role's count — its own where the reduced layout still gives that role a seat,
 * a standalone count where it does not.
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

    const expected = topTableSeatPlacement(table.capacity, pinnedWithoutRoleCount(table)).roleAt
    const rolesOnGuestList = protocolRolesOnGuestList(plan)
    const seatedAtTopTable = protocolRolesSeatedAtTopTable(table)
    const findings: Finding[] = []
    const findingSeats = new Set<number>()

    table.seats.forEach((seat, index) => {
      // A pin fires no finding (TT-14): a human instruction, not a breach. An empty seat fires
      // none either — there is no occupant to complain about. Only an unpinned occupant can.
      if (!seat || seat.pinned) return

      const expectedRole = expected[index]
      const { guest } = seat
      const seatLabel = `Seat ${index + 1}`

      if (!PROTOCOL_ROLE_IDS.has(guest.role)) {
        findings.push({
          tableIds: [table.id],
          guestIds: [guest.id],
          message: `${guest.name} is not a top table role`,
          detail: seatLabel,
        })
        findingSeats.add(index)
      } else if (expectedRole === undefined || guest.role !== expectedRole) {
        findings.push({
          tableIds: [table.id],
          guestIds: [guest.id],
          message: `${guest.name} is in the wrong top table seat`,
          detail: `${seatLabel}, expected ${expectedRole}`,
        })
        findingSeats.add(index)
      }
    })

    // The reduced layout's seat for each role it still has room for — a role a pin's reduction
    // dropped has no entry, and is counted below on presence alone rather than skipped.
    const seatForRole = new Map<ProtocolRole, number>()
    expected.forEach((role, index) => {
      if (role !== undefined) seatForRole.set(role, index)
    })

    let opportunities = 0
    let missed = 0
    const countedRoles = new Set<ProtocolRole>()

    for (const role of topTableRoleOrder(table.capacity)) {
      if (!rolesOnGuestList.has(role)) continue

      countedRoles.add(role)
      opportunities += 1

      const seatIndex = seatForRole.get(role)
      const seatFiredFinding = seatIndex !== undefined && findingSeats.has(seatIndex)
      if (seatFiredFinding || !seatedAtTopTable.has(role)) {
        missed += 1
      }
    }

    // A finding at a seat whose role either has nobody on the guest list or was dropped by the
    // reduction entirely is still a chance taken and missed — it was not folded into the loop
    // above, which only walks roles the guest list holds.
    for (const index of findingSeats) {
      const role = expected[index]
      if (role !== undefined && countedRoles.has(role)) continue

      opportunities += 1
      missed += 1
    }

    return { findings, opportunities, missed }
  },
} satisfies SeatingRule
