import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

/**
 * TT-4, "Import a scenario" — KB-5's shape rule, the same one TT-3's
 * capacityReadoutStyles.test.ts exists to check: "Colour never carries meaning alone... every
 * state pairs a colour with a shape." jsdom applies no CSS, so scenarioImport.test.tsx can only
 * see the failure line's data-severity="hard" attribute and its words, never whether the colour
 * is actually backed by a shape.
 *
 * This file reads ScenarioPicker.module.css as text — the technique capacityReadoutStyles.test.ts
 * established — and checks KB-5's rules directly against the stylesheet's own declarations.
 * Reading a stylesheet as text is not reading the implementation.
 *
 * Does not open ScenarioPicker.tsx, SetupScreen.tsx, or any other implementation file. Does not
 * edit src/ui/brand.test.ts, which belongs to TT-7 and already sweeps every stylesheet under
 * src/ for box-shadow, colour literals and uppercase text-transform — the C24 checks below
 * repeat a subset of that sweep locally only so a failure here points at this file specifically
 * (per .claude/plans/TT-4.md section 5, which leaves dropping them to the tester's judgement;
 * they are cheap enough to keep).
 */

const DIR = dirname(fileURLToPath(import.meta.url))
const CSS_PATH = join(DIR, 'ScenarioPicker.module.css')

function readCss(): string {
  return readFileSync(CSS_PATH, 'utf8')
}

function stripComments(css: string): string {
  return css.replace(/\/\*[\s\S]*?\*\//g, '')
}

// Extracts the declaration block of every flat (non-nested) rule whose selector targets the
// hard-severity attribute, regardless of quoting style or attribute ordering. Scoped to just
// this rule's own declarations, the same way capacityReadoutStyles.test.ts scopes to the
// short-state rule, so a legitimate declaration elsewhere in the file (e.g. the card surface's
// own background) is never mistaken for a wash on the failure line specifically.
function hardSeverityRuleBodies(css: string): string[] {
  const bodies: string[] = []
  const ruleRegex = /([^{}]+)\{([^{}]*)\}/g
  let match: RegExpExecArray | null
  while ((match = ruleRegex.exec(stripComments(css))) !== null) {
    const selector = match[1] ?? ''
    const body = match[2] ?? ''
    if (/data-severity\s*=\s*['"]?hard['"]?/i.test(selector)) {
      bodies.push(body)
    }
  }
  return bodies
}

describe('the failure line pairs colour with a shape, from the stylesheet text (KB-5, C23)', () => {
  it('declares a dedicated rule for the hard-severity failure line', () => {
    expect(hardSeverityRuleBodies(readCss()).length).toBeGreaterThan(0)
  })

  it('carries the failure state on a border-left in the hard token, not colour alone', () => {
    const combined = hardSeverityRuleBodies(readCss()).join('\n')
    expect(combined).toMatch(/border-left\s*:[^;]*var\(--hard\)/i)
  })
})

describe('ScenarioPicker.module.css carries no off-brand declarations (KB-5, C24)', () => {
  it('declares no box-shadow, text-shadow or drop-shadow anywhere in the file', () => {
    const css = stripComments(readCss())
    expect(css).not.toMatch(/box-shadow\s*:/i)
    expect(css).not.toMatch(/text-shadow\s*:/i)
    expect(css).not.toMatch(/drop-shadow/i)
  })

  it('declares no text-transform: uppercase anywhere in the file', () => {
    const css = stripComments(readCss())
    expect(css).not.toMatch(/text-transform\s*:\s*uppercase/i)
  })

  it('declares no outline: none anywhere in the file', () => {
    const css = stripComments(readCss())
    expect(css).not.toMatch(/outline\s*:\s*none/i)
  })

  it('declares no bare colour literal — every colour is a var(--token)', () => {
    const css = stripComments(readCss())
    expect(css).not.toMatch(/#[0-9a-f]{3,8}\b/i)
    expect(css).not.toMatch(/\b(?:rgb|hsl)a?\(/i)
  })
})
