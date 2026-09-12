import { useEffect, useId, useRef, useState } from 'react'
import type { KeyboardEvent } from 'react'
import { cx } from './cx'
import fieldStyles from './field.module.css'
import styles from './Combobox.module.css'

export type ComboboxOption = { value: string; kind: string }

export type ComboboxProps = {
  label: string
  /** Keeps the accessible name while removing the visible label — TextField's own convention. */
  labelHidden?: boolean
  placeholder?: string
  value: string
  onChange: (value: string) => void
  suggestions: readonly ComboboxOption[]
  hint?: string
}

const MAX_SUGGESTIONS = 8

/**
 * TT-38. A single-value editable combobox (ARIA 1.2, list autocomplete): focus never leaves
 * the input and the active option is virtual, tracked only by `aria-activedescendant` — built
 * new rather than widening `PillInput`, whose options are pills that take real focus. Filters
 * `suggestions` itself, case-insensitively on `value` trimmed, and caps the popup at
 * `MAX_SUGGESTIONS` — at celebrity scale (200 guests) an uncapped list renders every name
 * containing the letter typed so far.
 *
 * Each option is `<li role="option">`, never a `<button>` — a focusable option would fight the
 * input for the focus this pattern deliberately keeps put. Its accessible name joins the value
 * and the kind ("Danny Whitaker name"): the middot between them is a real `aria-hidden` element,
 * not CSS generated content, matching `PlanTable.tsx`'s own reasoning for the same choice —
 * `::after` text participates in Chrome's name computation but not jsdom's, so the two would
 * disagree silently.
 */
export function Combobox({ label, labelHidden = false, placeholder, value, onChange, suggestions, hint }: ComboboxProps) {
  const [open, setOpen] = useState(false)
  const [active, setActive] = useState(-1)
  const listRef = useRef<HTMLUListElement>(null)
  const fieldId = useId()
  const listboxId = `${fieldId}-listbox`
  const hintId = hint ? `${fieldId}-hint` : undefined

  const trimmed = value.trim().toLowerCase()
  const filtered =
    trimmed === ''
      ? []
      : suggestions.filter((option) => option.value.toLowerCase().includes(trimmed)).slice(0, MAX_SUGGESTIONS)

  const expanded = open && filtered.length > 0

  // `active` is state while `filtered` is derived from props, so a pool that narrows underneath
  // a held index would leave aria-activedescendant naming an option that no longer exists.
  // Every read goes through this, so the two can never disagree within one render.
  const activeIndex = active < filtered.length ? active : -1

  function optionId(index: number): string {
    return `${listboxId}-option-${index}`
  }

  useEffect(() => {
    if (activeIndex < 0) return
    const node = listRef.current?.children[activeIndex]
    if (node instanceof HTMLElement) {
      node.scrollIntoView?.({ block: 'nearest' })
    }
  }, [activeIndex])

  function close() {
    setOpen(false)
    setActive(-1)
  }

  function commit(index: number) {
    const option = filtered[index]
    if (!option) return
    onChange(option.value)
    close()
  }

  function handleKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key === 'ArrowDown') {
      event.preventDefault()
      if (!expanded) {
        setOpen(true)
        setActive(filtered.length > 0 ? 0 : -1)
        return
      }
      setActive(Math.min(activeIndex + 1, filtered.length - 1))
      return
    }

    if (event.key === 'ArrowUp') {
      if (!expanded) return
      event.preventDefault()
      // Steps back one, the way PillInput's own option list does. -1 is the typed text, so it
      // is only reachable from the first option rather than from anywhere in the list.
      setActive(activeIndex <= 0 ? -1 : activeIndex - 1)
      return
    }

    if (event.key === 'Home') {
      if (!expanded) return
      event.preventDefault()
      setActive(0)
      return
    }

    if (event.key === 'End') {
      if (!expanded) return
      event.preventDefault()
      setActive(filtered.length - 1)
      return
    }

    if (event.key === 'Enter') {
      if (activeIndex >= 0) {
        event.preventDefault()
        commit(activeIndex)
      }
      return
    }

    if (event.key === 'Escape') {
      // Dismisses the list and nothing else. Stopping propagation is load-bearing rather than
      // defensive: PlanScreen registers a document-level keydown that clears the rail's guest
      // selection on Escape, so without this, dismissing the popup would also throw away the
      // guest the person had just chosen. Guarded in Combobox.test.tsx.
      //
      // With the list closed the key is left alone, so it reaches that handler — clearing the
      // field as well would make one keystroke do two unrelated things.
      if (expanded) {
        event.stopPropagation()
        close()
      }
    }
  }

  return (
    <div className={cx(fieldStyles.wrapper, styles.wrapper)}>
      <label htmlFor={fieldId} className={cx(fieldStyles.label, labelHidden && 'tt-visually-hidden')}>
        {label}
      </label>
      <input
        id={fieldId}
        type="text"
        role="combobox"
        className={fieldStyles.field}
        value={value}
        placeholder={placeholder}
        aria-haspopup="listbox"
        aria-expanded={expanded}
        aria-controls={expanded ? listboxId : undefined}
        aria-autocomplete="list"
        // undefined, never '' — an empty string is still a real attribute value and would
        // assert an active option that does not exist. Combobox.test.tsx asserts it is absent.
        aria-activedescendant={activeIndex >= 0 ? optionId(activeIndex) : undefined}
        aria-describedby={hintId}
        onChange={(event) => {
          onChange(event.target.value)
          setOpen(true)
          setActive(-1)
        }}
        onKeyDown={handleKeyDown}
        onBlur={close}
      />
      {expanded ? (
        <ul id={listboxId} role="listbox" className={styles.listbox} ref={listRef} aria-label={label}>
          {filtered.map((option, index) => (
            <li
              key={`${option.kind}-${option.value}`}
              id={optionId(index)}
              role="option"
              aria-selected={index === activeIndex}
              className={cx(styles.option, index === activeIndex && styles.optionActive)}
              onMouseDown={(event) => {
                event.preventDefault()
              }}
              onClick={() => {
                commit(index)
              }}
            >
              {option.value} <span aria-hidden="true">·</span> <span>{option.kind}</span>
            </li>
          ))}
        </ul>
      ) : null}
      {hint ? (
        <p id={hintId} className={fieldStyles.hint}>
          {hint}
        </p>
      ) : null}
    </div>
  )
}
