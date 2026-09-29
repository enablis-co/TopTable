import type { Finding, SeatingRule } from './contract'
import { planOccupancy } from '../seating'

/**
 * TT-47, hard: "A guest without a seat is a violation while a seat is free. A room with fewer
 * seats than guests is short rather than in violation."
 *
 * `remedy: 'flag'` is kept by choice, not forced: TT-17 lets a guardable rule see the guest list,
 * so nothing in the types stops this rule reading it. As a guard it would still be inert: its
 * finding names no table and no guest, so `seatGuardFrom` could never match it to a candidate
 * seat — `registry.test.ts` also requires every hard seating rule's findings to name both.
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

    // `tableIds: []` — this violation belongs to the room, not any single table. `guestIds: []`
    // because `remedy: 'flag'` means `seatGuardFrom` never reads this rule's findings. Counting
    // an unseated guest here and again in `score.ts`'s coverage factor (TT-48) is deliberate:
    // this rule is what blocks publish, that factor is what floors the score at zero.
    const findings: Finding[] = [
      {
        tableIds: [],
        guestIds: [],
        message:
          unseatedEffective === 1
            ? '1 guest has no seat'
            : `${unseatedEffective} guests have no seat`,
        detail: freeSeats === 1 ? '1 seat is still free' : `${freeSeats} seats are still free`,
      },
    ]

    return { findings, opportunities, missed }
  },
} satisfies SeatingRule
