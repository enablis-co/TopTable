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
const OCCUPANCY_PARTIAL = /\.table\[\s*data-occupancy\s*=\s*['"]?partial['"]?\s*\]/
const OCCUPANCY_FULL = /\.table\[\s*data-occupancy\s*=\s*['"]?full['"]?\s*\]/
const VIOLATION_TRUE = /\.table\[\s*data-violation(?:\s*=\s*['"]?true['"]?)?\s*\]/
// TT-35: the dashed border is TOP-only now — a round table's own violation mark is its SVG
// body stroke (PlanTable.module.css's --ring-* properties), not a second, square CSS border.
const TOP_VIOLATION = /\.top\[\s*data-violation(?:\s*=\s*['"]?true['"]?)?\s*\]/
// TT-35: the ::after pin mark is TOP-only now — a round table's pin moved into TableRing's SVG.
const PINNED_AFTER = /\.top\[\s*data-pinned(?:\s*=\s*['"]?true['"]?)?\s*\]::after/
const BASE_TABLE = /\.table\s*\{/
const ROUND_SHAPE = /\.round\s*\{/
const TOP_SHAPE = /\.top\s*\{/
// TT-12: the placing face, a descendant selector so it beats Button.module.css's .button on
// specificity rather than on source order.
const FACE_BASE = /\.table\s+\.face\s*\{/
const TOP_FACE = /\.top\s+\.face\s*\{/
const TOP_FACE_HOVER = /\.top\s+\.face:hover:not\(:disabled\)\s*\{/
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

describe('PlanTable.module.css — a dedicated rule for each of the four states (C4, TT-35)', () => {
  it('declares data-occupancy="empty"', () => {
    expect(findRule(readCss(), OCCUPANCY_EMPTY)).not.toBeNull()
  })

  it('declares data-occupancy="partial"', () => {
    expect(findRule(readCss(), OCCUPANCY_PARTIAL)).not.toBeNull()
  })

  it('declares data-occupancy="full"', () => {
    expect(findRule(readCss(), OCCUPANCY_FULL)).not.toBeNull()
  })

  it('declares a rule for data-violation', () => {
    expect(findRule(readCss(), VIOLATION_TRUE)).not.toBeNull()
  })

  it('declares a ::after rule for data-pinned, scoped to the top table', () => {
    expect(findRule(readCss(), PINNED_AFTER)).not.toBeNull()
  })
})

describe('PlanTable.module.css — each state carries the published shape (C4, TT-35)', () => {
  it('the violation rule declares a dashed border in the hard token, scoped to the top table — a round table carries its own violation mark on the SVG body stroke instead', () => {
    const rule = requireRule(readCss(), TOP_VIOLATION, 'top[data-violation]')
    expect(rule.body).toMatch(/border-style\s*:\s*dashed/i)
    expect(rule.body).toMatch(/border-color\s*:\s*var\(--hard\)/i)
  })

  it('the general data-violation rule (both table kinds) does not itself declare a border — that stays top[data-violation]-only', () => {
    const rule = requireRule(readCss(), VIOLATION_TRUE, 'data-violation')
    expect(rule.body).not.toMatch(/border-style\s*:/i)
  })

  it('the full rule declares a slate ring body, read by the SVG, and no outer background of its own — the ring stays visible against its own face rather than disappearing into a same-colour square (browser-pass finding)', () => {
    const rule = requireRule(readCss(), OCCUPANCY_FULL, 'data-occupancy="full"')
    expect(rule.body).toMatch(/--ring-body-fill\s*:\s*var\(--slate\)/i)
    expect(rule.body).not.toMatch(/background\s*:/i)
  })

  it('the pinned rule is a ::after declaring content, border-radius and a real token background — the dot, not a colour swap', () => {
    const rule = requireRule(readCss(), PINNED_AFTER, 'top[data-pinned]::after')
    expect(rule.selector).toMatch(/::after/)
    expect(rule.body).toMatch(/content\s*:/i)
    expect(rule.body).toMatch(/border-radius\s*:/i)
    expect(rule.body).toMatch(/background\s*:\s*var\(--[\w-]+\)/i)
  })

  it('neither empty nor partial reaches for the hard or soft token — an unfilled or filling table is not a warning', () => {
    const css = readCss()
    const empty = requireRule(css, OCCUPANCY_EMPTY, 'data-occupancy="empty"')
    const partial = requireRule(css, OCCUPANCY_PARTIAL, 'data-occupancy="partial"')
    const combined = `${empty.body}\n${partial.body}`
    expect(combined).not.toMatch(/var\(--hard\)/i)
    expect(combined).not.toMatch(/var\(--soft\)/i)
  })
})

describe('PlanTable.module.css — the four materials (KB-6 "Floorplan"), read through the --ring-* properties TableRing.module.css consumes (TT-35)', () => {
  it('every one of the four states sets its own --ring-body-fill, and no two of them share a value', () => {
    const css = readCss()
    const fills = [OCCUPANCY_EMPTY, OCCUPANCY_PARTIAL, OCCUPANCY_FULL, VIOLATION_TRUE].map((pattern, index) => {
      const rule = requireRule(css, pattern, `state ${index}`)
      const match = /--ring-body-fill\s*:\s*(var\([^)]+\))/i.exec(rule.body)
      expect(match, `expected a --ring-body-fill declaration`).not.toBeNull()
      return match?.[1]
    })
    expect(new Set(fills).size).toBe(fills.length)
  })

  it('the empty and partial rules each also declare a --ring-stroke and a --ring-body-stroke-width, distinguishing an unfilled ring from a bare .table', () => {
    const css = readCss()
    for (const pattern of [OCCUPANCY_EMPTY, OCCUPANCY_PARTIAL]) {
      const rule = requireRule(css, pattern, 'occupancy state')
      expect(rule.body).toMatch(/--ring-stroke\s*:\s*var\(--rule-strong\)/i)
      expect(rule.body).toMatch(/--ring-body-stroke-width\s*:\s*1\.5px/i)
    }
  })

  it('the full rule declares no body stroke — --ring-body-stroke: none', () => {
    const rule = requireRule(readCss(), OCCUPANCY_FULL, 'data-occupancy="full"')
    expect(rule.body).toMatch(/--ring-body-stroke\s*:\s*none/i)
  })

  it('the violation rule sets a dashed body stroke — --ring-body-stroke-width and --ring-body-dasharray — so a round table in violation is marked on the ring itself', () => {
    const rule = requireRule(readCss(), VIOLATION_TRUE, 'data-violation')
    expect(rule.body).toMatch(/--ring-body-stroke-width\s*:\s*1\.8px/i)
    expect(rule.body).toMatch(/--ring-body-dasharray\s*:\s*6\s+4/i)
    expect(rule.body).toMatch(/--ring-stroke\s*:\s*var\(--hard\)/i)
  })

  it("violation's selector sits after full's, so a table that is both full and in violation reads as in violation (0,2,0 vs 0,2,0: only source order decides)", () => {
    const css = stripComments(readCss())
    const fullIndex = css.search(OCCUPANCY_FULL)
    const violationIndex = css.search(VIOLATION_TRUE)
    expect(fullIndex, 'expected a data-occupancy="full" rule').toBeGreaterThanOrEqual(0)
    expect(violationIndex, 'expected a data-violation rule').toBeGreaterThanOrEqual(0)
    expect(violationIndex).toBeGreaterThan(fullIndex)
  })

  it("violation's rule redeclares every --ring-* property full also sets, so nothing of full's material leaks through when both match the same table", () => {
    const css = readCss()
    const full = requireRule(css, OCCUPANCY_FULL, 'data-occupancy="full"')
    const violation = requireRule(css, VIOLATION_TRUE, 'data-violation')
    const fullProperties = [...full.body.matchAll(/(--ring-[\w-]+)\s*:/g)].map((match) => match[1])
    const violationProperties = new Set([...violation.body.matchAll(/(--ring-[\w-]+)\s*:/g)].map((match) => match[1]))
    for (const property of fullProperties) {
      expect(violationProperties.has(property as string), `expected data-violation to also set ${property}`).toBe(true)
    }
  })

  it('a pinned table resolves --ring-pin to --on-slate only on the full material — --slate everywhere else, so the dot stays visible against every fill', () => {
    const css = readCss()
    const full = requireRule(css, OCCUPANCY_FULL, 'data-occupancy="full"')
    expect(full.body).toMatch(/--ring-pin\s*:\s*var\(--on-slate\)/i)
    for (const pattern of [OCCUPANCY_EMPTY, OCCUPANCY_PARTIAL, VIOLATION_TRUE]) {
      const rule = requireRule(css, pattern, 'state')
      expect(rule.body).toMatch(/--ring-pin\s*:\s*var\(--slate\)/i)
    }
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
      requireRule(css, OCCUPANCY_PARTIAL, 'data-occupancy="partial"').selector,
      requireRule(css, OCCUPANCY_FULL, 'data-occupancy="full"').selector,
      requireRule(css, VIOLATION_TRUE, 'data-violation').selector,
      requireRule(css, PINNED_AFTER, 'top[data-pinned]::after').selector,
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

describe('PlanTable.module.css — the top table is a constant slate bar, not a fifth material (coordinator browser-pass finding, TT-35)', () => {
  it('.top .face is always filled slate with on-slate text', () => {
    const rule = requireRule(readCss(), TOP_FACE, '.top .face')
    expect(rule.body).toMatch(/background\s*:\s*var\(--slate\)/i)
    expect(rule.body).toMatch(/color\s*:\s*var\(--on-slate\)/i)
  })

  it("is declared after the shared .table .face rule, so its literal colour wins the specificity tie over that rule's color: inherit — both are 0,2,0", () => {
    const css = stripComments(readCss())
    const sharedIndex = css.search(FACE_BASE)
    const topFaceIndex = css.search(TOP_FACE)
    expect(sharedIndex, 'expected the shared .table .face rule').toBeGreaterThanOrEqual(0)
    expect(topFaceIndex, 'expected a .top .face rule').toBeGreaterThanOrEqual(0)
    expect(topFaceIndex).toBeGreaterThan(sharedIndex)
  })

  it('no rule anywhere reads data-occupancy on .top — unlike a round table, the top table never varies by occupancy', () => {
    const css = stripComments(readCss())
    expect(css).not.toMatch(/\.top\[\s*data-occupancy/i)
  })

  it('the pinned mark drawn over that face is on-slate, not the slate it would otherwise vanish into', () => {
    const rule = requireRule(readCss(), PINNED_AFTER, 'top[data-pinned]::after')
    expect(rule.body).toMatch(/background\s*:\s*var\(--on-slate\)/i)
  })

  // A round table may drop its face background on hover because its ring carries the material.
  // The top table has no ring, so the same rule left its white label on the white floor.
  it('keeps its slate fill on hover, so the on-slate label never sits on the surface floor', () => {
    const rule = requireRule(readCss(), TOP_FACE_HOVER, '.top .face:hover:not(:disabled)')
    expect(rule.body).toMatch(/background\s*:\s*var\(--slate\)/i)
    expect(rule.body).not.toMatch(/background\s*:\s*transparent/i)
  })

  it('declares that hover rule after the shared one, which it ties with at 0,4,0 — source order is the only thing deciding it', () => {
    const css = stripComments(readCss())
    const sharedIndex = css.search(FACE_HOVER)
    const topIndex = css.search(TOP_FACE_HOVER)
    expect(sharedIndex, 'expected a .table .face:hover rule').toBeGreaterThanOrEqual(0)
    expect(topIndex, 'expected a .top .face:hover rule').toBeGreaterThanOrEqual(0)
    expect(topIndex).toBeGreaterThan(sharedIndex)
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

describe('PlanTable.module.css — the top table\'s pin stays a fixed-offset ::after mark (TT-35: a round table\'s moved into the SVG instead)', () => {
  it('offsets far enough to clear .table\'s own padding plus border and land on .face, not in the gap outside it (coordinator browser-pass finding)', () => {
    const rule = requireRule(readCss(), PINNED_AFTER, 'top[data-pinned]::after')
    // .table's inset is --s-3 (12px) padding + 1px border = 13px; the mark must clear that.
    expect(rule.body).toMatch(/top\s*:\s*var\(--s-4\)/i)
    expect(rule.body).toMatch(/right\s*:\s*var\(--s-4\)/i)
  })

  it('no rule anywhere still targets .round[data-pinned] — that mechanism is retired, not merely overridden', () => {
    expect(findRule(readCss(), /\.round\[\s*data-pinned/)).toBeNull()
  })
})

describe('TableRing.module.css — the round table\'s pin is an SVG circle reading --ring-pin, not a CSS ::after mark (TT-35, AC16)', () => {
  const RING_CSS_PATH = join(DIR, 'TableRing.module.css')

  function readRingCss(): string {
    return readFileSync(RING_CSS_PATH, 'utf8')
  }

  it('declares a .pin rule whose fill comes from the --ring-pin custom property, not a literal colour', () => {
    const rule = requireRule(readRingCss(), /\.pin\s*\{/, '.pin')
    expect(rule.body).toMatch(/fill\s*:\s*var\(--ring-pin\)/i)
    expect(rule.body).not.toMatch(/#[0-9a-f]{3,8}\b/i)
  })

  it('declares a .ring and a .body rule, each reading its colour from a --ring-* property rather than a literal', () => {
    const css = readRingCss()
    const ring = requireRule(css, /\.ring\s*\{/, '.ring')
    const body = requireRule(css, /\.body\s*\{/, '.body')
    expect(ring.body).toMatch(/stroke\s*:\s*var\(--ring-stroke\)/i)
    expect(body.body).toMatch(/fill\s*:\s*var\(--ring-body-fill\)/i)
    expect(`${ring.body}\n${body.body}`).not.toMatch(/#[0-9a-f]{3,8}\b/i)
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

  it('inside the @container block, a .face override stops it both growing and shrinking once the guest list is revealed — the number must never yield', () => {
    const body = containerBlockBody(readCss())
    const rule = /\.table\s+\.face\s*\{([^}]*)\}/.exec(body)
    expect(rule, 'expected a .table .face override inside the @container block').not.toBeNull()
    expect(rule?.[1] ?? '').toMatch(/flex\s*:\s*0\s+0\s+auto/i)
  })
})

describe('PlanTable.module.css — .guests is the only child that yields when content overflows the circle (TT-11 fix, C3)', () => {
  const GUESTS_BASE = /\.guests\s*\{/

  it('the base .guests rule declares overflow: hidden — what lets a flex item shrink below its own content size', () => {
    const rule = requireRule(readCss(), GUESTS_BASE, 'the base .guests rule')
    expect(rule.body).toMatch(/overflow\s*:\s*hidden/i)
  })
})
