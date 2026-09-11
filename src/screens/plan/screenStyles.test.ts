import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

/**
 * jsdom does no layout, so PlanScreen.test.tsx can't see the gap between the header line and
 * the rail/floorplan below it — only a browser pass can. This reads PlanScreen.module.css as
 * text instead, the same technique floorplanStyles.test.ts and railStyles.test.ts already use.
 */

const DIR = dirname(fileURLToPath(import.meta.url))
const CSS_PATH = join(DIR, 'PlanScreen.module.css')

function readCss(): string {
  return readFileSync(CSS_PATH, 'utf8')
}

function stripComments(css: string): string {
  return css.replace(/\/\*[\s\S]*?\*\//g, '')
}

/**
 * Extracts the contents of the (single) top-level @media block by brace-counting, the same
 * technique floorplanStyles.test.ts's containerBlockBody uses for its @container block — a flat
 * regex can't stop at the block's own matching closing brace.
 */
function mediaBlockBody(css: string): string {
  const clean = stripComments(css)
  const start = clean.search(/@media\b/i)
  if (start === -1) return ''
  const openBrace = clean.indexOf('{', start)
  if (openBrace === -1) return ''

  let depth = 0
  for (let i = openBrace; i < clean.length; i += 1) {
    if (clean[i] === '{') depth += 1
    else if (clean[i] === '}') {
      depth -= 1
      if (depth === 0) return clean.slice(openBrace + 1, i)
    }
  }
  return clean.slice(openBrace + 1)
}

describe('PlanScreen.module.css — a gap separates the header line from the rail and floorplan (KB-6)', () => {
  it('.screen declares margin-top in a real spacing token, not left at zero above its own grid gap', () => {
    const rule = /\.screen\s*\{([^}]*)\}/.exec(stripComments(readCss()))
    expect(rule, 'expected a .screen rule in PlanScreen.module.css').not.toBeNull()
    const body = rule?.[1] ?? ''

    expect(body).toMatch(/margin-top\s*:\s*var\(--space-\d\)/)
  })
})

describe('PlanScreen.module.css — below a breakpoint the rail and floorplan collapse to one column (TT-11 fix, D1)', () => {
  it('declares an @media (max-width) rule containing a .screen override to a single column', () => {
    const css = readCss()
    expect(stripComments(css)).toMatch(/@media\s*\(\s*max-width\s*:\s*\d+px\s*\)/i)

    const body = mediaBlockBody(css)
    const rule = /\.screen\s*\{([^}]*)\}/.exec(body)
    expect(rule, 'expected a .screen override inside the @media block').not.toBeNull()
    // minmax(0, 1fr), not a bare 1fr — a bare 1fr's automatic minimum is content width, which
    // would stop the floorplan's own overflow-x: auto scroll container from ever shrinking
    // below its full content width, the same trap the two-column rule above already avoids.
    expect(rule?.[1] ?? '').toMatch(/grid-template-columns\s*:\s*minmax\(\s*0\s*,\s*1fr\s*\)/i)
  })
})
