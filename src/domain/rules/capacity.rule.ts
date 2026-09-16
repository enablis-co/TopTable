import type { Finding, SeatingRule } from './contract'

/**
 * KB-2, hard: "A table must not be seated above its capacity". Written as `total > capacity`,
 * not `overflow.length > 0` — the two are equivalent under `SeatedTable`'s invariant that
 * `seats.length === capacity`, but the first states the rule KB-2 gives and the second states
 * the encoding.
 *
 * `opportunities` is every table judged (TT-16); `missed` equals `findings.length` here — every
 * table over capacity is one chance this rule did not take, one-to-one with the finding it
 * produces. Being hard, neither ever scores — both are declared honestly anyway, to satisfy the
 * `findings.length <= missed <= opportunities` invariant every rule holds. No `weight`: hard
 * rules do not carry one.
 */
export const rule = {
  id: 'capacity',
  severity: 'hard',
  remedy: 'seating',
  description: 'A table must not be seated above its capacity',
  evaluate: (plan) => {
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
