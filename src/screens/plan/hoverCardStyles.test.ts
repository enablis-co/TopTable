import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { hoverCardPosition } from './hoverCardPosition'

/**
 * TT-36. A scrollbar on the hover card is an affordance nothing can trigger: the card closes on
 * mouseleave before a pointer could reach it, and focus stays on the anchor rather than moving
 * into the card. So the card must never grow a `max-height` / scrolling `overflow` pairing — a
 * card too tall for the viewport clips its tail instead, keeping the guest's name.
 *
 * Only the scrolling values are banned. `overflow: hidden` and `text-overflow` produce no
 * scrollbar and are nobody's business here.
 *
 * Follows the CSS-as-text technique in src/screens/plan/railStyles.test.ts. Does not open
 * GuestHoverCard.tsx or hoverCardPosition.ts — only the stylesheet as text, plus the pure
 * position function through its public signature.
 */

const DIR = dirname(fileURLToPath(import.meta.url))
const CSS_PATH = join(DIR, 'GuestHoverCard.module.css')

function readCss(): string {
  return readFileSync(CSS_PATH, 'utf8')
}

function stripComments(css: string): string {
  return css.replace(/\/\*[\s\S]*?\*\//g, '')
}

describe('GuestHoverCard.module.css — no scrollbar affordance on the card', () => {
  it('declares no max-height anywhere in the file', () => {
    expect(stripComments(readCss())).not.toMatch(/max-height\s*:/i)
  })

  it('declares no scrolling overflow on any axis', () => {
    // Deliberately narrow: `auto` and `scroll` are the values that grow a scrollbar. `hidden`,
    // `clip` and `text-overflow` do not, and banning them would fail a future ellipsis on a long
    // allergy list for no reason this test has any interest in.
    expect(stripComments(readCss())).not.toMatch(/overflow(-[xy])?\s*:\s*(auto|scroll)/i)
  })
})

describe('hoverCardPosition — the inline style it produces sets neither max-height nor overflow', () => {
  it('a card that fits carries no maxHeight or overflow key', () => {
    const anchor = { x: 0, y: 0, width: 10, height: 10, top: 100, left: 100, right: 110, bottom: 110, toJSON: () => ({}) } as DOMRect
    const style = hoverCardPosition(anchor, 200, { width: 1024, height: 800 })

    expect(style).not.toHaveProperty('maxHeight')
    expect(style).not.toHaveProperty('overflow')
    expect(style).not.toHaveProperty('overflowY')
  })

  it('a card too tall to fit — the case that clamps rather than scrolls — still carries no maxHeight or overflow key', () => {
    const anchor = { x: 0, y: 0, width: 10, height: 10, top: 263.9, left: 500, right: 550, bottom: 269.7, toJSON: () => ({}) } as DOMRect
    const style = hoverCardPosition(anchor, 430.3, { width: 1024, height: 480 })

    expect(style).not.toHaveProperty('maxHeight')
    expect(style).not.toHaveProperty('overflow')
    expect(style).not.toHaveProperty('overflowY')
  })
})
