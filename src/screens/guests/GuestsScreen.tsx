import { useEffect, useRef, useState } from 'react'
import { useTopTableStore } from '../../store/store'
import { useNavigation } from '../../shell/navigation'
import type { Guest } from '../../domain/types'
import { Button, TextField } from '../../ui'
import { filterGuests } from './guestFilter'
import { GuestSummary } from './GuestSummary'
import { GuestTable } from './GuestTable'
import { GuestsEmpty } from './GuestsEmpty'
import { GuestPanel } from './GuestPanel'
import styles from './GuestsScreen.module.css'

// R1: no source publishes a duration for "briefly" — one constant to change if that changes.
const HIGHLIGHT_DURATION_MS = 2000

/**
 * TT-6 and TT-5, KB-6 "Guests". Owns every store read and write for this screen — GuestTable,
 * GuestSummary, GuestsEmpty and GuestPanel are all presentational, matching SetupScreen's own
 * ownership pattern. Holds the search string (view state, A18) and the panel's
 * open/editing/highlight state (A16).
 *
 * The panel is mounted only while it is meant to be open (`panelOpen`), rather than always
 * mounted with an `open` flag: React then mounts a fresh `GuestPanel` — and so a fresh draft —
 * on every appearance, including a second "Add guest" straight after cancelling the first.
 */
export function GuestsScreen() {
  const guests = useTopTableStore((s) => s.guests)
  const addGuest = useTopTableStore((s) => s.addGuest)
  const updateGuest = useTopTableStore((s) => s.updateGuest)
  const removeGuest = useTopTableStore((s) => s.removeGuest)
  const { goTo } = useNavigation()

  const [query, setQuery] = useState('')
  const [panelOpen, setPanelOpen] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [highlightId, setHighlightId] = useState<string | null>(null)
  const highlightTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    return () => {
      if (highlightTimeoutRef.current !== null) {
        clearTimeout(highlightTimeoutRef.current)
      }
    }
  }, [])

  const hasGuests = guests.length > 0
  const visibleGuests = filterGuests(guests, query)
  const editingGuest = editingId ? (guests.find((guest) => guest.id === editingId) ?? null) : null

  function openAddGuest() {
    setEditingId(null)
    setPanelOpen(true)
  }

  function openEditGuest(id: string) {
    setEditingId(id)
    setPanelOpen(true)
  }

  function closePanel() {
    setPanelOpen(false)
    setEditingId(null)
  }

  function handleSaveGuest(guest: Guest) {
    const isNewGuest = !guests.some((candidate) => candidate.id === guest.id)
    if (isNewGuest) {
      addGuest(guest)
    } else {
      updateGuest(guest)
    }

    setPanelOpen(false)
    setEditingId(null)
    setHighlightId(guest.id)

    if (highlightTimeoutRef.current !== null) {
      clearTimeout(highlightTimeoutRef.current)
    }
    highlightTimeoutRef.current = setTimeout(() => {
      setHighlightId(null)
      highlightTimeoutRef.current = null
    }, HIGHLIGHT_DURATION_MS)
  }

  return (
    <div className={styles.screen}>
      <h1 className="tt-visually-hidden">Guests</h1>

      <div className={styles.header}>
        {hasGuests && (
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
        )}
        <Button variant="secondary" className={styles.addButton} onClick={openAddGuest}>
          Add guest
        </Button>
      </div>

      {hasGuests ? (
        <>
          <GuestSummary guests={guests} />
          <GuestTable
            guests={visibleGuests}
            highlightId={highlightId}
            onEdit={openEditGuest}
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

      {panelOpen && (
        <GuestPanel open guests={guests} guest={editingGuest} onClose={closePanel} onSave={handleSaveGuest} />
      )}
    </div>
  )
}
