import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

/**
 * TT-6, regression (TT-5/TT-6 review). KB-5's shape rule: "Colour never carries meaning
 * alone... every state pairs a colour with a shape." `.highlight` marked a just-saved row with
 * `background: var(--sunken)` alone — a ~4% luminance difference with no shape, invisible on a
 * projector or in greyscale. jsdom never applies CSS (docs/engineering-standards.md, "What the
 * suite cannot see"), so a render-based test could only ever confirm the class name is present,
 * never whether the rule behind it carries a shape.
 *
 * This file reads GuestTable.module.css as text — the same technique
 * src/screens/setup/capacityReadoutStyles.test.ts already uses on CapacityReadout's own
 * short-state rule, and src/ui/brand.test.ts uses more broadly — and checks the published rule
 * directly against the stylesheet's own declarations. Reading a stylesheet as text is not
 * reading the implementation; it is asserting a KB-5 rule against a file's contents.
 *
 * Does not open GuestTable.tsx or any other implementation file.
 */

const DIR = dirname(fileURLToPath(import.meta.url))
const CSS_PATH = join(DIR, 'GuestTable.module.css')

function readCss(): string {
  return readFileSync(CSS_PATH, 'utf8')
}

function stripComments(css: string): string {
  return css.replace(/\/\*[\s\S]*?\*\//g, '')
}

// Extracts the declaration block of every flat rule whose selector mentions `highlight`,
// exactly as capacityReadoutStyles.test.ts scopes to `data-state='short'` — so a border
// declared on some unrelated rule elsewhere in the file can never be mistaken for this one's.
function highlightRuleBodies(css: string): string[] {
  const bodies: string[] = []
  const ruleRegex = /([^{}]+)\{([^{}]*)\}/g
  let match: RegExpExecArray | null
  while ((match = ruleRegex.exec(stripComments(css))) !== null) {
    const selector = match[1] ?? ''
    const body = match[2] ?? ''
    if (/highlight/i.test(selector)) {
      bodies.push(body)
    }
  }
  return bodies
}

describe('GuestTable save-highlight styling, from the stylesheet text (KB-5)', () => {
  it('declares at least one rule for the highlight state', () => {
    expect(highlightRuleBodies(readCss()).length).toBeGreaterThan(0)
  })

  it('carries the highlight on a shape — a border-left — in a real token, not a literal colour', () => {
    const combined = highlightRuleBodies(readCss()).join('\n')
    expect(combined).toMatch(/border-left\s*:[^;]*var\(--[\w-]+\)/i)
  })

  it('does not reach for hard or soft: a save is not a violation', () => {
    const combined = highlightRuleBodies(readCss()).join('\n')
    expect(combined).not.toMatch(/var\(--hard\b/i)
    expect(combined).not.toMatch(/var\(--soft\b/i)
  })
})
