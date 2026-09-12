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
  /**
   * Follow-up to TT-5, human decision 2026-09-09 (not a ticket — see the comment above the two
   * fields on GuestPanel.tsx that set this). Turns the field into a picker over `suggestions`
   * rather than free typing: a bare Enter only ever commits an exact, case-insensitive match to
   * something already in `suggestions` or `value`. Anything else has to go through the
   * "something else" option that appears once the typed text matches neither — an explicit,
   * always-reachable way to record a value outside the vocabulary, not a wider one.
   *
   * A prop rather than new behaviour baked into the component, for the same reason
   * `suggestions` itself is a prop (A13): the caller decides, so every other field this
   * component backs — `tags`, `accessibility` — keeps free typing exactly as before.
   */
  restrictToSuggestions?: boolean
}

/** One entry in the open suggestion list: a real value from `suggestions` or `value`, or the
 *  synthetic "something else" entry `restrictToSuggestions` adds for unmatched typed text. */
type Option = {
  value: string
  alreadyAdded: boolean
  isSomethingElse: boolean
}

/** Matches the way a duplicate is judged everywhere in this component: same text, ignoring
 *  case, never mutating either side. Whatever is stored keeps the case it was written in. */
function sameValue(a: string, b: string): boolean {
  return a.trim().toLowerCase() === b.trim().toLowerCase()
}

/**
 * TT-5. Backs all four `string[]` fields on the guest form (A13): tags, allergies, dietary
 * preferences, accessibility. Autocomplete is driven entirely by `suggestions` — the caller
 * decides whether, and against what, a field offers any (A14: only tags autocomplete against
 * the guest list itself; the other three offer their `KNOWN_*` vocabularies) — so this
 * component stays general. `restrictToSuggestions` (see above) is the same shape of decision
 * applied to a stricter mode.
 *
 * Enter commits the typed text as a pill. Backspace on an empty text input removes the last
 * pill. Each pill carries its own remove control, named after its value ("Remove uni"), and
 * focus returns to the text input after any removal — mouse or keyboard — so a run of
 * corrections never leaves focus stranded on a control that just disappeared.
 *
 * Duplicate matching (both the plain free-typed case and the vocabulary check above) is
 * case-insensitive throughout — typing "Nuts" is refused the same as "nuts" once "nuts" is
 * already a pill — but nothing here lowercases a value on write. The same `commit` serves
 * `tags`, which KB-3 calls free text "by definition"; quietly flattening someone's "Uni" to
 * "uni" on their behalf is not this component's decision to make, so the check compares
 * case-insensitively without ever changing the case of what gets stored.
 *
 * A committed value that turns out to be a duplicate says so (`notice`) rather than the
 * keystroke doing nothing with no explanation — KB-5: errors say what happened, never sorry.
 * The suggestion list carries the same idea for anything already in `value`: shown, marked,
 * and refused if chosen, rather than silently missing from the list at the exact moment it
 * would have stopped the duplicate being typed as free text instead.
 */
