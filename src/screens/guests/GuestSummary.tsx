import type { Guest } from '../../domain/types'
import { hasNeeds } from '../../domain/guests'
import { tabularClass } from '../../ui'
import styles from './GuestSummary.module.css'

type GuestSummaryProps = {
  guests: Guest[]
}

function Num({ value }: { value: number }) {
  return <span className={tabularClass}>{value}</span>
}

/**
 * TT-6, C24-C27; KB-6 "70 guests · 34 bride · 33 groom · 3 both · 9 with needs". Always
 * describes the whole list (A8, C26) — `GuestsScreen` passes the unfiltered `guests` here,
 * never the search result. The needs count uses `hasNeeds` from `src/domain/guests.ts`, the
 * same predicate `GuestTable`'s Needs column uses, so the two figures can never disagree
 * (C27). KB-6's own numbers are illustrative, not asserted here (A7) — these are computed
 * live from whatever list is passed in.
 */
export function GuestSummary({ guests }: GuestSummaryProps) {
  const total = guests.length
  const brideCount = guests.filter((guest) => guest.side === 'bride').length
  const groomCount = guests.filter((guest) => guest.side === 'groom').length
  const bothCount = guests.filter((guest) => guest.side === 'both').length
  const needsCount = guests.filter(hasNeeds).length
  const guestWord = total === 1 ? 'guest' : 'guests'

  return (
    <p className={styles.summary}>
      <Num value={total} /> {guestWord} · <Num value={brideCount} /> bride · <Num value={groomCount} /> groom ·{' '}
      <Num value={bothCount} /> both · <Num value={needsCount} /> with needs
    </p>
  )
}
