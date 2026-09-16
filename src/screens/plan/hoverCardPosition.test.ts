import { describe, expect, it } from 'vitest'
import { hoverCardPosition, HOVER_CARD_EDGE_MARGIN, HOVER_CARD_GAP } from './hoverCardPosition'
import type { Viewport } from './hoverCardPosition'

/**
 * TT-36. The hover card's placement arithmetic, pinned where it can actually be pinned: this
 * function takes the viewport as an argument, so it needs no DOM and no layout.
 *
 * What is NOT here: that the rendered card paints at the position computed here, and that it
 * paints there on the first frame. jsdom does no layout, so those are a browser pass
 * (docs/engineering-standards.md). The stylesheet's half is hoverCardStyles.test.ts.
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

describe('hoverCardPosition — a card that fits is pulled fully onto the screen', () => {
  it('a tall card anchored low on a short window gets a positive, on-screen top — shaped like the real repro (floorplan chair)', () => {
    // A chair low in a short window, with a card taller than the room above it. The old code
    // anchored such a card to the viewport's bottom edge and let its top run off the screen,
    // taking the guest's name with it.
    const anchor = makeAnchor({ top: 263.9, bottom: 269.7, left: 500, right: 550 })
    const viewport: Viewport = { width: 1024, height: 480 }
    const cardHeight = 430.3

    const style = hoverCardPosition(anchor, cardHeight, viewport)

    // toBeCloseTo, not toBe: the subtraction is not exactly representable in IEEE-754, so the
    // test's own literals land a few ulps apart. Nothing about the fix is approximate.
    expect(style.top as number).toBeCloseTo(33.7, 5)
    expect(style.top as number).toBeGreaterThanOrEqual(HOVER_CARD_EDGE_MARGIN)
    expect((style.top as number) + cardHeight).toBeLessThanOrEqual(viewport.height - HOVER_CARD_EDGE_MARGIN)
  })

  it('the same clamp fires for an unseated-rail anchor further down the same short window', () => {
    // The same clamp, reached from the other anchor kind: an unseated rail row rather than a
    // floorplan chair.
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

describe('hoverCardPosition — a card too tall for the window clips its tail, never its name', () => {
  it('returns top === 16 exactly when cardHeight > viewport.height - 32, regardless of where the anchor sits', () => {
    // The exact value is the point. A `>=` assertion would also pass for a card shoved off the
    // bottom instead — the same defect at the other end, losing the tail's facts rather than
    // the name.
    const viewport: Viewport = { width: 1024, height: 480 }
    const cardHeight = 450 // taller than the window leaves room for

    const anchoredNearTop = hoverCardPosition(makeAnchor({ top: 20, bottom: 40 }), cardHeight, viewport)
    const anchoredNearBottom = hoverCardPosition(makeAnchor({ top: 460, bottom: 470 }), cardHeight, viewport)

    expect(anchoredNearTop.top).toBe(16)
    expect(anchoredNearBottom.top).toBe(16)
  })

  it('a card only just past the fit threshold still clamps to the top margin, not toward the bottom', () => {
    const viewport: Viewport = { width: 1024, height: 480 }
    const cardHeight = 448.1 // a hair over what fits

    const style = hoverCardPosition(makeAnchor({ top: 100, bottom: 120 }), cardHeight, viewport)

    expect(style.top).toBe(16)
  })
})

describe('hoverCardPosition — a card that already fits is not moved unnecessarily', () => {
  it('when the anchor sits high enough that the card fits without clamping, top === anchor.top', () => {
    const anchor = makeAnchor({ top: 100, bottom: 120, left: 10, right: 60 })
    const viewport: Viewport = { width: 1024, height: 800 }
    const cardHeight = 200 // comfortably fits below the anchor

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

describe('hoverCardPosition — the card never overlaps the anchor it describes, on either side', () => {
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

describe('hoverCardPosition — the horizontal budget is never negative', () => {
  // Both sides are cramped below HOVER_CARD_GAP here — an anchor nearly as wide as a narrow
  // window — so whichever side wins the room comparison still has less space than the gap alone
  // requires. That is the case the Math.max(..., 0) clamp exists for; an anchor flush against
  // one edge with plenty of room on the other never reaches the negative branch at all.
  //
  // The trap: these inputs return maxWidth 0, and a zero-width card cannot honour the
  // never-overlap guarantee — its text would spill out of the box and across the anchor. So
  // these assert the arithmetic does not go negative, and nothing more. They are NOT a claim
  // that the card renders acceptably at this size.
  //
  // No anchor in the app can reach it: the nav rail holds every chair and rail row at least
  // ~200px clear of the left edge, so the roomier side is never below the gap. A layout change
  // that lets an anchor span nearly the full width would make it reachable, and then the card
  // needs a minimum width rather than a wider clamp here.
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

describe('hoverCardPosition — a missing anchor renders hidden, not at a computed position', () => {
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
