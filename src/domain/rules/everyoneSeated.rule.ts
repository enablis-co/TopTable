import type { Finding, SeatingRule } from './contract'
import { planOccupancy } from '../seating'

/**
 * KB-2, hard: "A guest without a seat is a violation while a seat is free. A room with fewer
 * seats than guests is short rather than in violation." (TT-47)
 *
 * `remedy: 'flag'`, not `'seating'`, and that is forced rather than chosen: `GuardableRule` in
 * `contract.ts` types a hard `remedy: 'seating'` rule's `evaluate` against `GuardPlan` — tables
 * only, no guest list — and this rule's whole subject is who has *no* seat, which cannot be
 * answered from seated tables alone. It is also right behaviourally: `seatGuardFrom` is a veto,
 * and seating someone never creates this finding, only clears it.
 *
 * `opportunities` is `min(guests, totalSeats)`, not `guests` — a room with fewer seats than
 * guests can only ever get `totalSeats` of them right, and reporting `guests` there would let a
 * room nobody can sit in post a perfect sub-score (KB-8, KB-1 "short rather than in violation").
 * `missed` is `min(unseatedEffective, freeSeats)` for the same reason: a short, fully-seated room
 * has people standing but no free seat for the rule to flag against, so it must report 0 rather
 * than the standing count.
 *
 * A guest in a table's `overflow` is not seated — `planOccupancy` is the one definition of that,
 * shared with `score.ts` (TT-48), so this rule and the coverage factor can never disagree about
 * who counts. Counting an unseated guest here, at the hard default weight of 3, and again in that
 * factor is deliberate, not a double-counting bug: this rule is what makes the plan unpublishable,
 * the factor is what guarantees a score of nought at zero rather than merely a low one (TT-48).
 */
export const rule = {
  id: 'everyone-seated',
  severity: 'hard',
  remedy: 'flag',
  description: 'Every guest has a seat while the room still has an empty one',
  evaluate: (plan) => {
    const { guests, seated, totalSeats, freeSeats } = planOccupancy(plan)
    const unseatedEffective = guests - seated
    const opportunities = Math.min(guests, totalSeats)
    const missed = Math.min(unseatedEffective, freeSeats)

    if (missed === 0) {
      return { findings: [], opportunities, missed: 0 }
    }

    // One aggregate finding, not one per unseated guest — the common case is dozens of guests
    // unseated before auto-allocate, and that is not dozens of rows in the violations panel.
    // `tableIds: []` on purpose: this violation is about the room, not any one table, and
    // `tablesWithHardViolation` in `engine.ts` reads `tableIds` to decide which table gets the
    // dashed in-violation border — an empty array here means no table is singled out for a
    // problem that belongs to none of them. `guestIds: []` because `remedy: 'flag'` means
    // `seatGuardFrom` never reads this rule's findings at all.
    const findings: Finding[] = [
      {
        tableIds: [],
        guestIds: [],
        message: missed === 1 ? '1 guest has no seat' : `${missed} guests have no seat`,
        detail: freeSeats === 1 ? '1 seat is still free' : `${freeSeats} seats are still free`,
      },
    ]

    return { findings, opportunities, missed }
  },
} satisfies SeatingRule
