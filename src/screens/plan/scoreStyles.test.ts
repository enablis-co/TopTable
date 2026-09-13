import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

/**
 * TT-16. jsdom applies no CSS at all, so PlanHeader.test.tsx and ScoreBreakdownPanel.test.tsx can
 * only see `aria-expanded` and the rendered text, never whether the toggle is actually painted
 * as a non-filled control, or whether the expanded state is actually distinguishable by shape
 * rather than colour (KB-5). This file reads PlanHeader.module.css and ScoreBreakdownPanel.module.css
 * as text instead, the same technique violationsPanelStyles.test.ts already uses on its own
 * stylesheet: it proves a rule is *declared*, never that it wins the cascade or renders at all —
 * jsdom does no layout.
 *
 * Written from the ticket's acceptance criteria for the score toggle and the breakdown panel.
 * Does not open PlanHeader.tsx or ScoreBreakdownPanel.tsx.
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

describe('PlanHeader.module.css — the score toggle is never a filled control', () => {
  it('.scoreToggle sets no background other than transparent or var(--sunken)', () => {
    const bodies = ruleBodiesFor(readCss('PlanHeader.module.css'), /(?:^|[\s,])\.scoreToggle\b/)
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

  it('never sets var(--slate), var(--hard) or var(--soft) as a background anywhere on the toggle or its caret', () => {
    const bodies = ruleBodiesFor(readCss('PlanHeader.module.css'), /(?:^|[\s,])\.scoreToggle\b/)
    const combined = bodies.join('\n')
    expect(combined).not.toMatch(/var\(--slate\)/)
    expect(combined).not.toMatch(/var\(--hard\)/)
    expect(combined).not.toMatch(/var\(--soft\)/)
  })
})

describe('PlanHeader.module.css — the expanded state is carried by more than colour', () => {
  it('a rule selecting [aria-expanded="true"] changes something other than colour', () => {
    const bodies = ruleBodiesFor(readCss('PlanHeader.module.css'), /\[\s*aria-expanded\s*=\s*['"]?true['"]?\s*\]/)
    expect(bodies.length).toBeGreaterThan(0)

    const nonColourChange = bodies.some((body) => /transform\s*:|rotate\(|border(?!-color)/i.test(body))
    expect(nonColourChange).toBe(true)
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
