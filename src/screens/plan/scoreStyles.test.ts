import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

/**
 * TT-16. jsdom applies no CSS at all, so PlanHeader.test.tsx, ScoreBreakdownPanel.test.tsx and
 * PinnedGuestsPanel.test.tsx can only see `aria-expanded` and the rendered text, never whether a
 * toggle is actually painted as a non-filled control, or whether the expanded state is actually
 * distinguishable by shape rather than colour (KB-5). This file reads PlanHeader.module.css,
 * ScoreBreakdownPanel.module.css and PinnedGuestsPanel.module.css as text instead, the same
 * technique violationsPanelStyles.test.ts already uses on its own stylesheet: it proves a rule
 * is *declared*, never that it wins the cascade or renders at all — jsdom does no layout.
 *
 * Written from the ticket's acceptance criteria for the score toggle, the Pinned toggle and the
 * two panels. Does not open PlanHeader.tsx, ScoreBreakdownPanel.tsx or PinnedGuestsPanel.tsx.
 *
 * TT-16 part two: the caret glyph is deleted outright, and Pinned becomes the same kind of
 * toggle as the score, sharing its class — `.scoreToggle` is renamed `.statToggle` throughout.
 * The hover rule and the expanded rule both use `var(--sunken)` as their background, which is
 * deliberate (KB-6 reserves a filled control for Auto-allocate alone) but means a background
 * check alone cannot tell them apart, and a property-by-property diff of the two rule bodies is
 * not enough on its own either: a bare `border-bottom-color` change satisfies "the two rules
 * differ by at least one property" while still being the colour-only edit this file exists to
 * forbid. What actually closes the hole is asserting the two ends of that property: at rest
 * `.statToggle` declares its border-bottom colour as `transparent` — nothing to see — and only
 * the expanded rule gives it a token colour. A future edit that gives the resting rule a visible
 * colour, leaving only a hue swap between hover and expanded, fails the transparency check even
 * though it would still pass a same-properties-differ check.
 */

const DIR = dirname(fileURLToPath(import.meta.url))

function readCss(fileName: string): string {
  return readFileSync(join(DIR, fileName), 'utf8')
}

