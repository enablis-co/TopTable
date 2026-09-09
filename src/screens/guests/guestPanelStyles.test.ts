import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

/**
 * TT-5, regression (TT-5/TT-6 review). `.row` laid out the Side/Role/Age and Household/Partner
 * pairs as a plain flex row with no wrap, so below roughly 700px the selects clipped their own
 * text ("Adult (18 an…") — hiding exactly the age boundaries A19 exists to show (the boundary
 * only appears in the option label itself). jsdom does no layout at all
 * (docs/engineering-standards.md, "What the suite cannot see") — `getBoundingClientRect` and
 * friends all return zero there — so no render-based test can see an element clip at a given
 * viewport width. This file reads GuestPanel.module.css as text instead, the same technique
 * src/screens/setup/capacityReadoutStyles.test.ts uses for a shape rule jsdom equally cannot
 * observe, and checks the published rules directly against the stylesheet's own declarations.
 *
 * `flex-wrap: wrap` alone turned out not to be enough, confirmed against the real running app
 * (a browser check this file cannot replace, only pin down afterwards): `.row > *` originally
 * carried `min-width: 0`, so three flex:1 children always "fit" by shrinking indefinitely and
 * never tripped a wrap — the row stayed one line at 700px, each `<select>` narrower than its
 * own selected text. A floor set on the `<select>` itself does not work either: the wrap
 * decision is made on `.row`'s direct children, so a wider descendant just overflows its own
 * shrunken parent instead of forcing it wider. Both declarations below — the flat `.row` rule
 * and `.row > *`'s own floor — are asserted, because either alone leaves the clipping this
 * file exists to catch.
 *
 * Does not open GuestPanel.tsx or any other implementation file.
 */

const DIR = dirname(fileURLToPath(import.meta.url))
const CSS_PATH = join(DIR, 'GuestPanel.module.css')

function readCss(): string {
  return readFileSync(CSS_PATH, 'utf8')
}

function stripComments(css: string): string {
  return css.replace(/\/\*[\s\S]*?\*\//g, '')
}

// Extracts the declaration body of every flat rule whose selector matches (via the given
// predicate), scanning selector text rather than trusting rule order or adjacency.
function ruleBodiesWhere(css: string, matches: (selector: string) => boolean): string[] {
  const bodies: string[] = []
  const ruleRegex = /([^{}]+)\{([^{}]*)\}/g
  let match: RegExpExecArray | null
  while ((match = ruleRegex.exec(stripComments(css))) !== null) {
    const selector = (match[1] ?? '').trim()
    const body = match[2] ?? ''
    if (matches(selector)) {
      bodies.push(body)
    }
  }
  return bodies
}

// The flat `.row` rule specifically.
function rowRuleBodies(css: string): string[] {
  return ruleBodiesWhere(css, (selector) => /(^|,)\s*\.row\s*($|,)/.test(selector))
}

// `.row > *` specifically — the direct-children rule that has to carry the actual floor for
// flex-wrap to have anything to trip on (see the file header).
function rowChildRuleBodies(css: string): string[] {
  return ruleBodiesWhere(css, (selector) => /\.row\s*>\s*\*/.test(selector))
}

describe('GuestPanel .row layout, from the stylesheet text', () => {
  it('declares the flat .row rule', () => {
    expect(rowRuleBodies(readCss()).length).toBeGreaterThan(0)
  })

  it('lets a cramped row wrap onto a second line instead of clipping its fields', () => {
    const combined = rowRuleBodies(readCss()).join('\n')
    expect(combined).toMatch(/flex-wrap\s*:\s*wrap/i)
  })

  it('declares the .row > * rule', () => {
    expect(rowChildRuleBodies(readCss()).length).toBeGreaterThan(0)
  })

  it('gives every row child a real min-width floor, so flex-wrap has something to trip on', () => {
    // Not `min-width: 0` (or absent): a floor of 0 is exactly what let every child shrink
    // indefinitely instead of ever wrapping, which is the bug this file exists to catch.
    const combined = rowChildRuleBodies(readCss()).join('\n')
    expect(combined).toMatch(/min-width\s*:\s*(?!0\b)\d/i)
  })
})
