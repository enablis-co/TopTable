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

describe('PlanScreen.module.css — a gap separates the header line from the rail and floorplan (KB-6)', () => {
  it('.screen declares margin-top in a real spacing token, not left at zero above its own grid gap', () => {
    const rule = /\.screen\s*\{([^}]*)\}/.exec(stripComments(readCss()))
    expect(rule, 'expected a .screen rule in PlanScreen.module.css').not.toBeNull()
    const body = rule?.[1] ?? ''

    expect(body).toMatch(/margin-top\s*:\s*var\(--space-\d\)/)
  })
})

describe('PlanScreen.module.css — .actions right-aligns Auto-allocate above the header line (TT-13)', () => {
  function actionsBody(): string {
    const rule = /\.actions\s*\{([^}]*)\}/.exec(stripComments(readCss()))
    expect(rule, 'expected an .actions rule in PlanScreen.module.css').not.toBeNull()
    return rule?.[1] ?? ''
  }

  it('declares a real flex/justify value, not left at the browser default', () => {
    const body = actionsBody()
    expect(body).toMatch(/display\s*:\s*flex/)
    expect(body).toMatch(/justify-content\s*:\s*flex-end/)
  })

  it('reaches for no colour literal, no box-shadow and no text-transform', () => {
    const body = actionsBody()
    expect(body).not.toMatch(/#[0-9a-f]{3,8}\b/i)
    expect(body).not.toMatch(/box-shadow\s*:/i)
    expect(body).not.toMatch(/text-transform\s*:\s*uppercase/i)
  })
})
