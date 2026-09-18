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
 * Positioned `fixed` by `hoverCardPosition`, clamped against the card's own measured height so
 * it is always fully on screen when it can be, and never covers the seat or row it describes —
 * the one criterion this file cannot prove on its own (jsdom does no layout,
 * `docs/engineering-standards.md`), so a browser pass measures it.
 *
 * The height is not known at first render, so it is measured in a `useLayoutEffect`: before
 * paint, so no wrong position is ever painted, and off `getBoundingClientRect` for the border
 * box, since the content box omits the padding and border.
 *
 * **The trap:** the measured height must never be allowed to depend on the position computed
 * from it, or this effect feeds itself. `top` alone cannot resize a `position: fixed` element,
 * so it holds today; a `max-height` derived from the position would break it. `hoverCardStyles.test.ts`
 * is what keeps that out.
 *
 * There is no `max-height`/`overflow-y` pairing here: the card opens on hover or focus and closes
 * the moment either leaves the anchor, so neither can ever reach the card to scroll it. A
 * scrollbar nothing can trigger is a false affordance, so a card too tall for the window keeps
 * its name and clips its tail instead.
 */
export function GuestHoverCard({ id, guest, fields, anchor }: GuestHoverCardProps) {
  const cardRef = useRef<HTMLDivElement>(null)
  const [cardHeight, setCardHeight] = useState(0)

  // Measures every commit on purpose. The rule's suggested `[]` would measure once and never
  // again, so a taller guest would be placed against the previous one's height. What bounds the
  // chain is that the height cannot depend on the position (see above); the equality guard below
  // only saves a render React would otherwise bail out of itself.
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
