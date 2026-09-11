import type { Finding, SeatingRule } from './contract'

/**
 * KB-2, hard: "A table must not be seated above its capacity". Written as `total > capacity`,
 * not `overflow.length > 0` — the two are equivalent under `SeatedTable`'s invariant that
 * `seats.length === capacity`, but the first states the rule KB-2 gives and the second states
 * the encoding.
 */
export const rule: SeatingRule = {
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

    return findings
  },
}
