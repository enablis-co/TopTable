import { describe, expect, it } from 'vitest'
import { hoverCardPosition, HOVER_CARD_EDGE_MARGIN, HOVER_CARD_GAP } from './hoverCardPosition'
import type { Viewport } from './hoverCardPosition'

/**
 * TT-36 defect addendum — the hover card clips off the top. Written from the addendum's
 * acceptance criteria (D1-D6, D10) and the repro table in .claude/plans/TT-36.md, without
 * opening hoverCardPosition.ts. D7 (first-paint position) and the browser-only parts of D1/D2/D5
 * are a browser pass, not a unit test (docs/engineering-standards.md — jsdom does no layout).
 * D9 belongs to GuestHoverCard.test.tsx; D8 belongs to hoverCardStyles.test.ts.
 */

function makeAnchor(overrides: Partial<DOMRect>): DOMRect {
  return {
    x: 0,
    y: 0,
    width: 0,
    height: 0,
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    toJSON: () => ({}),
    ...overrides,
  }
}

describe('hoverCardPosition — a card that fits is pulled fully onto the screen (D1, D2)', () => {
  it('a tall card anchored low on a short window gets a positive, on-screen top — shaped like the real repro (floorplan chair)', () => {
    // .claude/plans/TT-36.md repro row 1: viewport 1024x480, anchor.top 263.9 / anchor.bottom
    // 269.7, cardHeight 430.3. The old code picked the "bottom" branch here (roomBelow 210.3 <
    // roomAbove 263.9 is false, so placeBelow is false) and produced top -160.5.
    const anchor = makeAnchor({ top: 263.9, bottom: 269.7, left: 500, right: 550 })
    const viewport: Viewport = { width: 1024, height: 480 }
    const cardHeight = 430.3

    const style = hoverCardPosition(anchor, cardHeight, viewport)

    // toBeCloseTo, not toBe: 480 - 16 - 430.3 is not exactly representable in IEEE-754, so the
    // arithmetic itself (not the fix) lands a few ulps off 33.7. The precision here (5 decimal
    // places) is far tighter than anything that would mask a real clamping bug.
    expect(style.top as number).toBeCloseTo(33.7, 5)
    expect(style.top).not.toBe(-160.5)
    expect(style.top as number).toBeGreaterThanOrEqual(HOVER_CARD_EDGE_MARGIN)
    expect((style.top as number) + cardHeight).toBeLessThanOrEqual(viewport.height - HOVER_CARD_EDGE_MARGIN)
  })

  it('the same clamp fires for an unseated-rail anchor further down the same short window', () => {
    // Repro row 3: same viewport and cardHeight as above, but the anchor is a rail row near the
    // bottom of the window (anchor.bottom 394.1) rather than a floorplan chair.
    const anchor = makeAnchor({ top: 384.1, bottom: 394.1, left: 20, right: 300 })
    const viewport: Viewport = { width: 1024, height: 480 }
    const cardHeight = 430.3

    const style = hoverCardPosition(anchor, cardHeight, viewport)

    expect(style.top as number).toBeCloseTo(33.7, 5)
  })

  it('a shorter card that still does not fit above the anchor is also pulled fully on screen', () => {
    const anchor = makeAnchor({ top: 300, bottom: 320, left: 100, right: 150 })
    const viewport: Viewport = { width: 1024, height: 480 }
    const cardHeight = 337.9

    const style = hoverCardPosition(anchor, cardHeight, viewport)

    expect(style.top as number).toBeCloseTo(126.1, 5)
    expect((style.top as number) + cardHeight).toBeLessThanOrEqual(viewport.height - HOVER_CARD_EDGE_MARGIN)
  })

  it.each([
    { anchorTop: 10, cardHeight: 50, height: 600 },
    { anchorTop: 590, cardHeight: 50, height: 600 },
    { anchorTop: 100, cardHeight: 200, height: 800 },
    { anchorTop: 0, cardHeight: 1, height: 100 },
  ])('never returns a top below the edge margin, for anchor.top=$anchorTop, cardHeight=$cardHeight, viewport.height=$height', ({ anchorTop, cardHeight, height }) => {
    const anchor = makeAnchor({ top: anchorTop, bottom: anchorTop + 10, left: 10, right: 60 })
    const viewport: Viewport = { width: 1024, height }

    const style = hoverCardPosition(anchor, cardHeight, viewport)

    expect(style.top as number).toBeGreaterThanOrEqual(HOVER_CARD_EDGE_MARGIN)
  })
})

describe('hoverCardPosition — a card too tall for the window clips its tail, never its name (D3)', () => {
  it('returns top === 16 exactly when cardHeight > viewport.height - 32, regardless of where the anchor sits', () => {
    // >= 16 would also be satisfied by a card shoved off the bottom, which is the bug this fix
    // removes. The exact value is the point: the name stays visible, only the tail clips.
    const viewport: Viewport = { width: 1024, height: 480 }
    const cardHeight = 450 // > 480 - 32 = 448

    const anchoredNearTop = hoverCardPosition(makeAnchor({ top: 20, bottom: 40 }), cardHeight, viewport)
    const anchoredNearBottom = hoverCardPosition(makeAnchor({ top: 460, bottom: 470 }), cardHeight, viewport)

    expect(anchoredNearTop.top).toBe(16)
    expect(anchoredNearBottom.top).toBe(16)
  })

  it('the exact-9-field case from the addendum: a card past the fit threshold still clamps to 16, not a value pushed toward the bottom', () => {
    const viewport: Viewport = { width: 1024, height: 480 }
    const cardHeight = 448.1 // just over the 448 threshold

    const style = hoverCardPosition(makeAnchor({ top: 100, bottom: 120 }), cardHeight, viewport)

    expect(style.top).toBe(16)
  })
})

