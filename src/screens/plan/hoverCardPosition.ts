import type { CSSProperties } from 'react'

export const HOVER_CARD_GAP = 8
export const HOVER_CARD_EDGE_MARGIN = 16

export type Viewport = { width: number; height: number }

/**
 * TT-36, TT-36 defect fix. The card's placement, entirely: horizontal side-of-anchor and the
 * vertical clamp, both pure and both taking the viewport as an argument rather than reading
 * `window` — that is `GuestHoverCard`'s job, so this file stays testable without a DOM.
 *
 * Horizontal: the card sits entirely to whichever side of `anchor` has more room, never above or
 * below it, so it can never overlap the anchor regardless of the card's own rendered size.
 * `maxWidth` is the room actually measured on the chosen side, floored at zero and never at some
 * preferred minimum — a floor above the true measurement would let the card claim width the
 * viewport doesn't have, which breaks the never-overlap guarantee this exists to keep.
 *
 * Vertical: a single clamped `top`, preferring the anchor's own top so the card doesn't move when
 * it doesn't have to. The outer `Math.max` is deliberate: it is what makes a card too tall for the
 * viewport degrade to sitting flush with the top edge — its leading fields visible, only the tail
 * clipped — rather than the inner `Math.min` alone, which would push `top` negative and clip the
 * name instead.
 */
export function hoverCardPosition(anchor: DOMRect | null, cardHeight: number, viewport: Viewport): CSSProperties {
  if (!anchor) return { display: 'none' }

  const roomRight = viewport.width - anchor.right - HOVER_CARD_GAP - HOVER_CARD_EDGE_MARGIN
  const roomLeft = anchor.left - HOVER_CARD_GAP - HOVER_CARD_EDGE_MARGIN
  const placeRight = roomRight >= roomLeft

  const horizontal: CSSProperties = placeRight
    ? { left: anchor.right + HOVER_CARD_GAP, maxWidth: Math.max(roomRight, 0) }
    : { right: viewport.width - anchor.left + HOVER_CARD_GAP, maxWidth: Math.max(roomLeft, 0) }

  const top = Math.max(
    HOVER_CARD_EDGE_MARGIN,
    Math.min(anchor.top, viewport.height - HOVER_CARD_EDGE_MARGIN - cardHeight),
  )

  return { position: 'fixed', ...horizontal, top }
}
