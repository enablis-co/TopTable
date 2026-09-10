import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

/**
 * jsdom applies no CSS at all, so PlanTable.test.tsx can only see the `data-*` attributes and
 * the visible text — never whether a colour is actually backed by a shape (KB-5). This file
 * reads PlanTable.module.css as text instead: it proves a rule is *declared*, never that it
 * *wins* the cascade, which is why source order is asserted explicitly below for the one
 * same-specificity pair the stylesheet leaves unresolved (`.table` against `.round`/`.top`).
 */

const DIR = dirname(fileURLToPath(import.meta.url))
const CSS_PATH = join(DIR, 'PlanTable.module.css')

// data-pinned/data-violation are only ever absent or the string 'true', so these patterns
// accept a bare [data-pinned] or an explicit [data-pinned='true'] interchangeably.
// data-occupancy always carries a value, so its patterns require one.
const OCCUPANCY_EMPTY = /\.table\[\s*data-occupancy\s*=\s*['"]?empty['"]?\s*\]/
const OCCUPANCY_FULL = /\.table\[\s*data-occupancy\s*=\s*['"]?full['"]?\s*\]/
const VIOLATION_TRUE = /\.table\[\s*data-violation(?:\s*=\s*['"]?true['"]?)?\s*\]/
const PINNED_AFTER = /\.table\[\s*data-pinned(?:\s*=\s*['"]?true['"]?)?\s*\]::after/
const BASE_TABLE = /\.table\s*\{/
const ROUND_SHAPE = /\.round\s*\{/
const TOP_SHAPE = /\.top\s*\{/
const ROUND_PINNED_AFTER = /\.round\[\s*data-pinned(?:\s*=\s*['"]?true['"]?)?\s*\]::after/

function readCss(): string {
  return readFileSync(CSS_PATH, 'utf8')
}

function stripComments(css: string): string {
  return css.replace(/\/\*[\s\S]*?\*\//g, '')
}

/**
 * Finds the first rule matching `selectorPattern`. Deliberately narrow rather than a generic
 * brace-matching parser: this file's CSS has a nested `@container` block, which a flat parser
 * would mishandle — finding each rule by its own known selector sidesteps that entirely.
 */
function findRule(css: string, selectorPattern: RegExp): { selector: string; body: string } | null {
  const clean = stripComments(css)
  const selectorMatch = selectorPattern.exec(clean)
  if (!selectorMatch) return null

  const openBrace = clean.indexOf('{', selectorMatch.index)
  if (openBrace === -1) return null
  const closeBrace = clean.indexOf('}', openBrace)
  if (closeBrace === -1) return null

  return {
    selector: clean.slice(selectorMatch.index, openBrace).trim(),
    body: clean.slice(openBrace + 1, closeBrace),
  }
}

function requireRule(css: string, selectorPattern: RegExp, description: string): { selector: string; body: string } {
  const rule = findRule(css, selectorPattern)
  if (!rule) {
    throw new Error(`expected PlanTable.module.css to declare a rule for ${description}`)
  }
  return rule
}

describe('PlanTable.module.css — a dedicated rule for each of the four states (C4)', () => {
  it('declares data-occupancy="empty"', () => {
    expect(findRule(readCss(), OCCUPANCY_EMPTY)).not.toBeNull()
  })

  it('declares data-occupancy="full"', () => {
    expect(findRule(readCss(), OCCUPANCY_FULL)).not.toBeNull()
  })

  it('declares a rule for data-violation', () => {
    expect(findRule(readCss(), VIOLATION_TRUE)).not.toBeNull()
  })

  it('declares a ::after rule for data-pinned', () => {
    expect(findRule(readCss(), PINNED_AFTER)).not.toBeNull()
  })
})

describe('PlanTable.module.css — each state carries the published shape (C4)', () => {
  it('the violation rule declares a dashed border in the hard token — border-style and border-color', () => {
    const rule = requireRule(readCss(), VIOLATION_TRUE, 'data-violation')
    expect(rule.body).toMatch(/border-style\s*:\s*dashed/i)
    expect(rule.body).toMatch(/border-color\s*:\s*var\(--hard\)/i)
  })

  it('the full rule declares a sunken fill — background: var(--sunken)', () => {
    const rule = requireRule(readCss(), OCCUPANCY_FULL, 'data-occupancy="full"')
    expect(rule.body).toMatch(/background\s*:\s*var\(--sunken\)/i)
  })

  it('the pinned rule is a ::after declaring content, border-radius and a real token background — the dot, not a colour swap', () => {
    const rule = requireRule(readCss(), PINNED_AFTER, 'data-pinned::after')
    expect(rule.selector).toMatch(/::after/)
    expect(rule.body).toMatch(/content\s*:/i)
    expect(rule.body).toMatch(/border-radius\s*:/i)
    expect(rule.body).toMatch(/background\s*:\s*var\(--[\w-]+\)/i)
  })

  it('neither occupancy rule reaches for the hard or soft token — an empty table is not a warning', () => {
    const css = readCss()
    const empty = requireRule(css, OCCUPANCY_EMPTY, 'data-occupancy="empty"')
    const full = requireRule(css, OCCUPANCY_FULL, 'data-occupancy="full"')
    const combined = `${empty.body}\n${full.body}`
    expect(combined).not.toMatch(/var\(--hard\)/i)
    expect(combined).not.toMatch(/var\(--soft\)/i)
  })
})

describe('PlanTable.module.css — R3: the one same-specificity pair is resolved by source order', () => {
  it('.round and .top both appear after the base .table rule in the file', () => {
    const css = stripComments(readCss())

    const tableIndex = css.search(BASE_TABLE)
    const roundIndex = css.search(/\.round\s*\{/)
    const topIndex = css.search(/\.top\s*\{/)

    expect(tableIndex, 'expected a base .table rule').toBeGreaterThanOrEqual(0)
    expect(roundIndex, 'expected a .round rule').toBeGreaterThanOrEqual(0)
    expect(topIndex, 'expected a .top rule').toBeGreaterThanOrEqual(0)

    expect(roundIndex).toBeGreaterThan(tableIndex)
    expect(topIndex).toBeGreaterThan(tableIndex)
  })

  it('every state selector is attribute-qualified with [data-, and the base .table selector is not', () => {
    const css = readCss()

    const stateSelectors = [
      requireRule(css, OCCUPANCY_EMPTY, 'data-occupancy="empty"').selector,
      requireRule(css, OCCUPANCY_FULL, 'data-occupancy="full"').selector,
      requireRule(css, VIOLATION_TRUE, 'data-violation').selector,
      requireRule(css, PINNED_AFTER, 'data-pinned::after').selector,
    ]
    for (const selector of stateSelectors) {
      expect(selector).toContain('[data-')
    }

    const baseSelector = requireRule(stripComments(css), BASE_TABLE, 'the base .table rule').selector
    expect(baseSelector).not.toContain('[data-')
  })
})

/* Guards that .top keeps a width cap and a centring rule — not the exact value, which is a
   layout question only a browser can confirm — so it cannot silently regress to full-width. */
describe('PlanTable.module.css — the top table\'s width is capped and centred, not left full-width', () => {
  it('.top declares a width wanting less than the full row, and centres itself', () => {
    const rule = requireRule(readCss(), TOP_SHAPE, '.top')
    expect(rule.body).toMatch(/width\s*:/i)
    expect(rule.body).not.toMatch(/width\s*:\s*100%/i)
    expect(rule.body).toMatch(/margin(?:-inline)?\s*:\s*(?:0\s+)?auto/i)
  })

  it('.top no longer spans the grid — it is not a grid item at all (FloorplanGrid.tsx)', () => {
    const rule = requireRule(readCss(), TOP_SHAPE, '.top')
    expect(rule.body).not.toMatch(/grid-column\s*:/i)
  })
})

describe('PlanTable.module.css — the guest-name reveal is declared as a container query (C3, "where space allows")', () => {
  it('declares an @container rule, with the guest list hidden by default and shown only inside it', () => {
    const css = stripComments(readCss())

    expect(css).toMatch(/@container/i)
    // Hidden by default...
    expect(css).toMatch(/\.guests\s*\{[^}]*display\s*:\s*none/i)
    // ...and revealed only inside the container query, never the reverse.
    expect(css).toMatch(/@container[^{]*\{\s*\.guests\s*\{[^}]*display\s*:\s*block/i)
  })
})

// These assertions are the declared-in-the-stylesheet half; only a browser confirms the
// geometry actually wins.

describe('PlanTable.module.css — .round contains its own content instead of stretching into an ellipse', () => {
  it('declares min-height: 0, so aspect-ratio governs height from width alone regardless of content', () => {
    const rule = requireRule(readCss(), ROUND_SHAPE, '.round')
    expect(rule.body).toMatch(/min-height\s*:\s*0\b/i)
  })

  it('declares overflow: hidden, so content taller than the circle is contained rather than crossing its curve', () => {
    const rule = requireRule(readCss(), ROUND_SHAPE, '.round')
    expect(rule.body).toMatch(/overflow\s*:\s*hidden/i)
  })
})

describe('PlanTable.module.css — the pin dot stays proportionally inside a round table at any track size', () => {
  it('the shared pinned rule still positions with the original fixed token inset — the top table (a rectangle) is untouched by this fix', () => {
    const rule = requireRule(readCss(), PINNED_AFTER, 'the shared data-pinned::after rule')
    expect(rule.body).toMatch(/top\s*:\s*var\(--space-2\)/i)
    expect(rule.body).toMatch(/right\s*:\s*var\(--space-2\)/i)
  })

  it('.round overrides the position in relative units, not a fixed pixel offset', () => {
    const rule = requireRule(readCss(), ROUND_PINNED_AFTER, 'a .round-specific data-pinned::after override')
    expect(rule.body).toMatch(/top\s*:/i)
    expect(rule.body).toMatch(/right\s*:/i)
    // The geometry, not a specific number: no bare px length on either offset.
    expect(rule.body).not.toMatch(/top\s*:\s*[\d.]+px/i)
    expect(rule.body).not.toMatch(/right\s*:\s*[\d.]+px/i)
    expect(rule.body).toMatch(/%/)
  })

  it('.round recentres the (fixed-size) dot on that point with a transform, rather than positioning its corner', () => {
    const rule = requireRule(readCss(), ROUND_PINNED_AFTER, 'a .round-specific data-pinned::after override')
    expect(rule.body).toMatch(/transform\s*:\s*translate\(/i)
  })

  it('the .round override is declared after the shared rule, so source order lets the equal-specificity override win', () => {
    const css = stripComments(readCss())
    const sharedIndex = css.search(PINNED_AFTER)
    const roundIndex = css.search(ROUND_PINNED_AFTER)

    expect(sharedIndex, 'expected the shared .table[data-pinned]::after rule').toBeGreaterThanOrEqual(0)
    expect(roundIndex, 'expected a .round[data-pinned]::after override').toBeGreaterThanOrEqual(0)
    expect(roundIndex).toBeGreaterThan(sharedIndex)
  })
})
