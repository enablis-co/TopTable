import type { RoomSuggestion } from '../../domain/capacity'
import { tabularClass } from '../../ui'
import styles from './SuggestionLine.module.css'

export type SuggestionLineProps = {
  suggestion: RoomSuggestion | null
  guestCount: number
}

// Local to this file on purpose: a shared text primitive added here would be inherited by
// every later screen. TT-5 or TT-6 can promote it once they have their own criteria for it.
function pluralWord(count: number, singular: string): string {
  return count === 1 ? singular : `${singular}s`
}

/**
 * Static text, not a control: a `<p>`, no button, no link. KB-6 brackets every field and
 * button on this screen and does not bracket this — applying the suggestion would detach
 * the room from its scenario, which is TT-4's behaviour, not this ticket's.
 *
 * Returns `null` when there is no suggestion, so `SetupScreen` can render this unconditionally
 * and one place decides whether the sentence exists at all.
 */
export function SuggestionLine({ suggestion, guestCount }: SuggestionLineProps) {
  if (!suggestion) return null

  const { roundTables, totalSeats, direction } = suggestion
  const verb = direction === 'fewer' ? 'Drop to' : 'Go up to'

  return (
    <p className={styles.line}>
      {verb} <span className={tabularClass}>{roundTables}</span> {pluralWord(roundTables, 'table')}: <span className={tabularClass}>{totalSeats}</span> {pluralWord(totalSeats, 'seat')} for <span className={tabularClass}>{guestCount}</span> {pluralWord(guestCount, 'guest')}. Exactly enough.
    </p>
  )
}
