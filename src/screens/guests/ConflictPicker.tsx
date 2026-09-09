import { useState } from 'react'
import type { Guest } from '../../domain/types'
import { Button, Tag, TextField } from '../../ui'
import styles from './ConflictPicker.module.css'

type ConflictPickerProps = {
  label: string
  guests: Guest[]
  editingId: string | null
  value: string[]
  onChange: (next: string[]) => void
}

/**
 * TT-5, C8, C9. A searchable multi-picker over the existing guest list for `conflictsWith`.
 * Excludes the guest being edited — a guest can never conflict with themselves
 * (`src/domain/guests.ts` throws on it as a bug guard; this keeps the picker from ever
 * offering the option). Selecting and clearing both write through `onChange`; the reciprocal
 * write happens once, in `src/domain/guests.ts` on save, not here.
 *
 * Every control routes through the shared `Button` (quiet variant, resized via this file's
 * own CSS module) rather than a bare button element — `src/ui/brand.test.ts` forbids one
 * outside `src/ui/` or `src/shell/`.
 */
export function ConflictPicker({ label, guests, editingId, value, onChange }: ConflictPickerProps) {
  const [query, setQuery] = useState('')

  const candidates = guests.filter((guest) => guest.id !== editingId)
  const selected = candidates.filter((guest) => value.includes(guest.id))
  const needle = query.trim().toLowerCase()
  const results =
    needle === ''
      ? []
      : candidates.filter((guest) => !value.includes(guest.id) && guest.name.toLowerCase().includes(needle))

  function add(id: string) {
    onChange([...value, id])
    setQuery('')
  }

  function remove(id: string) {
    onChange(value.filter((candidate) => candidate !== id))
  }

  return (
    <div className={styles.picker}>
      {selected.length > 0 && (
        <ul className={styles.selected}>
          {selected.map((guest) => (
            <li key={guest.id} className={styles.selectedItem}>
              <Tag>{guest.name}</Tag>
              <Button
                variant="quiet"
                className={styles.remove}
                onClick={() => {
                  remove(guest.id)
                }}
              >
                <span aria-hidden="true">×</span>
                <span className="tt-visually-hidden">Remove {guest.name}</span>
              </Button>
            </li>
          ))}
        </ul>
      )}
      <TextField
        label={label}
        value={query}
        placeholder="Search guests"
        onChange={(e) => {
          setQuery(e.target.value)
        }}
      />
      {/* Always rendered, even with no results yet: a caller needs a stable reference to the
          listbox itself (by its accessible name) before anything has been typed, and scopes
          option lookups to it as results arrive — an empty <ul> is valid and unsurprising. */}
      <ul className={styles.results} role="listbox" aria-label={`${label} results`}>
        {results.map((guest) => (
          <li key={guest.id}>
            <Button
              variant="quiet"
              role="option"
              aria-selected={false}
              className={styles.result}
              onClick={() => {
                add(guest.id)
              }}
            >
              {guest.name}
            </Button>
          </li>
        ))}
      </ul>
    </div>
  )
}
