import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

/**
 * TT-11, "Render the floorplan from config" — KB-5's shape rule: "Colour never carries meaning
 * alone... every state pairs a colour with a shape." jsdom applies no CSS at all
 * (docs/engineering-standards.md, "What the suite cannot see"), so PlanTable.test.tsx can only
 * ever see the four `data-*` attributes and the visible text — never whether the colour behind
 * a state is actually backed by a shape.
 *
 * This file reads PlanTable.module.css as text — the technique already established by
 * src/screens/setup/capacityReadoutStyles.test.ts, src/screens/setup/scenarioPickerStyles.test.ts
 * and src/screens/guests/guestTableStyles.test.ts — and checks the published rules directly
 * against the stylesheet's own declarations. Reading a stylesheet as text is not reading the
 * implementation; it is asserting a KB-5/R3 rule against a file's contents. This file opens no
 * `.tsx`.
 *
 * R3 is the other half of this file's reason to exist: a stylesheet-text test proves a rule is
 * *declared*, never that it *wins* the cascade — exactly how the TT-5/TT-6 review found
 * `.highlight`'s background losing to a higher-specificity rule elsewhere in the same file. The
 * plan's own cascade analysis (section 4) leaves exactly one same-specificity pair unresolved by
 * property separation — `.table` against `.round`/`.top` — so this file asserts source order for
 * that pair specifically, plus that every state selector is attribute-qualified and the base
 * selector is not (so a state rule can never be confused with the base one it must always beat).
 *
 * `data-pinned` and `data-violation` are only ever absent or the literal string `'true'` (never
 * any other value — that is exactly PlanTable.test.tsx's own load-bearing assertion), so a bare
 * `[data-pinned]`/`[data-violation]` existence selector is functionally identical to
 * `[data-pinned='true']` in this codebase. The patterns below accept either spelling: the
 * criterion is that pinned and violating tables carry a shape, not which of two equivalent
 * selector forms was used to select them. `data-occupancy` has no such equivalence — it always
 * carries a value, and a bare `[data-occupancy]` would match all three states at once — so its
 * patterns require the value.
 */

const DIR = dirname(fileURLToPath(import.meta.url))
const CSS_PATH = join(DIR, 'PlanTable.module.css')

const OCCUPANCY_EMPTY = /\.table\[\s*data-occupancy\s*=\s*['"]?empty['"]?\s*\]/
const OCCUPANCY_FULL = /\.table\[\s*data-occupancy\s*=\s*['"]?full['"]?\s*\]/
const VIOLATION_TRUE = /\.table\[\s*data-violation(?:\s*=\s*['"]?true['"]?)?\s*\]/
const PINNED_AFTER = /\.table\[\s*data-pinned(?:\s*=\s*['"]?true['"]?)?\s*\]::after/
const BASE_TABLE = /\.table\s*\{/
const ROUND_SHAPE = /\.round\s*\{/
const ROUND_PINNED_AFTER = /\.round\[\s*data-pinned(?:\s*=\s*['"]?true['"]?)?\s*\]::after/

function readCss(): string {
  return readFileSync(CSS_PATH, 'utf8')
}

function stripComments(css: string): string {
  return css.replace(/\/\*[\s\S]*?\*\//g, '')
}

/**
 * Finds the first selector in the (comment-stripped) CSS matching `selectorPattern`, and
 * returns its selector text and its rule body (the text between the following `{` and the next
 * `}`). Deliberately narrow rather than a generic "parse every rule" pass: this file's CSS
 * contains a nested `@container` block (A6), and a flat brace-matching parser applied to the
 * whole file mishandles nested braces. Every rule this file cares about is flat, so finding each
 * one by its own known selector pattern sidesteps the nesting problem entirely.
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

describe('PlanTable.module.css — the guest-name reveal is declared as a container query (C3, "where space allows")', () => {
  it('declares an @container rule, with the guest list hidden by default and shown only inside it', () => {
    const css = stripComments(readCss())

    expect(css).toMatch(/@container/i)
    // Hidden by default...
    expect(css).toMatch(/\.guests\s*\{[^}]*display\s*:\s*none/i)
    // ...and revealed only inside the container query — never the reverse, which is what "where
    // space allows" as a progressive reveal requires. The suite cannot confirm the 132px
    // threshold actually behaves this way (jsdom does no layout — that is the browser pass's
    // job), only that the rule declaring it exists.
    expect(css).toMatch(/@container[^{]*\{\s*\.guests\s*\{[^}]*display\s*:\s*block/i)
  })
})

/*
 * Regression, TT-11 review. The reviewer drove the app and measured two blockers no test above
 * could see, because both are about whether a rule *wins* geometrically, not whether it exists
 * — exactly the layout question docs/engineering-standards.md says only a browser can answer.
 * These assertions are the declared-in-the-stylesheet half of each fix; the browser pass in the
 * PR notes is the other half, and a green run here is not a substitute for it (R3 again: this
 * file proves a rule is declared, never that it wins the cascade).
 */

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
