import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

/**
 * jsdom applies no CSS at all, so ViolationsPanel.test.tsx can only see the `data-severity`
 * attribute itself, never whether hard and soft actually paint a different left border (KB-5:
 * "colour never carries meaning alone"). This file reads ViolationsPanel.module.css as text
 * instead — the same technique src/screens/plan/floorplanStyles.test.ts, railStyles.test.ts and
 * screenStyles.test.ts already use on their own stylesheets: it proves a rule is *declared*,
 * never that it wins the cascade or renders at all — jsdom does no layout.
 *
 * KB-5 and TT-14 disagree about shape: KB-5 says soft violations get "the same left bar in
 * amber", TT-14 requires hard and soft to "render differently by shape as well as by colour".
 * TT-14 supersedes KB-5 here, so this file asserts solid versus dotted, not two identical bars.
 *
 * Does not open ViolationsPanel.tsx or ViolationsPanel.module.css.
 */

const DIR = dirname(fileURLToPath(import.meta.url))
const CSS_PATH = join(DIR, 'ViolationsPanel.module.css')

// The class name (if any) preceding the attribute selector is ViolationsPanel.tsx's business,
// not this file's — these patterns match the bare attribute selector wherever it sits, so they
// hold regardless of what, if anything, precedes `[data-severity=...]` in the stylesheet.
const HARD_SEVERITY = /\[\s*data-severity\s*=\s*['"]?hard['"]?\s*\]/
const SOFT_SEVERITY = /\[\s*data-severity\s*=\s*['"]?soft['"]?\s*\]/

function readCss(): string {
  return readFileSync(CSS_PATH, 'utf8')
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

function requireRule(css: string, selectorPattern: RegExp, description: string): { selector: string; body: string } {
  const rule = findRule(css, selectorPattern)
  if (!rule) {
    throw new Error(`expected ViolationsPanel.module.css to declare a rule for ${description}`)
  }
  return rule
}

describe('ViolationsPanel.module.css — a dedicated rule for each severity (TT-14)', () => {
  it('declares a rule for data-severity="hard"', () => {
    expect(findRule(readCss(), HARD_SEVERITY)).not.toBeNull()
  })

  it('declares a rule for data-severity="soft"', () => {
    expect(findRule(readCss(), SOFT_SEVERITY)).not.toBeNull()
  })
})

describe('ViolationsPanel.module.css — hard is a solid left bar in var(--hard), never dotted (TT-14)', () => {
  it('declares border-left as solid, in var(--hard)', () => {
    const rule = requireRule(readCss(), HARD_SEVERITY, 'data-severity="hard"')
    expect(rule.body).toMatch(/border-left(?:-style)?\s*:\s*[^;]*\bsolid\b/i)
    expect(rule.body).toMatch(/border-left(?:-color)?\s*:\s*[^;]*var\(--hard\)/i)
  })

  it('is not also dotted — TT-14 requires hard and soft to differ by shape, not only by colour', () => {
    const rule = requireRule(readCss(), HARD_SEVERITY, 'data-severity="hard"')
    expect(rule.body).not.toMatch(/\bdotted\b/i)
  })
})

describe('ViolationsPanel.module.css — soft is a dotted left bar in var(--soft), never solid (TT-14 supersedes KB-5 on shape)', () => {
  it('declares border-left as dotted, in var(--soft)', () => {
    const rule = requireRule(readCss(), SOFT_SEVERITY, 'data-severity="soft"')
    expect(rule.body).toMatch(/border-left(?:-style)?\s*:\s*[^;]*\bdotted\b/i)
    expect(rule.body).toMatch(/border-left(?:-color)?\s*:\s*[^;]*var\(--soft\)/i)
  })

  it('is not also solid', () => {
    const rule = requireRule(readCss(), SOFT_SEVERITY, 'data-severity="soft"')
    expect(rule.body).not.toMatch(/\bsolid\b/i)
  })
})

describe('ViolationsPanel.module.css — neither severity reaches for a colour literal (KB-5 tokens only)', () => {
  it('both rules use var(--hard) / var(--soft), never a hex, rgb or hsl literal', () => {
    const hard = requireRule(readCss(), HARD_SEVERITY, 'data-severity="hard"')
    const soft = requireRule(readCss(), SOFT_SEVERITY, 'data-severity="soft"')
    const combined = `${hard.body}\n${soft.body}`

    expect(combined).not.toMatch(/#[0-9a-f]{3,8}\b/i)
    expect(combined).not.toMatch(/\b(rgb|rgba|hsl|hsla)\s*\(/i)
  })
})
