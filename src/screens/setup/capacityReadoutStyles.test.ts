import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

/**
 * TT-3, "Set up the room" — KB-5's shape rule: "Colour never carries meaning alone. Every
 * state pairs a colour with a shape... soft get the same [treatment] in amber." jsdom never
 * applies CSS, so SetupScreen.test.tsx's short-state test can only see a data-state="short"
 * attribute and the word "short" in the sentence — it cannot see whether the colour is backed
 * by a shape or is a wash standing alone. That leaves KB-5's rule genuinely unverified.
 *
 * This file reads CapacityReadout.module.css as text — the same technique src/ui/brand.test.ts
 * already uses on stylesheets — and checks the published rule directly against the
 * stylesheet's own declarations. Reading a stylesheet as text is not reading the
 * implementation; it is asserting a KB-5 rule against a file's contents.
 *
 * Does not open CapacityReadout.tsx, SetupScreen.tsx, SetupScreen.module.css, or any other
 * implementation file. Does not edit src/ui/brand.test.ts, which belongs to TT-7.
 */

// This file lives at src/screens/setup/capacityReadoutStyles.test.ts, alongside the module it
// reads.
const DIR = dirname(fileURLToPath(import.meta.url))
const CSS_PATH = join(DIR, 'CapacityReadout.module.css')

function readCss(): string {
  return readFileSync(CSS_PATH, 'utf8')
}

function stripComments(css: string): string {
  return css.replace(/\/\*[\s\S]*?\*\//g, '')
}

// Extracts the declaration block of every flat (non-nested) rule whose selector targets the
// short data-state, regardless of quoting style or attribute ordering — [data-state='short'],
// [data-state="short"] and [data-state=short] all match. Deliberately scoped to just this
// rule's own declarations rather than the whole file: the base .readout rule legitimately
// declares a background for the card surface, and that must never be confused with a wash on
// the short state specifically.
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

describe('CapacityReadout short-state styling, from the stylesheet text (KB-5)', () => {
  it('declares a dedicated rule for the short data-state', () => {
    expect(shortStateRuleBodies(readCss()).length).toBeGreaterThan(0)
  })

  it('carries the short state on a shape — a border-left — in the soft token', () => {
    const combined = shortStateRuleBodies(readCss()).join('\n')
    expect(combined).toMatch(/border-left\s*:[^;]*var\(--soft\)/i)
  })

  it('never styles the short state in the hard token: short is a warning, never an error', () => {
    const combined = shortStateRuleBodies(readCss()).join('\n')
    expect(combined).not.toMatch(/var\(--hard\)/i)
  })

  it('declares no background or background-color for the short state — a wash was rejected in favour of the bar', () => {
    const combined = shortStateRuleBodies(readCss()).join('\n')
    expect(combined).not.toMatch(/background(-color)?\s*:/i)
  })
})
