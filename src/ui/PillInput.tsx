import { useId, useRef, useState } from 'react'
import type { KeyboardEvent } from 'react'
import { cx } from './cx'
import { Tag } from './Tag'
import fieldStyles from './field.module.css'
import styles from './PillInput.module.css'

export type PillInputProps = {
  label: string
  value: string[]
  onChange: (next: string[]) => void
  suggestions?: readonly string[]
  hint?: string
  placeholder?: string
}

/**
 * TT-5. Backs all four `string[]` fields on the guest form (A13): tags, allergies, dietary
 * preferences, accessibility. Autocomplete is driven entirely by `suggestions` — the caller
 * decides whether, and against what, a field offers any (A14: only tags autocomplete against
 * the guest list itself; the other three offer their `KNOWN_*` vocabularies) — so this
 * component stays general.
 *
 * Enter commits the typed text as a pill. Backspace on an empty text input removes the last
 * pill. Each pill carries its own remove control, named after its value ("Remove uni"), and
 * focus returns to the text input after any removal — mouse or keyboard — so a run of
 * corrections never leaves focus stranded on a control that just disappeared.
 */
export function PillInput({ label, value, onChange, suggestions, hint, placeholder }: PillInputProps) {
  const [text, setText] = useState('')
  const [suggestionIndex, setSuggestionIndex] = useState(-1)
  const inputRef = useRef<HTMLInputElement>(null)
  const fieldId = useId()
  const hintId = hint ? `${fieldId}-hint` : undefined

  const trimmed = text.trim()
  const visibleSuggestions =
    trimmed === ''
      ? []
      : (suggestions ?? []).filter(
          (candidate) => candidate.toLowerCase().includes(trimmed.toLowerCase()) && !value.includes(candidate),
        )

  function commit(pill: string) {
    const next = pill.trim()
    // Reviewer finding (TT-5/TT-6 review), merge blocker: `visibleSuggestions` already hides
    // anything already in `value`, but that only stops a *suggestion* from being re-offered —
    // it did nothing for free text. Typing a value that already exists as a pill and pressing
    // Enter must not append a second, identical entry (duplicate React key on the pill list,
    // and for `allergies` specifically, a safety-critical field the kitchen reads by name).
    if (next === '' || value.includes(next)) return
    onChange([...value, next])
    setText('')
    setSuggestionIndex(-1)
  }

  function removePill(pill: string) {
    onChange(value.filter((candidate) => candidate !== pill))
    inputRef.current?.focus()
  }

  function handleKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key === 'Enter') {
      event.preventDefault()
      const chosen = suggestionIndex >= 0 ? visibleSuggestions[suggestionIndex] : undefined
      commit(chosen ?? text)
      return
    }

    if (event.key === 'Backspace' && text === '' && value.length > 0) {
      const last = value[value.length - 1]
      if (last !== undefined) removePill(last)
      return
    }

    if (event.key === 'ArrowDown' && visibleSuggestions.length > 0) {
      event.preventDefault()
      setSuggestionIndex((current) => Math.min(current + 1, visibleSuggestions.length - 1))
      return
    }

    if (event.key === 'ArrowUp' && visibleSuggestions.length > 0) {
      event.preventDefault()
      setSuggestionIndex((current) => Math.max(current - 1, 0))
      return
    }

    if (event.key === 'Escape') {
      // Reviewer finding: SlideOver closes the whole panel on Escape (deliberately, so a
      // keyboard user can dismiss the form same as clicking ×). That must only happen once
      // there is nothing more local for Escape to do — while a suggestion list is open, this
      // keystroke's job is to dismiss *that*, and it must not also reach SlideOver's
      // document-level handler and discard the rest of the form.
      if (visibleSuggestions.length > 0) {
        event.stopPropagation()
      }
      setSuggestionIndex(-1)
    }
  }

  return (
    <div className={fieldStyles.wrapper}>
      <label htmlFor={fieldId} className={fieldStyles.label}>
        {label}
      </label>
      <div className={cx(fieldStyles.field, styles.control)}>
        {value.map((pill) => (
          <span key={pill} className={styles.pill}>
            <Tag>{pill}</Tag>
            <button
              type="button"
              className={styles.remove}
              onClick={() => {
                removePill(pill)
              }}
            >
              <span aria-hidden="true">×</span>
              <span className="tt-visually-hidden">Remove {pill}</span>
            </button>
          </span>
        ))}
        <input
          id={fieldId}
          ref={inputRef}
          className={styles.input}
          type="text"
          value={text}
          placeholder={value.length === 0 ? placeholder : undefined}
          aria-describedby={hintId}
          onChange={(e) => {
            setText(e.target.value)
            setSuggestionIndex(-1)
          }}
          onKeyDown={handleKeyDown}
        />
      </div>
      {visibleSuggestions.length > 0 && (
        <ul className={styles.suggestions} role="listbox" aria-label={`${label} suggestions`}>
          {visibleSuggestions.map((suggestion, index) => (
            <li key={suggestion}>
              <button
                type="button"
                role="option"
                aria-selected={index === suggestionIndex}
                className={cx(styles.suggestion, index === suggestionIndex && styles.suggestionActive)}
                onClick={() => {
                  commit(suggestion)
                  inputRef.current?.focus()
                }}
              >
                {suggestion}
              </button>
            </li>
          ))}
        </ul>
      )}
      {hint ? (
        <p id={hintId} className={fieldStyles.hint}>
          {hint}
        </p>
      ) : null}
    </div>
  )
}
