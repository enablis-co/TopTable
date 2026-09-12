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

/**
 * TT-38. jsdom does no layout, so nothing in the suite can see whether the rail actually stays
 * bounded on screen (that is the browser pass named in the plan's §5) — but the declaration
 * that bounds it is text, and this is where a regression would show up first: `.list` losing
 * its `max-height` while everything else still typechecks. Reads UnseatedRail.module.css only.
 */
const LIST_RULE = /(?<!\.rail\s)(?<![\w-])\.list\s*\{/

describe('UnseatedRail.module.css — the list is height-bounded, never free to grow into the floorplan', () => {
  it('.list declares overflow-y: auto and a max-height, and no longer scrolls horizontally', () => {
    const rule = requireRule(readCss(), LIST_RULE, 'the scrolling list')
    expect(rule.body).toMatch(/overflow-y\s*:\s*auto/i)
    expect(rule.body).toMatch(/max-height\s*:/i)
    expect(rule.body).not.toMatch(/overflow-x\s*:\s*auto/i)
  })

  it('the max-height is a clamp, so the bound flexes with viewport height rather than sitting at one fixed figure', () => {
    const rule = requireRule(readCss(), LIST_RULE, 'the scrolling list')
    expect(rule.body).toMatch(/max-height\s*:\s*clamp\(/i)
  })

  it('.rail stays flex: none — the strip takes only its own content height, never a share of .floorplanArea', () => {
    const rule = requireRule(readCss(), /\.rail\s*\{/, 'the rail container')
    expect(rule.body).toMatch(/flex\s*:\s*none/i)
  })

  it('a max-width: 720px media block overrides .list to a smaller max-height, matching PlanScreen.module.css\'s own collapse point', () => {
    const css = stripComments(readCss())
    const mediaMatch = /@media\s*\(\s*max-width\s*:\s*720px\s*\)\s*\{/i.exec(css)
    expect(mediaMatch, 'expected a @media (max-width: 720px) block').toBeTruthy()

    const openBrace = css.indexOf('{', mediaMatch!.index)
    // Walk to the matching closing brace for the whole media block, since it nests one rule.
    let depth = 1
    let index = openBrace + 1
    while (depth > 0 && index < css.length) {
      if (css[index] === '{') depth += 1
      if (css[index] === '}') depth -= 1
      index += 1
    }
    const mediaBody = css.slice(openBrace + 1, index - 1)

    expect(mediaBody).toMatch(/\.list\s*\{[^}]*max-height\s*:/i)

    const outerMaxHeight = /max-height\s*:\s*([^;]+);/i.exec(requireRule(css, LIST_RULE, 'the scrolling list').body)?.[1]
    const innerMaxHeight = /\.list\s*\{[^}]*max-height\s*:\s*([^;]+);/i.exec(mediaBody)?.[1]
    expect(outerMaxHeight).toBeTruthy()
    expect(innerMaxHeight).toBeTruthy()
    expect(innerMaxHeight?.trim()).not.toBe(outerMaxHeight?.trim())
  })
})

/**
 * TT-38 delta. Rows became short wrapping tiles on their own surface, separated from the
 * controls above by a background step rather than a border — jsdom applies no CSS, so this is
 * the only place the suite can confirm the declarations exist at all.
 */
describe('UnseatedRail.module.css — the rail delta: wrapping tiles, one separator only', () => {
  it('.list declares flex-wrap: wrap', () => {
    const rule = requireRule(readCss(), LIST_RULE, 'the scrolling list')
    expect(rule.body).toMatch(/flex-wrap\s*:\s*wrap/i)
  })

  it('.rail .row no longer stretches to the width of a column', () => {
    const rule = requireRule(readCss(), ROW_BASE, 'the base rail row')
    expect(rule.body).not.toMatch(/width\s*:\s*100%/i)
  })

  it('.list declares exactly one of a background step or a border — never both, never a shadow', () => {
    const rule = requireRule(readCss(), LIST_RULE, 'the scrolling list')
    const hasBackground = /background\s*:/i.test(rule.body)
    // border-radius is a corner, not a separator — excluded so a rounded surface step
    // (background only) doesn't get counted as also declaring a border.
    const hasBorder = /\bborder(?!-radius)(-\w+)?\s*:/i.test(rule.body)
    expect(hasBackground !== hasBorder, 'expected exactly one of background or border on .list').toBe(true)
    expect(rule.body).not.toMatch(/box-shadow\s*:/i)
  })
})
