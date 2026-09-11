import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

/**
 * TT-35, handoff "Canvas header". jsdom applies no CSS, so PlanHeader.test.tsx can only see the
 * `data-state` attribute itself, never whether the short state is actually painted as a warning
 * rather than an error (KB-5: "colour never carries meaning alone"; handoff: "Short is a
 * warning, and it blocks nothing"). This file reads PlanHeader.module.css as text instead, the
 * same technique src/screens/setup/capacityReadoutStyles.test.ts already uses on its own
 * short-state rule.
 *
 * Does not open PlanHeader.tsx.
 */

const DIR = dirname(fileURLToPath(import.meta.url))
const CSS_PATH = join(DIR, 'PlanHeader.module.css')

function readCss(): string {
  return readFileSync(CSS_PATH, 'utf8')
}

function stripComments(css: string): string {
  return css.replace(/\/\*[\s\S]*?\*\//g, '')
}

// Mirrors capacityReadoutStyles.test.ts's shortStateRuleBodies: every flat rule whose selector
// targets the short data-state, regardless of quoting style.
function shortStateRuleBodies(css: string): string[] {
  const bodies: string[] = []
  const ruleRegex = /([^{}]+)\{([^{}]*)\}/g
  let match: RegExpExecArray | null
  while ((match = ruleRegex.exec(stripComments(css))) !== null) {
    const selector = match[1] ?? ''
    const body = match[2] ?? ''
    if (/data-state\s*=\s*['"]?short['"]?/i.test(selector)) {
      bodies.push(body)
    }
  }
  return bodies
}

describe('PlanHeader.module.css — the short qualifier reads as a warning, never an error (KB-5, handoff "Canvas header")', () => {
  it('declares a dedicated rule for the short data-state', () => {
    expect(shortStateRuleBodies(readCss()).length).toBeGreaterThan(0)
  })

  it('carries the short state in the soft token, not the hard one', () => {
    const combined = shortStateRuleBodies(readCss()).join('\n')
    expect(combined).toMatch(/color\s*:\s*var\(--soft-deep\)/i)
    expect(combined).not.toMatch(/var\(--hard[\w-]*\)/i)
  })

  it('declares no background or background-color for the short state — a wash was rejected in favour of plain text, same as the spare and exact states', () => {
    const combined = shortStateRuleBodies(readCss()).join('\n')
    expect(combined).not.toMatch(/background(-color)?\s*:/i)
  })
})

describe('PlanHeader.module.css — the headline figures stay tabular (TT-35 AC5)', () => {
  it('the figure and stat-value rules carry a --t-figure-* font shorthand, never applied to a bare .tt-num element in this file (that pattern is guarded generally by src/ui/tokens.test.ts)', () => {
    const css = stripComments(readCss())
    expect(css).toMatch(/\.figure\s*\{[^}]*font\s*:\s*var\(--t-figure-xl\)/)
    expect(css).toMatch(/\.statValue\s*\{[^}]*font\s*:\s*var\(--t-figure-lg\)/)
  })
})

describe('PlanHeader.module.css — the brand rules hold for this file too', () => {
  it('declares no box-shadow anywhere in the file', () => {
    expect(stripComments(readCss())).not.toMatch(/box-shadow\s*:/i)
  })

  it('declares no text-transform: uppercase anywhere in the file', () => {
    expect(stripComments(readCss())).not.toMatch(/text-transform\s*:\s*uppercase/i)
  })

  it('declares no literal colour value — every colour comes from a var(--token)', () => {
    const css = stripComments(readCss())
    expect(css).not.toMatch(/#[0-9a-f]{3,8}\b/i)
    expect(css).not.toMatch(/\b(rgb|rgba|hsl|hsla)\s*\(/i)
  })
})
