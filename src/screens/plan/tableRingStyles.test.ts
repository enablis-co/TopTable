import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

/**
 * TT-35. The `--ring-*` custom properties are a contract split across two files: every
 * occupancy/violation state in PlanTable.module.css sets them, and TableRing.module.css only
 * ever reads them — with a fallback, on at least the stroke-width and dasharray pair. A
 * reference carrying a fallback is exactly what src/ui/tokens.test.ts's own undefined-token
 * guard is built to skip, so nothing else in the suite notices the two files drifting apart:
 * renaming a property on either side alone still renders (the fallback quietly takes over),
 * with the rest of the gate green. That is not a cosmetic gap — the dashed outline this
 * contract carries is the *shape* half of a violating table's material (KB-5 "colour never
 * carries meaning alone"), and it is the only thing left once the colour half is stripped out
 * (e.g. on a projector, or for anyone who can't rely on colour).
 *
 * This is that guard: every --ring-* name each file's own rules read must be a name the other
 * file's own rules declare, and vice versa. It is a plain set-equality over the two files' own
 * source text, the same technique tokens.test.ts already uses for the token scale generally —
 * this file exists because that general guard is the one place designed to look away from a
 * property that carries a fallback, and this pair is exactly that case.
 */

const PLAN_DIR = dirname(fileURLToPath(import.meta.url))
const CONSUMER_PATH = join(PLAN_DIR, 'TableRing.module.css')
const PRODUCER_PATH = join(PLAN_DIR, 'PlanTable.module.css')

function read(path: string): string {
  return readFileSync(path, 'utf8')
}

// Every --ring-* name read via var(--ring-x) or var(--ring-x, fallback) — the fallback makes
// no difference here, unlike tokens.test.ts's general guard, because this file exists
// specifically to catch the case that guard is built to let through.
function ringReferences(css: string): Set<string> {
  const names = new Set<string>()
  for (const match of css.matchAll(/var\(\s*(--ring-[A-Za-z0-9-]+)/g)) {
    const name = match[1]
    if (name) names.add(name)
  }
  return names
}

// Every --ring-* name declared (set) rather than read: the name directly followed by a colon.
// The same name inside var(--ring-x) is followed by `)` or `,` instead, so the two never collide.
function ringDeclarations(css: string): Set<string> {
  const names = new Set<string>()
  for (const match of css.matchAll(/(--ring-[A-Za-z0-9-]+)\s*:/g)) {
    const name = match[1]
    if (name) names.add(name)
  }
  return names
}

describe('the --ring-* contract between TableRing.module.css and PlanTable.module.css', () => {
  it('is not vacuous: TableRing.module.css actually reads at least one --ring-* property', () => {
    const consumed = ringReferences(read(CONSUMER_PATH))
    expect(consumed.size).toBeGreaterThan(0)
  })

  it('has every --ring-* property TableRing.module.css reads declared somewhere in PlanTable.module.css', () => {
    const consumed = ringReferences(read(CONSUMER_PATH))
    const produced = ringDeclarations(read(PRODUCER_PATH))

    const undeclared = [...consumed].filter((name) => !produced.has(name))
    expect(undeclared).toEqual([])
  })

  it('has every --ring-* property PlanTable.module.css declares actually read by TableRing.module.css', () => {
    const consumed = ringReferences(read(CONSUMER_PATH))
    const produced = ringDeclarations(read(PRODUCER_PATH))

    const unread = [...produced].filter((name) => !consumed.has(name))
    expect(unread).toEqual([])
  })
})
