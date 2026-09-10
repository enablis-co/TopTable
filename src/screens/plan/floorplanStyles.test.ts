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
// TT-12: the placing face, a descendant selector so it beats Button.module.css's .button on
// specificity rather than on source order.
const FACE_BASE = /\.table\s+\.face\s*\{/
const FACE_FOCUS_VISIBLE = /\.table\s+\.face:focus-visible\s*\{/
// (0,4,0): .table, .face, :hover and :not(:disabled) each count, beating Button.module.css's
// .quiet:hover:not(:disabled) at (0,3,0) regardless of source order.
const FACE_HOVER = /\.table\s+\.face:hover:not\(:disabled\)\s*\{/
const RELEASE_HOVER = /\.guests\s+\.release:hover:not\(:disabled\)\s*\{/

function readCss(): string {
  return readFileSync(CSS_PATH, 'utf8')
}

function stripComments(css: string): string {
  return css.replace(/\/\*[\s\S]*?\*\//g, '')
}

/**
 * Extracts the contents of the (single) top-level @container block by brace-counting rather
 * than a flat regex — the block nests a rule inside it, which is exactly what findRule below
 * is deliberately too narrow to parse.
 */
function containerBlockBody(css: string): string {
  const clean = stripComments(css)
  const start = clean.search(/@container\b/i)
  if (start === -1) return ''
  const openBrace = clean.indexOf('{', start)
  if (openBrace === -1) return ''

  let depth = 0
  for (let i = openBrace; i < clean.length; i += 1) {
    if (clean[i] === '{') depth += 1
    else if (clean[i] === '}') {
      depth -= 1
      if (depth === 0) {
        return clean.slice(openBrace + 1, i)
      }
    }
  }
  return clean.slice(openBrace + 1)
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

describe('PlanTable.module.css — the placing face neutralises the shared button frame (TT-12)', () => {
  it('declares a border-color and background of transparent, so the table\'s own border stays the table\'s mark, not the shared button\'s', () => {
    const rule = requireRule(readCss(), FACE_BASE, '.table .face')
    expect(rule.body).toMatch(/border-color\s*:\s*transparent/i)
    expect(rule.body).toMatch(/background\s*:\s*transparent/i)
  })

  it('is a descendant selector naming .table, not a bare .face that could equally match elsewhere', () => {
    const rule = requireRule(readCss(), FACE_BASE, '.table .face')
    expect(rule.selector).toMatch(/\.table/)
  })
})

describe('PlanTable.module.css — the face\'s focus ring is inset, since .round clips an outline drawn outside the element (TT-12)', () => {
  it('a .face:focus-visible rule exists and declares a negative outline-offset', () => {
    const rule = requireRule(readCss(), FACE_FOCUS_VISIBLE, '.table .face:focus-visible')
    expect(rule.body).toMatch(/outline-offset\s*:\s*-\d/)
  })

  it('no rule anywhere removes the outline entirely', () => {
    const css = stripComments(readCss())
    expect(css).not.toMatch(/outline\s*:\s*none/i)
    expect(css).not.toMatch(/outline\s*:\s*0\b/i)
  })
})

describe('PlanTable.module.css — the placing face is not styled as a warning (TT-12)', () => {
  it('neither the .face rule nor its focus-visible rule reaches for the hard or soft token', () => {
    const face = requireRule(readCss(), FACE_BASE, '.table .face')
    const focus = requireRule(readCss(), FACE_FOCUS_VISIBLE, '.table .face:focus-visible')
    const combined = `${face.body}\n${focus.body}`
    expect(combined).not.toMatch(/var\(--hard\)/i)
    expect(combined).not.toMatch(/var\(--soft\)/i)
  })
})

describe('PlanTable.module.css — .guests stays first inside the @container block; any later addition goes after it', () => {
  it('no other selector inside the @container block precedes .guests', () => {
    const body = containerBlockBody(readCss())
    expect(body).not.toBe('')

    const guestsIndex = body.search(/\.guests\s*\{/)
    expect(guestsIndex).toBeGreaterThanOrEqual(0)

    const selectorPattern = /([.\w-]+)\s*\{/g
    let match: RegExpExecArray | null
    while ((match = selectorPattern.exec(body)) !== null) {
      if (match[1] === '.guests') continue
      expect(match.index).toBeGreaterThan(guestsIndex)
    }
  })
})

describe('PlanTable.module.css — hovering the face or a release button repaints nothing (TT-12)', () => {
  it('.table .face:hover:not(:disabled) neutralises the background back to transparent', () => {
    const rule = requireRule(readCss(), FACE_HOVER, '.table .face:hover:not(:disabled)')
    expect(rule.body).toMatch(/background\s*:\s*transparent/i)
  })

  it('.guests .release:hover:not(:disabled) does the same for a release button', () => {
    const rule = requireRule(readCss(), RELEASE_HOVER, '.guests .release:hover:not(:disabled)')
    expect(rule.body).toMatch(/background\s*:\s*transparent/i)
  })
})

describe("PlanTable.module.css — the face fills the table's width always, and only grows vertically while it is the sole visible child", () => {
  it('the base .face rule declares align-self: stretch, not left to .table\'s shrink-wrapping align-items: center', () => {
    const rule = requireRule(readCss(), FACE_BASE, '.table .face')
    expect(rule.body).toMatch(/align-self\s*:\s*stretch/i)
  })

  it('the base .face rule still grows by default — for when it is the table\'s only visible child, below the container-query threshold', () => {
    const rule = requireRule(readCss(), FACE_BASE, '.table .face')
    expect(rule.body).toMatch(/flex\s*:\s*1\b/)
  })

  it('inside the @container block, a .face override stops it growing once the guest list is revealed', () => {
    const body = containerBlockBody(readCss())
    const rule = /\.table\s+\.face\s*\{([^}]*)\}/.exec(body)
    expect(rule, 'expected a .table .face override inside the @container block').not.toBeNull()
    expect(rule?.[1] ?? '').toMatch(/flex\s*:\s*initial/i)
  })
})
