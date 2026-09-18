import type { Finding, SeatingRule } from './contract'
import { planOccupancy } from '../seating'

/**
 * TT-47, hard: "A guest without a seat is a violation while a seat is free. A room with fewer
 * seats than guests is short rather than in violation."
 *
 * `remedy: 'flag'` is forced, not chosen: `contract.ts` types a hard `remedy: 'seating'` rule's
 * `evaluate` against `GuardPlan` (tables only), and this rule needs the full guest list to know
 * who has no seat.
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
