import type { Finding, GuardPlan, SeatingRule } from './contract'

/**
 * KB-2, hard: "A table must not be seated above its capacity". Written as `total > capacity`,
 * not `overflow.length > 0` — the two are equivalent under `SeatedTable`'s invariant that
 * `seats.length === capacity`, but the first states the rule KB-2 gives and the second states
 * the encoding.
 *
 * `opportunities` is every table judged (TT-16); `missed` equals `findings.length` here — every
 * table over capacity is one chance this rule did not take, one-to-one with the finding it
 * produces. This rule scores like any other (TT-46, KB-8) — `opportunities: plan.tables.length`
 * is exactly KB-8's "Capacity gets one per table". It declares no `weight`, so it takes the hard
 * default of 3.
 */
export const rule = {
  id: 'capacity',
  severity: 'hard',
  remedy: 'seating',
  description: 'A table must not be seated above its capacity',
  // Explicit `GuardPlan` (TT-17): this rule reads only `plan.tables`, so it does not need the
  // wider `RulePlan` a `GuardableRule` may now be handed. Left to infer, the parameter would take
  // `RulePlan` from `contract.ts`'s contextual type, and every direct caller — capacity.rule.test.ts
  // among them — would have to pass `unseated` even though nothing here reads it.
  evaluate: (plan: GuardPlan) => {
    const findings: Finding[] = []

    for (const table of plan.tables) {
      const seated = table.seats.filter((seat) => seat !== null).length
      const total = seated + table.overflow.length

      if (total > table.capacity) {
        findings.push({
          tableIds: [table.id],
          guestIds: table.overflow.map((seat) => seat.guest.id),
          message: `${table.label} over capacity`,
          detail: `${total} of ${table.capacity}`,
        })
      }
    }

    return { findings, opportunities: plan.tables.length, missed: findings.length }
  },
} satisfies SeatingRule