describe('hoverCardPosition — a card that already fits is not moved unnecessarily (D4)', () => {
  it('when the anchor sits high enough that the card fits without clamping, top === anchor.top', () => {
    const anchor = makeAnchor({ top: 100, bottom: 120, left: 10, right: 60 })
    const viewport: Viewport = { width: 1024, height: 800 }
    const cardHeight = 200 // anchor.top (100) <= viewport.height - 16 - cardHeight (584)

    const style = hoverCardPosition(anchor, cardHeight, viewport)

    expect(style.top).toBe(anchor.top)
  })

  it('does not move the card down when it is already flush with the edge margin', () => {
    const anchor = makeAnchor({ top: HOVER_CARD_EDGE_MARGIN, bottom: HOVER_CARD_EDGE_MARGIN + 20, left: 10, right: 60 })
    const viewport: Viewport = { width: 1024, height: 800 }
    const cardHeight = 100

    const style = hoverCardPosition(anchor, cardHeight, viewport)

    expect(style.top).toBe(HOVER_CARD_EDGE_MARGIN)
  })
})

describe('hoverCardPosition — the card never overlaps the anchor it describes, on either side (D5)', () => {
  it('with room only on the right, the card sits to the right and sets left, never right', () => {
    // Anchor flush against the left edge: there is no room to place the card on the left.
    const anchor = makeAnchor({ top: 100, bottom: 120, left: 0, right: 50 })
    const viewport: Viewport = { width: 1024, height: 800 }

    const style = hoverCardPosition(anchor, 100, viewport)

    expect(style.left).toBeDefined()
    expect(style.right).toBeUndefined()
    expect(style.left as number).toBeGreaterThanOrEqual(anchor.right + HOVER_CARD_GAP)
  })

  it('with room only on the left, the card sits to the left and sets right, never left', () => {
    // Anchor flush against the right edge: there is no room to place the card on the right.
    const viewport: Viewport = { width: 1024, height: 800 }
    const anchor = makeAnchor({ top: 100, bottom: 120, left: 974, right: viewport.width })

    const style = hoverCardPosition(anchor, 100, viewport)

    expect(style.right).toBeDefined()
    expect(style.left).toBeUndefined()
    expect(style.right as number).toBeGreaterThanOrEqual(viewport.width - anchor.left + HOVER_CARD_GAP)
  })
})

describe('hoverCardPosition — the horizontal budget is never negative (D6)', () => {
  // Both sides are cramped below HOVER_CARD_GAP here — an anchor nearly as wide as a narrow
  // window — so whichever side wins the room comparison still has less space than the gap
  // alone requires. That is the case the Math.max(..., 0) clamp exists for; an anchor flush
  // against one edge with plenty of room on the other never reaches the negative branch at all.
  it('clamps to zero rather than going negative when the room on the right (the chosen side) is smaller than the gap', () => {
    const viewport: Viewport = { width: 200, height: 800 }
    // roomLeft = 3, roomRight = 200 - 196 = 4: the right has (barely) more room, so the card
    // places right — but 4 - HOVER_CARD_GAP (8) is negative before clamping.
    const anchor = makeAnchor({ top: 100, bottom: 120, left: 3, right: 196 })

    const style = hoverCardPosition(anchor, 100, viewport)

    expect(style.left).toBeDefined()
    expect(style.maxWidth as number).toBeGreaterThanOrEqual(0)
  })

  it('clamps to zero rather than going negative when the room on the left (the chosen side) is smaller than the gap', () => {
    const viewport: Viewport = { width: 200, height: 800 }
    // roomLeft = 4, roomRight = 200 - 197 = 3: the left has (barely) more room, so the card
    // places left — but 4 - HOVER_CARD_GAP (8) is negative before clamping.
    const anchor = makeAnchor({ top: 100, bottom: 120, left: 4, right: 197 })

    const style = hoverCardPosition(anchor, 100, viewport)

    expect(style.right).toBeDefined()
    expect(style.maxWidth as number).toBeGreaterThanOrEqual(0)
  })
})

describe('hoverCardPosition — a missing anchor renders hidden, not at a computed position (D10)', () => {
  it('returns display: none and no top when anchor is null', () => {
    const viewport: Viewport = { width: 1024, height: 800 }

    const style = hoverCardPosition(null, 200, viewport)

    expect(style.display).toBe('none')
    expect(style.top).toBeUndefined()
  })

  it('ignores cardHeight entirely when there is no anchor to position against', () => {
    const viewport: Viewport = { width: 1024, height: 800 }

    const zeroHeight = hoverCardPosition(null, 0, viewport)
    const tallCard = hoverCardPosition(null, 5000, viewport)

    expect(zeroHeight).toEqual(tallCard)
  })
})
