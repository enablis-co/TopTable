import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

/**
 * TT-35, handoff "Plan" layout. jsdom does no layout at all, so PlanScreen.test.tsx can't see
 * whether the canvas column actually shrinks before it pushes the violations column off screen,
 * or whether the two collapse to one column below the breakpoint — only a browser pass can. This
 * reads PlanScreen.module.css as text instead, the same technique floorplanStyles.test.ts and
 * railStyles.test.ts already use on their own stylesheets.
 */

const DIR = dirname(fileURLToPath(import.meta.url))
const CSS_PATH = join(DIR, 'PlanScreen.module.css')

function readCss(): string {
  return readFileSync(CSS_PATH, 'utf8')
}

function stripComments(css: string): string {
  return css.replace(/\/\*[\s\S]*?\*\//g, '')
}

function ruleBody(css: string, selector: string): string {
  const pattern = new RegExp(`${selector.replace(/[.[\]]/g, '\\$&')}\\s*\\{([^}]*)\\}`)
  const match = pattern.exec(stripComments(css))
  if (!match) {
    throw new Error(`expected PlanScreen.module.css to declare a rule for ${selector}`)
  }
  return match[1] ?? ''
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

describe('PlanScreen.module.css — the two-part layout: a canvas column and a fixed violations column (TT-35)', () => {
  it('.layout is a flex row', () => {
    const body = ruleBody(readCss(), '.layout')
    expect(body).toMatch(/display\s*:\s*flex/)
  })

  it('.canvas can shrink narrower than its own content — min-width: 0, not left at its automatic default — so the floorplan can still shrink rather than pushing the violations column off screen', () => {
    const body = ruleBody(readCss(), '.canvas')
    expect(body).toMatch(/flex\s*:\s*1\b/)
    expect(body).toMatch(/min-width\s*:\s*0\b/)
  })

  it('review fix (TT-35): .canvas also declares min-height: 0, the same trick on the vertical axis — without it, .canvas will not shrink below its own content height (header + floorplan + rail), and the overflow escapes to AppShell\'s .main instead of staying inside the floorplan', () => {
    const body = ruleBody(readCss(), '.canvas')
    expect(body).toMatch(/min-height\s*:\s*0\b/)
  })

  it('.violations is a fixed, non-growing 300px column', () => {
    const body = ruleBody(readCss(), '.violations')
    expect(body).toMatch(/flex\s*:\s*none/)
    expect(body).toMatch(/width\s*:\s*300px/)
  })
})

describe('PlanScreen.module.css — Auto-allocate sits at the canvas header\'s right edge (TT-13 moved by TT-35)', () => {
  it('.canvasHeader is a flex row, bottom-aligned, so the button sits level with the header\'s own content', () => {
    const body = ruleBody(readCss(), '.canvasHeader')
    expect(body).toMatch(/display\s*:\s*flex/)
    expect(body).toMatch(/align-items\s*:\s*flex-end/)
  })

  it('.allocate does not grow or shrink — the header beside it is what absorbs the available width', () => {
    const body = ruleBody(readCss(), '.allocate')
    expect(body).toMatch(/flex\s*:\s*none/)
  })

  it('there is no .actions rule left — that was the old above-the-header placement (TT-13), retired by this move', () => {
    expect(stripComments(readCss())).not.toMatch(/\.actions\s*\{/)
  })
})

describe('PlanScreen.module.css — below the breakpoint the two columns stack (TT-11 fix D1, carried into the TT-35 layout)', () => {
  it('declares an @media (max-width) rule containing a .layout override to a single column', () => {
    const css = readCss()
    expect(stripComments(css)).toMatch(/@media\s*\(\s*max-width\s*:\s*720px\s*\)/i)

    const body = mediaBlockBody(css)
    expect(body).toMatch(/\.layout\s*\{[^}]*flex-direction\s*:\s*column/)
  })

  it('the violations column drops its fixed width once stacked, or it would sit far too wide beneath a narrow canvas', () => {
    const body = mediaBlockBody(readCss())
    const match = /\.violations\s*\{([^}]*)\}/.exec(body)
    expect(match, 'expected a .violations override inside the @media block').not.toBeNull()
    expect(match?.[1] ?? '').not.toMatch(/width\s*:\s*300px/)
  })
})

describe('PlanScreen.module.css — the brand rules hold for this file too', () => {
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
