import { useState } from 'react'
import { useTopTableStore } from '../../store/store'
import { useNavigation } from '../../shell/navigation'
import { TextField } from '../../ui'
import { filterGuests } from './guestFilter'
import { GuestSummary } from './GuestSummary'
import { GuestTable } from './GuestTable'
import { GuestsEmpty } from './GuestsEmpty'
import styles from './GuestsScreen.module.css'

/**
 * TT-6, KB-6 "Guests". Owns the store read and the search string — GuestTable, GuestSummary
 * and GuestsEmpty are all presentational, matching SetupScreen's own ownership pattern. TT-5
 * (the next commit) extends this file with the panel's open/editing/highlight state and the
 * Add guest button; nothing here anticipates them yet, so Edit does not do anything until
 * then. Remove needs no panel and is wired to the store directly (A11: no confirm).
 */
export function GuestsScreen() {
  const guests = useTopTableStore((s) => s.guests)
  const removeGuest = useTopTableStore((s) => s.removeGuest)
  const { goTo } = useNavigation()

  const [query, setQuery] = useState('')

  const hasGuests = guests.length > 0
  const visibleGuests = filterGuests(guests, query)

  return (
    <div className={styles.screen}>
      <h1 className="tt-visually-hidden">Guests</h1>

      {hasGuests && (
        <div className={styles.header}>
          <div className={styles.search}>
            <TextField
              label="Search guests"
              labelHidden
              placeholder="Search name or tag"
              value={query}
              onChange={(e) => {
                setQuery(e.target.value)
              }}
            />
          </div>
        </div>
      )}

      {hasGuests ? (
        <>
          <GuestSummary guests={guests} />
          <GuestTable
            guests={visibleGuests}
            onEdit={() => {
              // TT-5 wires this to the edit panel.
            }}
            onRemove={removeGuest}
          />
        </>
      ) : (
        <GuestsEmpty
          onGoToSetup={() => {
            goTo('setup')
          }}
        />
      )}
    </div>
  )
}
