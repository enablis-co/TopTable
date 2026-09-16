import { useLayoutEffect, useRef, useState } from 'react'
import { Tag } from '../../ui'
import type { Guest } from '../../domain/types'
import type { SummaryField } from './guestSummary'
import { hoverCardPosition } from './hoverCardPosition'
import styles from './GuestHoverCard.module.css'

type GuestHoverCardProps = {
  id: string
  guest: Guest
  fields: SummaryField[]
  anchor: DOMRect | null
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
 *
 * Positioned `fixed` from `anchor` by `hoverCardPosition`, clamped against the card's own
 * measured height so the card is always fully on screen when it can be, and never covers the
 * seat or row it describes — the one criterion this file cannot prove on its own (jsdom does no
 * layout, `docs/engineering-standards.md`); this is the geometry a browser pass measures against.
 * The height isn't known at first render, so it's measured here in a `useLayoutEffect` — before
 * paint, so the wrong position is never painted — off `getBoundingClientRect`, the border box,
 * rather than the content box the padding and border would otherwise be missing from. The
 * measured height must never depend on the computed position, or the effect would loop against
 * itself; the equality guard before `setCardHeight` converges it in one extra render instead of
 * running forever.
 *
 * There is deliberately no `max-height`/`overflow-y` pairing here any more: this card only ever
 * opens on hover or focus and closes the moment the pointer or focus leaves its anchor, before
 * either could ever reach the card itself to scroll it — a scrollbar neither gesture can trigger
 * is a false affordance, not a safety net. Letting the card take whatever height its own content
 * needs is the honest version of "handle a guest with a lot to show".
 */
export function GuestHoverCard({ id, guest, fields, anchor }: GuestHoverCardProps) {
  const cardRef = useRef<HTMLDivElement>(null)
  const [cardHeight, setCardHeight] = useState(0)

  // Measures every commit on purpose. The rule's suggested `[]` would measure once and never
  // again, so a taller guest would be placed against the previous one's height — the defect this
  // fix exists to remove. The equality guard is what stops the chain the rule warns about.
  // eslint-disable-next-line react-hooks/exhaustive-deps -- deliberate; see above
  useLayoutEffect(() => {
    const measured = cardRef.current?.getBoundingClientRect().height ?? 0
    setCardHeight((previous) => (previous === measured ? previous : measured))
  })

  const style = hoverCardPosition(anchor, cardHeight, { width: window.innerWidth, height: window.innerHeight })

  return (
    <div id={id} role="group" aria-label={`Summary for ${guest.name}`} className={styles.card} style={style} ref={cardRef}>
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
