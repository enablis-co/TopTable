import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

/**
 * TT-42. jsdom applies no CSS, so a render test can see that the version stamp exists but not
 * whether it is actually pinned to the bottom, actually white, or actually mono — that is a
 * browser-pass observation (per the plan's file-by-file notes on NavRail.module.css). This
 * reads NavRail.module.css as text instead, in the idiom of
 * src/screens/plan/railStyles.test.ts: it proves a rule is *declared*, never that it wins the
 * cascade.
 *
 * Opens no .tsx file, and does not open appVersion.ts or NavRail.tsx.
 */

const DIR = dirname(fileURLToPath(import.meta.url))
const CSS_PATH = join(DIR, 'NavRail.module.css')

const VERSION_RULE = /\.version\s*\{/

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
    throw new Error(`expected NavRail.module.css to declare a rule for ${description}`)
  }
  return rule
}

describe('NavRail.module.css — .version declares color as the --chrome-ink token, never a literal (A16, A24)', () => {
  it('T16: .version sets color to a var(--...) token, with no colour literal anywhere in the rule', () => {
    const rule = requireRule(readCss(), VERSION_RULE, 'the version stamp')
    expect(rule.body).toMatch(/color\s*:\s*var\(--[\w-]+\)/i)
    expect(rule.body).not.toMatch(/#[0-9a-f]{3,8}\b/i)
    expect(rule.body).not.toMatch(/\b(rgb|rgba|hsl|hsla)\s*\(/i)
  })

  it('T17: the token is --chrome-ink specifically — the chrome zone\'s white, not a canvas ink and not a bare #FFF', () => {
    const rule = requireRule(readCss(), VERSION_RULE, 'the version stamp')
    const colour = /color\s*:\s*(var\(--[\w-]+\))/i.exec(rule.body)?.[1]
    expect(colour).toBe('var(--chrome-ink)')
  })
})

describe('NavRail.module.css — .version declares font: var(--t-figure), the same token the nav counts use (A17)', () => {
  it('T18: .version sets font: var(--t-figure)', () => {
    const rule = requireRule(readCss(), VERSION_RULE, 'the version stamp')
    expect(rule.body).toMatch(/font\s*:\s*var\(--t-figure\)/i)
  })
})

describe('NavRail.module.css — .version declares an auto top margin, pinning it to the bottom of the rail (A18)', () => {
  it('T19: an auto top margin pins the element, rather than the rule relying on source order alone', () => {
    const rule = requireRule(readCss(), VERSION_RULE, 'the version stamp')
    const margin = /margin\s*:\s*([^;]+);/i.exec(rule.body)?.[1]?.trim()
    expect(margin, 'expected .version to declare a margin shorthand').toBeTruthy()
    // "auto ..." (top) pins to the bottom of a flex column; "... auto" (only the last value)
    // would instead centre it horizontally and do nothing to its vertical position.
    expect(margin).toMatch(/^auto\b/)
  })
})

describe('NavRail.module.css — the version stamp never combines the tt-num utility with its own font shorthand (A24)', () => {
  it('T20: the rule neither selects nor composes tt-num alongside the font shorthand it declares', () => {
    const rule = requireRule(readCss(), VERSION_RULE, 'the version stamp')
    expect(rule.body).toMatch(/font\s*:\s*var\(--t-figure\)/i)
    expect(rule.selector).not.toMatch(/tt-num/i)
    expect(rule.body).not.toMatch(/composes\s*:[^;]*tt-num/i)
  })
})

describe('NavRail.module.css — the brand rules hold for this file too', () => {
  it('declares no box-shadow anywhere in the file', () => {
    expect(stripComments(readCss())).not.toMatch(/box-shadow\s*:/i)
  })

  it('declares no literal colour value in the file — every colour comes from a var(--token)', () => {
    const css = stripComments(readCss())
    expect(css).not.toMatch(/#[0-9a-f]{3,8}\b/i)
    expect(css).not.toMatch(/\b(rgb|rgba|hsl|hsla)\s*\(/i)
  })
})
