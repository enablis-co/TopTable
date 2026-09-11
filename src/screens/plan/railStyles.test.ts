import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

/**
 * jsdom applies no CSS, so UnseatedRail.test.tsx can only see the `aria-pressed` attribute
 * itself, never whether the selected row is actually marked with a shape rather than a colour
 * swap (KB-5: "colour never carries meaning alone"). This file reads UnseatedRail.module.css as
 * text instead — the same technique src/screens/plan/floorplanStyles.test.ts already uses on
 * PlanTable.module.css: it proves a rule is declared, never that it wins the cascade.
 *
 * Does not open UnseatedRail.tsx or any other implementation file.
 */

const DIR = dirname(fileURLToPath(import.meta.url))
const CSS_PATH = join(DIR, 'UnseatedRail.module.css')

const ROW_BASE = /\.rail\s+\.row\s*\{/
const ROW_PRESSED = /\.rail\s+\.row\[\s*aria-pressed\s*=\s*['"]?true['"]?\s*\]/

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
    throw new Error(`expected UnseatedRail.module.css to declare a rule for ${description}`)
  }
  return rule
}

describe('UnseatedRail.module.css — the selected row is marked with a shape, not a colour swap alone', () => {
  it('declares a rule for the pressed row, with a border-color in a real token', () => {
    const rule = requireRule(readCss(), ROW_PRESSED, "the rail row's pressed state")
    expect(rule.body).toMatch(/border-color\s*:\s*var\(--[\w-]+\)/i)
  })

  it('the base row rule (TT-35: a chip) always carries a visible border, in the rule-strong token — the pressed state changes its colour rather than adding a border where none existed', () => {
    const rule = requireRule(readCss(), ROW_BASE, 'the base rail row')
    expect(rule.body).toMatch(/border-color\s*:\s*var\(--rule-strong\)/i)
  })

  it('the pressed border-colour differs from the base one — a real change, not a same-value no-op', () => {
    const base = requireRule(readCss(), ROW_BASE, 'the base rail row')
    const pressed = requireRule(readCss(), ROW_PRESSED, "the rail row's pressed state")
    const baseColour = /border-color\s*:\s*(var\(--[\w-]+\))/i.exec(base.body)?.[1]
    const pressedColour = /border-color\s*:\s*(var\(--[\w-]+\))/i.exec(pressed.body)?.[1]
    expect(baseColour).toBeTruthy()
    expect(pressedColour).toBeTruthy()
    expect(pressedColour).not.toBe(baseColour)
  })

  it('review fix: selection also changes the border-width, not just its colour — a shape signal that survives with every colour stripped out (KB-5)', () => {
    const base = requireRule(readCss(), ROW_BASE, 'the base rail row')
    const pressed = requireRule(readCss(), ROW_PRESSED, "the rail row's pressed state")
    const baseWidth = /border-width\s*:\s*([\d.]+px)/i.exec(base.body)?.[1]
    const pressedWidth = /border-width\s*:\s*([\d.]+px)/i.exec(pressed.body)?.[1]
    expect(baseWidth, 'expected the base row to declare an explicit border-width').toBeTruthy()
    expect(pressedWidth, 'expected the pressed row to declare an explicit border-width').toBeTruthy()
    expect(pressedWidth).not.toBe(baseWidth)
  })

  it('neither rule reaches for the hard or soft token — a selection is not a warning', () => {
    const base = requireRule(readCss(), ROW_BASE, 'the base rail row')
    const pressed = requireRule(readCss(), ROW_PRESSED, "the rail row's pressed state")
    const combined = `${base.body}\n${pressed.body}`
    expect(combined).not.toMatch(/var\(--hard\)/i)
    expect(combined).not.toMatch(/var\(--soft\)/i)
  })
})

describe('UnseatedRail.module.css — both rail-row rules win on specificity, not on source order', () => {
  it('both selectors are descendant selectors naming .rail, not a bare .row that Button.module.css could equally match', () => {
    const base = requireRule(readCss(), ROW_BASE, 'the base rail row').selector
    const pressed = requireRule(readCss(), ROW_PRESSED, "the rail row's pressed state").selector

    expect(base).toMatch(/\.rail/)
    expect(pressed).toMatch(/\.rail/)
  })
})

describe('UnseatedRail.module.css — the brand rules hold for this file too', () => {
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
