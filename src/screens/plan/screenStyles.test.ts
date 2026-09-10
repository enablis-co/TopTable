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
