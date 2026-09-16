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

/**
 * TT-36. Positioned `fixed` from `anchor`, flipping so the card never covers the seat or row it
 * describes — the one criterion this file cannot prove on its own (jsdom does no layout,
 * `docs/engineering-standards.md`); this is the geometry a browser pass measures against.
 *
 * The card is placed entirely beside `anchor` — to whichever side has more room — never above or
 * below it, so it can never overlap the anchor horizontally regardless of the card's own
 * rendered size (text wrapping, the guest's own field count). `maxWidth` is the room actually
 * measured on the chosen side, floored at zero and never at some preferred minimum: a floor
 * above the true measurement would let the card claim width the viewport doesn't have, rendering
 * part of it off-screen — the never-overlap property is worth keeping even at the cost of a
 * narrow card on a narrow viewport, never the other way round.
 *
 * Vertically it anchors from whichever edge of the viewport has more room, `top` or `bottom`,
 * rather than a fixed height. There is deliberately no `max-height`/`overflow-y` pairing here any
 * more: this card only ever opens on hover or focus and closes the moment the pointer or focus
 * leaves its anchor, before either could ever reach the card itself to scroll it — a scrollbar
 * neither gesture can trigger is a false affordance, not a safety net. Letting the card take
 * whatever height its own content needs is the honest version of "handle a guest with a lot to
 * show".
 */
function positionStyle(anchor: DOMRect | null): CSSProperties {
  if (!anchor) return { display: 'none' }

  const viewportWidth = window.innerWidth
  const viewportHeight = window.innerHeight

  const roomRight = viewportWidth - anchor.right - GAP - EDGE_MARGIN
  const roomLeft = anchor.left - GAP - EDGE_MARGIN
  const placeRight = roomRight >= roomLeft

  const horizontal: CSSProperties = placeRight
    ? { left: anchor.right + GAP, maxWidth: Math.max(roomRight, 0) }
    : { right: viewportWidth - anchor.left + GAP, maxWidth: Math.max(roomLeft, 0) }

  const roomBelow = viewportHeight - anchor.top - EDGE_MARGIN
  const roomAbove = anchor.bottom - EDGE_MARGIN
  const placeBelow = roomBelow >= roomAbove

  const vertical: CSSProperties = placeBelow
    ? { top: Math.max(EDGE_MARGIN, anchor.top) }
    : { bottom: Math.max(EDGE_MARGIN, viewportHeight - anchor.bottom) }

  return { position: 'fixed', ...horizontal, ...vertical }
}

/**
 * TT-36, KB-5/KB-6. The guest hover summary: side, role, household, partner, kept-apart-from,
 * allergies, accessibility, tags and social type, whichever of those `guest` actually has —
 * `fields` already carries them in that order and already excludes dietary preferences entirely
 * (`guestSummary.ts`). Deliberately not named `GuestSummary` — that name is
 * `src/screens/guests/GuestSummary.tsx`'s, a different screen's counts strip, and this repo has
 * already been bitten by a case-insensitive module collision between similarly named files.
 *
 * Tags render through the shared `Tag` — sunken on surface, never coloured, never interactive —
 * rather than a second, bespoke pill; every other field is a plain label/value pair. Allergies
 * and accessibility keep the word itself as the label, following `TableDetailPanel`'s
 * `NeedsBlock` precedent, so the distinction between a safety matter and a recorded need
 * survives `grayscale(1)` (KB-5) rather than resting on colour or position.
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