function stripComments(css: string): string {
  return css.replace(/\/\*[\s\S]*?\*\//g, '')
}

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

/** Every flat rule whose own selector matches `selectorPattern`, body only (mirrors
 *  planHeaderStyles.test.ts's shortStateRuleBodies for the same reason: a file can declare the
 *  same selector more than once). */
function ruleBodiesFor(css: string, selectorPattern: RegExp): string[] {
  const bodies: string[] = []
  const ruleRegex = /([^{}]+)\{([^{}]*)\}/g
  let match: RegExpExecArray | null
  const clean = stripComments(css)
  while ((match = ruleRegex.exec(clean)) !== null) {
    const selector = match[1] ?? ''
    const body = match[2] ?? ''
    if (selectorPattern.test(selector)) {
      bodies.push(body)
    }
  }
  return bodies
}

describe('PlanHeader.module.css — the score figure follows the existing .statValue step, not a new one', () => {
  it('.statValue is styled at font: var(--t-figure-lg), the same step Pinned and Unseated already use', () => {
    const rule = findRule(readCss('PlanHeader.module.css'), /\.statValue\s*\{/)
    expect(rule).not.toBeNull()
    expect(rule?.body).toMatch(/font\s*:\s*var\(--t-figure-lg\)/)
  })
})

describe('PlanHeader.module.css — the shared stat toggle is never a filled control', () => {
  it('.statToggle sets no background other than transparent or var(--sunken)', () => {
    const bodies = ruleBodiesFor(readCss('PlanHeader.module.css'), /(?:^|[\s,])\.statToggle\b/)
    expect(bodies.length).toBeGreaterThan(0)

    for (const body of bodies) {
      const backgroundDeclarations = [...body.matchAll(/background(?:-color)?\s*:\s*([^;]+);?/g)].map((m) =>
        (m[1] ?? '').trim(),
      )
      for (const value of backgroundDeclarations) {
        expect(['transparent', 'var(--sunken)']).toContain(value)
      }
    }
  })

  it('never sets var(--slate), var(--hard) or var(--soft) as a background anywhere on the toggle', () => {
    const bodies = ruleBodiesFor(readCss('PlanHeader.module.css'), /(?:^|[\s,])\.statToggle\b/)
    const combined = bodies.join('\n')
    expect(combined).not.toMatch(/var\(--slate\)/)
    expect(combined).not.toMatch(/var\(--hard\)/)
    expect(combined).not.toMatch(/var\(--soft\)/)
  })
})

describe('PlanHeader.module.css — the caret glyph is gone, not merely unrendered (TT-16 part two)', () => {
  it('declares no .caret rule anywhere', () => {
    const css = stripComments(readCss('PlanHeader.module.css'))
    expect(css).not.toMatch(/(?:^|[\s,}])\.caret\b/)
  })
})

describe('PlanHeader.module.css — the expanded rule and the hover rule are not the same rule under two names', () => {
  it('.statToggle declares its resting border-bottom colour as transparent — nothing to see until expanded', () => {
    const rule = findRule(readCss('PlanHeader.module.css'), /(?:^|[\s,])\.statToggle\s*\{/)
    expect(rule).not.toBeNull()
    // Either a `border-bottom(-color)` declaration naming transparent directly, or a
    // `border-color: transparent` shorthand covering all four sides (paired with a
    // `border-bottom-width` elsewhere in the same rule) — both leave nothing to see at rest.
    expect(rule?.body).toMatch(/(?:border-bottom(?:-color)?|border-color)\s*:\s*[^;]*\btransparent\b/)
  })

  it('.statToggle[aria-expanded="true"] declares a token border-bottom-color, distinct from the hover rule', () => {
    const rule = findRule(readCss('PlanHeader.module.css'), /\.statToggle\[\s*aria-expanded\s*=\s*['"]?true['"]?\s*\]\s*\{/)
    expect(rule).not.toBeNull()
    expect(rule?.body).toMatch(/border-bottom-color\s*:\s*var\(--[a-z-]+\)/)
  })

  it('the hover rule and the expanded rule declare different properties — the expanded rule is not hover plus nothing', () => {
    const css = readCss('PlanHeader.module.css')
    const hoverBodies = ruleBodiesFor(css, /\.statToggle:hover/)
    const expandedBodies = ruleBodiesFor(
      css,
      /\.statToggle\[\s*aria-expanded\s*=\s*['"]?true['"]?\s*\]/,
    )
    expect(hoverBodies.length).toBeGreaterThan(0)
    expect(expandedBodies.length).toBeGreaterThan(0)

    const propsOf = (bodies: string[]) =>
      new Set(bodies.flatMap((body) => [...body.matchAll(/([a-z-]+)\s*:/g)].map((m) => m[1] ?? '')))
    const hoverProps = propsOf(hoverBodies)
    const expandedProps = propsOf(expandedBodies)

    // Satisfied by a bare `border-bottom-color` alone — the exact colour-only change this test
    // exists to forbid — so the two rule bodies must not be textually identical either.
    expect(hoverBodies.join(';').replace(/\s+/g, '')).not.toBe(expandedBodies.join(';').replace(/\s+/g, ''))

    const expandedOnlyProps = [...expandedProps].filter((prop) => !hoverProps.has(prop))
    expect(expandedOnlyProps.length).toBeGreaterThan(0)
  })
})

describe('PlanHeader.module.css — every stat reserves the same border-bottom width, so a toggle expanding never moves the row', () => {
  it.each([
    ['.stat', /(?:^|[\s,])\.stat\s*\{/],
    ['.statToggle', /(?:^|[\s,])\.statToggle\s*\{/],
    ['.scoreAbsent', /(?:^|[\s,])\.scoreAbsent\s*\{/],
  ] as const)('%s declares a 2px border-bottom (solid or width alone)', (_name, selectorPattern) => {
    const rule = findRule(readCss('PlanHeader.module.css'), selectorPattern)
    expect(rule).not.toBeNull()
    expect(rule?.body).toMatch(/border-bottom(?:-width)?\s*:\s*[^;]*2px/)
  })
})

describe('PinnedGuestsPanel.module.css — a row is a hairline, never the severity-bar idiom', () => {
  it('.row declares border-bottom in var(--rule), and no left border of any style', () => {
    const rule = findRule(readCss('PinnedGuestsPanel.module.css'), /(?:^|[\s,])\.row\s*\{/)
    expect(rule).not.toBeNull()
    expect(rule?.body).toMatch(/border-bottom(?:-color)?\s*:\s*[^;]*var\(--rule\)/)
    expect(rule?.body).not.toMatch(/border-left/)
  })

  it('no rule anywhere in the file sets a left border', () => {
    const css = stripComments(readCss('PinnedGuestsPanel.module.css'))
    expect(css).not.toMatch(/border-left/)
  })

  it('declares no --hard or --soft colour anywhere — a pinned guest is not a violation', () => {
    const css = stripComments(readCss('PinnedGuestsPanel.module.css'))
    expect(css).not.toMatch(/var\(--hard\)/)
    expect(css).not.toMatch(/var\(--soft\)/)
  })
})

describe('PinnedGuestsPanel.module.css — the list scrolls inside the fixed-width column rather than growing it', () => {
  it('.list declares overflow-y: auto and min-height: 0', () => {
    const rule = findRule(readCss('PinnedGuestsPanel.module.css'), /(?:^|[\s,])\.list\s*\{/)
    expect(rule).not.toBeNull()
    expect(rule?.body).toMatch(/overflow-y\s*:\s*auto/)
    expect(rule?.body).toMatch(/min-height\s*:\s*0/)
  })
})

describe('ScoreBreakdownPanel.module.css — a row is a hairline, never the severity-bar idiom', () => {
  it('.row declares border-bottom in var(--rule), and no left border of any style', () => {
    const rule = findRule(readCss('ScoreBreakdownPanel.module.css'), /(?:^|[\s,])\.row\s*\{/)
    expect(rule).not.toBeNull()
    expect(rule?.body).toMatch(/border-bottom(?:-color)?\s*:\s*[^;]*var\(--rule\)/)
    expect(rule?.body).not.toMatch(/border-left/)
  })

  it('no rule anywhere in the file sets a left border', () => {
    const css = stripComments(readCss('ScoreBreakdownPanel.module.css'))
    expect(css).not.toMatch(/border-left/)
  })
})

describe('ScoreBreakdownPanel.module.css — the list scrolls inside the fixed-width column rather than growing it', () => {
  it('.list declares overflow-y: auto and min-height: 0', () => {
    const rule = findRule(readCss('ScoreBreakdownPanel.module.css'), /(?:^|[\s,])\.list\s*\{/)
    expect(rule).not.toBeNull()
    expect(rule?.body).toMatch(/overflow-y\s*:\s*auto/)
    expect(rule?.body).toMatch(/min-height\s*:\s*0/)
  })
})
