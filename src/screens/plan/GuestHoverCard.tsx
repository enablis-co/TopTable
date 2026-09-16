import type { CSSProperties } from 'react'
import { Tag } from '../../ui'
import type { Guest } from '../../domain/types'
import type { SummaryField } from './guestSummary'
import styles from './GuestHoverCard.module.css'

type GuestHoverCardProps = {
  id: string
  guest: Guest
  fields: SummaryField[]
  anchor: DOMRect | null
}

const GAP = 8
const EDGE_MARGIN = 16
const MIN_CARD_WIDTH = 220

/**
 * TT-36 (C20). Positioned `fixed` from `anchor`, flipping so the card never covers the seat or
 * row it describes — the one criterion this file cannot prove on its own (jsdom does no layout,
 * `docs/engineering-standards.md`); this is the geometry a browser pass measures against.
 *
 * The card is placed entirely beside `anchor` — to its right, or to its left when the right side
 * hasn't got `MIN_CARD_WIDTH` to spare — never above or below it, so it can never overlap the
 * anchor horizontally regardless of the card's own rendered size (text wrapping, the guest's own
 * field count). Vertically it anchors from whichever edge of the viewport has more room, `top` or
 * `bottom`, rather than a fixed height — a card taller than the room it's given scrolls internally
 * via `max-height`/`overflow-y` in `GuestHoverCard.module.css` instead of spilling off-screen.
 */
function positionStyle(anchor: DOMRect | null): CSSProperties {
  if (!anchor) return { display: 'none' }

  const viewportWidth = window.innerWidth
  const viewportHeight = window.innerHeight

  const roomRight = viewportWidth - anchor.right - GAP - EDGE_MARGIN
  const roomLeft = anchor.left - GAP - EDGE_MARGIN
  const placeRight = roomRight >= MIN_CARD_WIDTH || roomRight >= roomLeft

  const horizontal: CSSProperties = placeRight
    ? { left: anchor.right + GAP, maxWidth: Math.max(roomRight, MIN_CARD_WIDTH) }
    : { right: viewportWidth - anchor.left + GAP, maxWidth: Math.max(roomLeft, MIN_CARD_WIDTH) }

  const roomBelow = viewportHeight - anchor.top - EDGE_MARGIN
  const roomAbove = anchor.bottom - EDGE_MARGIN
  const placeBelow = roomBelow >= roomAbove

  const vertical: CSSProperties = placeBelow
    ? { top: Math.max(EDGE_MARGIN, anchor.top), maxHeight: roomBelow }
    : { bottom: Math.max(EDGE_MARGIN, viewportHeight - anchor.bottom), maxHeight: roomAbove }

  return { position: 'fixed', ...horizontal, ...vertical }
}

/**
 * TT-36, KB-5/KB-6. The guest hover summary: side, role, household, partner, kept-apart-from,
 * allergies, accessibility, tags and social type, whichever of those `guest` actually has (C3,
 * C6) — `fields` already carries them in that order and already excludes dietary preferences
 * entirely (C4; `guestSummary.ts`). Deliberately not named `GuestSummary` (A1) — that name is
 * `src/screens/guests/GuestSummary.tsx`'s, a different screen's counts strip, and this repo has
 * already been bitten by a case-insensitive module collision between similarly named files.
 *
 * Tags render through the shared `Tag` (A5) — sunken on surface, never coloured, never
 * interactive — rather than a second, bespoke pill; every other field is a plain label/value
 * pair. Allergies and accessibility keep the word itself as the label, following
 * `TableDetailPanel`'s `NeedsBlock` precedent, so the distinction between a safety matter and a
 * recorded need survives `grayscale(1)` (C18, KB-5) rather than resting on colour or position.
 *
 * Canvas zone: `--surface` against `--rule`, no shadow — depth is the border and the colour step
 * against `--paper`, never a drop shadow (KB-5).
 */
export function GuestHoverCard({ id, guest, fields, anchor }: GuestHoverCardProps) {
  return (
    <div id={id} role="group" aria-label={`Summary for ${guest.name}`} className={styles.card} style={positionStyle(anchor)}>
      <p className={styles.name}>{guest.name}</p>
      <dl className={styles.fields}>
        {fields.map((field) =>
          field.label === 'Tags' ? (
            <div key={field.label} className={styles.row}>
              <dt className={styles.label}>Tags</dt>
              <dd className={styles.value}>
                {guest.tags.map((tag) => (
                  <Tag key={tag}>{tag}</Tag>
                ))}
              </dd>
            </div>
          ) : (
            <div key={field.label} className={styles.row}>
              <dt className={styles.label}>{field.label}</dt>
              <dd className={styles.value}>{field.value}</dd>
            </div>
          ),
        )}
      </dl>
    </div>
  )
}