export function PillInput({
  label,
  value,
  onChange,
  suggestions,
  hint,
  placeholder,
  restrictToSuggestions = false,
}: PillInputProps) {
  const [text, setText] = useState('')
  const [suggestionIndex, setSuggestionIndex] = useState(-1)
  const [notice, setNotice] = useState<string | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const fieldId = useId()
  const hintId = hint ? `${fieldId}-hint` : undefined
  const noticeId = `${fieldId}-notice`
  const describedBy =
    [notice ? noticeId : undefined, hintId].filter((id): id is string => id !== undefined).join(' ') ||
    undefined

  const trimmed = text.trim()

  // Every already-added value is a candidate too, not only `suggestions` — `tagsInUse` only
  // sees guests already saved, so a tag added to the guest currently being edited would
  // otherwise vanish from its own field's suggestions until saved elsewhere. Suggestions are
  // checked first, so a known value's own casing wins over whatever case a pill happens to be
  // stored in.
  const pool: string[] = []
  for (const candidate of [...(suggestions ?? []), ...value]) {
    if (!pool.some((existing) => sameValue(existing, candidate))) {
      pool.push(candidate)
    }
  }

  // `value` is whatever the caller holds, and a guest can carry the same entry twice — the panel
  // accepts duplicates and only drops them on save (guestDraft.ts copies the array verbatim). Two
  // identical pills would share a React key, which is unsupported, and `removePill` filters by
  // value so one click would remove both. Shown once, deduplicated the way `pool` and `commit`
  // already judge sameness. Guarded in PillInput.test.tsx.
  const pills: string[] = []
  for (const pill of value) {
    if (!pills.some((existing) => sameValue(existing, pill))) {
      pills.push(pill)
    }
  }

  const options: Option[] =
    trimmed === ''
      ? []
      : pool
          .filter((candidate) => candidate.toLowerCase().includes(trimmed.toLowerCase()))
          .map((candidate) => ({
            value: candidate,
            alreadyAdded: value.some((existing) => sameValue(existing, candidate)),
            isSomethingElse: false,
          }))

  // The explicit escape hatch `restrictToSuggestions` promises: only appears once there is
  // typed text that names nothing already in the pool, so it never displaces a real match,
  // and never offers to re-add something already there.
  if (restrictToSuggestions && trimmed !== '' && !pool.some((candidate) => sameValue(candidate, trimmed))) {
    options.push({ value: trimmed, alreadyAdded: false, isSomethingElse: true })
  }

  function commit(pill: string) {
    const next = pill.trim()
    if (next === '') return
    if (value.some((existing) => sameValue(existing, next))) {
      setNotice(`${next} is already added`)
      return
    }
    onChange([...value, next])
    setText('')
    setSuggestionIndex(-1)
    setNotice(null)
  }

  function removePill(pill: string) {
    onChange(value.filter((candidate) => candidate !== pill))
    inputRef.current?.focus()
  }

  function handleKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key === 'Enter') {
      event.preventDefault()
      if (suggestionIndex >= 0) {
        const chosen = options[suggestionIndex]
        if (chosen) commit(chosen.value)
        return
      }
      if (restrictToSuggestions) {
        // A bare Enter only ever commits a value that is already in the vocabulary (typed out
        // in full) — anything else has to be reached the same way any other option is, by
        // arrowing to it or clicking it, "something else" included.
        if (pool.some((candidate) => sameValue(candidate, trimmed))) {
          commit(text)
        }
        return
      }
      commit(text)
      return
    }

    if (event.key === 'Backspace' && text === '' && value.length > 0) {
      const last = value[value.length - 1]
      if (last !== undefined) removePill(last)
      return
    }

    if (event.key === 'ArrowDown' && options.length > 0) {
      event.preventDefault()
      setSuggestionIndex((current) => Math.min(current + 1, options.length - 1))
      return
    }

    if (event.key === 'ArrowUp' && options.length > 0) {
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
      if (options.length > 0) {
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
        {pills.map((pill) => (
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
          aria-describedby={describedBy}
          onChange={(e) => {
            setText(e.target.value)
            setSuggestionIndex(-1)
            setNotice(null)
          }}
          onKeyDown={handleKeyDown}
        />
      </div>
      {options.length > 0 && (
        <ul className={styles.suggestions} role="listbox" aria-label={`${label} suggestions`}>
          {options.map((option, index) => (
            <li key={option.isSomethingElse ? 'something-else' : option.value}>
              <button
                type="button"
                role="option"
                aria-selected={index === suggestionIndex}
                aria-disabled={option.alreadyAdded || undefined}
                className={cx(
                  styles.suggestion,
                  index === suggestionIndex && styles.suggestionActive,
                  option.alreadyAdded && styles.suggestionAdded,
                  option.isSomethingElse && styles.somethingElse,
                )}
                onClick={() => {
                  commit(option.value)
                  inputRef.current?.focus()
                }}
              >
                {option.isSomethingElse ? (
                  <>Add &quot;{option.value}&quot; as something else</>
                ) : (
                  <>
                    {option.value}
                    {option.alreadyAdded ? <span className={styles.addedNote}> · Already added</span> : null}
                  </>
                )}
              </button>
            </li>
          ))}
        </ul>
      )}
      {notice ? (
        <p id={noticeId} className={fieldStyles.hint} aria-live="polite">
          {notice}
        </p>
      ) : null}
      {hint ? (
        <p id={hintId} className={fieldStyles.hint}>
          {hint}
        </p>
      ) : null}
    </div>
  )
}
