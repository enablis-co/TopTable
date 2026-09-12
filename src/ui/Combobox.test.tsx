import { describe, expect, it, vi } from 'vitest'
import { useState } from 'react'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { Combobox } from './Combobox'

/**
 * TT-38 delta plan, §D4/§D6 — an editable ARIA 1.2 combobox with list autocomplete, written
 * from the plan's behavioural contract without opening Combobox.tsx: the ARIA attributes, the
 * exact accessible-name shape ("Danny Whitaker name"), the key bindings and the
 * `stopPropagation()` guard against `PlanScreen`'s document-level Escape handler are all
 * given there.
 *
 * The plan did not give this component's TypeScript prop signature the way it does for
 * `fitFloorplan` and `suggestionsFrom` — only its behaviour. `label`/`value`/`onChange`/
 * `suggestions`/`labelHidden` below follow the shape already established by `TextField` and
 * `PillInput` in this same folder (a controlled `value`/`onChange` pair, `suggestions` as a
 * prop, `label` plus optional `labelHidden`). If the real component's props differ, that is a
 * contract mismatch to report, not a reason to have guessed differently.
 */

type ComboSuggestion = { value: string; kind: 'name' | 'tag' }

function ControlledCombobox(props: { suggestions: ComboSuggestion[]; initialValue?: string }) {
  const [value, setValue] = useState(props.initialValue ?? '')
  return (
    <Combobox
      label="Search name or tag"
      labelHidden
      value={value}
      onChange={setValue}
      suggestions={props.suggestions}
    />
  )
}

function input() {
  return screen.getByRole('combobox', { name: 'Search name or tag' })
}

function activeOption(): HTMLElement | undefined {
  return screen.queryAllByRole('option').find((option) => option.getAttribute('aria-selected') === 'true')
}

describe('Combobox — typing opens the suggestion list', () => {
  it('starts closed, and opens a listbox with aria-expanded once typed text matches a suggestion', async () => {
    const user = userEvent.setup()
    render(<ControlledCombobox suggestions={[{ value: 'Danny Whitaker', kind: 'name' }]} />)

    expect(input()).toHaveAttribute('aria-expanded', 'false')
    expect(screen.queryByRole('listbox')).not.toBeInTheDocument()

    await user.type(input(), 'dan')

    expect(input()).toHaveAttribute('aria-expanded', 'true')
    expect(screen.getByRole('listbox')).toBeInTheDocument()
  })

  it('renders no listbox once the typed text matches nothing', async () => {
    const user = userEvent.setup()
    render(<ControlledCombobox suggestions={[{ value: 'Danny Whitaker', kind: 'name' }]} />)

    await user.type(input(), 'zzz-nothing-matches')

    expect(screen.queryByRole('listbox')).not.toBeInTheDocument()
  })

  it('renders no listbox for an empty value, even once the input has focus', async () => {
    const user = userEvent.setup()
    render(<ControlledCombobox suggestions={[{ value: 'Danny Whitaker', kind: 'name' }]} />)

    await user.click(input())

    expect(screen.queryByRole('listbox')).not.toBeInTheDocument()
  })

  it('matches case-insensitively and ignores leading/trailing whitespace in the typed text', async () => {
    const user = userEvent.setup()
    render(<ControlledCombobox suggestions={[{ value: 'Danny Whitaker', kind: 'name' }]} />)

    await user.type(input(), '  DANNY  ')

    expect(screen.getByRole('option', { name: 'Danny Whitaker name' })).toBeInTheDocument()
  })

  it('caps the list at eight options even when nine suggestions match', async () => {
    const user = userEvent.setup()
    const suggestions: ComboSuggestion[] = Array.from({ length: 9 }, (_, index) => ({
      value: `Match ${index}`,
      kind: 'name',
    }))
    render(<ControlledCombobox suggestions={suggestions} />)

    await user.type(input(), 'Match')

    expect(screen.getAllByRole('option')).toHaveLength(8)
  })
})

describe('Combobox — an option\'s accessible name states its value and its kind, exactly', () => {
  it('a name suggestion reads as "Danny Whitaker name"', async () => {
    const user = userEvent.setup()
    render(<ControlledCombobox suggestions={[{ value: 'Danny Whitaker', kind: 'name' }]} />)

    await user.type(input(), 'whit')

    expect(screen.getByRole('option', { name: 'Danny Whitaker name' })).toBeInTheDocument()
  })

  it('a tag suggestion reads as "uni tag"', async () => {
    const user = userEvent.setup()
    render(<ControlledCombobox suggestions={[{ value: 'uni', kind: 'tag' }]} />)

    await user.type(input(), 'un')

    expect(screen.getByRole('option', { name: 'uni tag' })).toBeInTheDocument()
  })
})

describe('Combobox — ArrowDown moves the active option while focus stays on the input', () => {
  it('marks the active option aria-selected and names it via aria-activedescendant, without moving focus off the input', async () => {
    const user = userEvent.setup()
    render(
      <ControlledCombobox
        suggestions={[
          { value: 'Anna Field', kind: 'name' },
          { value: 'Anthony Cole', kind: 'name' },
        ]}
      />,
    )
    await user.type(input(), 'An')

    await user.keyboard('{ArrowDown}')

    const active = activeOption()
    expect(active).toBeDefined()
    expect(input()).toHaveFocus()
    expect(input().getAttribute('aria-activedescendant')).toBe(active?.id)
  })

  it('does not move past the last option (clamped)', async () => {
    const user = userEvent.setup()
    render(
      <ControlledCombobox
        suggestions={[
          { value: 'Anna Field', kind: 'name' },
          { value: 'Anthony Cole', kind: 'name' },
        ]}
      />,
    )
    await user.type(input(), 'An')

    await user.keyboard('{ArrowDown}{ArrowDown}{ArrowDown}')

    const options = screen.getAllByRole('option')
    const selected = options.filter((option) => option.getAttribute('aria-selected') === 'true')
    expect(selected).toHaveLength(1)
    expect(selected[0]).toBe(options[1])
  })

  it('End moves the active option to the last match, Home back to the first', async () => {
    const user = userEvent.setup()
    render(
      <ControlledCombobox
        suggestions={[
          { value: 'Anna Field', kind: 'name' },
          { value: 'Anthony Cole', kind: 'name' },
          { value: 'Anna Zeta', kind: 'name' },
        ]}
      />,
    )
    await user.type(input(), 'An')

    await user.keyboard('{End}')
    let options = screen.getAllByRole('option')
    expect(options[options.length - 1]).toHaveAttribute('aria-selected', 'true')

    await user.keyboard('{Home}')
    options = screen.getAllByRole('option')
    expect(options[0]).toHaveAttribute('aria-selected', 'true')
  })
})

describe('Combobox — ArrowUp steps back through the options, and off the top to the typed text', () => {
  it('moves to the previous option rather than jumping straight to the typed text', async () => {
    const user = userEvent.setup()
    render(
      <ControlledCombobox
        suggestions={[
          { value: 'Anna Field', kind: 'name' },
          { value: 'Anthony Cole', kind: 'name' },
          { value: 'Annie Barnes', kind: 'name' },
        ]}
      />,
    )
    await user.type(input(), 'An')
    await user.keyboard('{ArrowDown}{ArrowDown}{ArrowDown}')
    expect(activeOption()).toHaveAccessibleName('Annie Barnes name')

    await user.keyboard('{ArrowUp}')

    expect(activeOption()).toHaveAccessibleName('Anthony Cole name')
  })

  it('clears aria-activedescendant to absent, not to an empty string, from the first option', async () => {
    const user = userEvent.setup()
    render(<ControlledCombobox suggestions={[{ value: 'Anna Field', kind: 'name' }]} />)
    await user.type(input(), 'An')
    await user.keyboard('{ArrowDown}')
    expect(input().hasAttribute('aria-activedescendant')).toBe(true)

    await user.keyboard('{ArrowUp}')

    expect(input().hasAttribute('aria-activedescendant')).toBe(false)
    expect(activeOption()).toBeUndefined()
  })
})

describe('Combobox — Enter commits the active option and closes the list', () => {
  it('sets the value to the active option and closes the popup', async () => {
    const user = userEvent.setup()
    render(
      <ControlledCombobox
        suggestions={[
          { value: 'Anna Field', kind: 'name' },
          { value: 'Anthony Cole', kind: 'name' },
        ]}
      />,
    )
    await user.type(input(), 'An')
    await user.keyboard('{ArrowDown}{ArrowDown}')

    await user.keyboard('{Enter}')

    expect(input()).toHaveValue('Anthony Cole')
    expect(screen.queryByRole('listbox')).not.toBeInTheDocument()
    expect(input()).toHaveAttribute('aria-expanded', 'false')
  })
})

describe('Combobox — Escape dismisses the list and does nothing else', () => {
  it('the first Escape closes the popup without touching the typed text', async () => {
    const user = userEvent.setup()
    render(<ControlledCombobox suggestions={[{ value: 'Anna Field', kind: 'name' }]} />)
    await user.type(input(), 'An')
    expect(screen.getByRole('listbox')).toBeInTheDocument()

    await user.keyboard('{Escape}')

    expect(screen.queryByRole('listbox')).not.toBeInTheDocument()
    expect(input()).toHaveValue('An')
  })

  // One keystroke doing two unrelated things: with the list already closed, Escape used to
  // clear the field as well as reaching PlanScreen's own handler, so dismissing suggestions and
  // then pressing Escape again wiped a search the person had not asked to lose.
  it('a second Escape, with the popup already closed, leaves the typed text alone', async () => {
    const user = userEvent.setup()
    render(<ControlledCombobox suggestions={[{ value: 'Anna Field', kind: 'name' }]} />)
    await user.type(input(), 'An')
    await user.keyboard('{Escape}')

    await user.keyboard('{Escape}')

    expect(input()).toHaveValue('An')
  })
})

describe('Combobox — the Escape that closes the popup does not reach a document-level Escape handler', () => {
  it('stops the closing Escape from bubbling to a document keydown listener', async () => {
    const user = userEvent.setup()
    const documentListener = vi.fn()
    document.addEventListener('keydown', documentListener)

    try {
      render(<ControlledCombobox suggestions={[{ value: 'Anna Field', kind: 'name' }]} />)
      await user.type(input(), 'An')
      expect(screen.getByRole('listbox')).toBeInTheDocument()

      documentListener.mockClear() // typing itself dispatches keydowns; only the closing Escape matters here
      await user.keyboard('{Escape}')

      expect(screen.queryByRole('listbox')).not.toBeInTheDocument()
      expect(documentListener).not.toHaveBeenCalled()
    } finally {
      document.removeEventListener('keydown', documentListener)
    }
  })
})

describe('Combobox — Tab closes the list without committing a highlighted option', () => {
  it('leaves the typed value untouched and closes the popup', async () => {
    const user = userEvent.setup()
    render(
      <ControlledCombobox
        suggestions={[
          { value: 'Anna Field', kind: 'name' },
          { value: 'Anthony Cole', kind: 'name' },
        ]}
      />,
    )
    await user.type(input(), 'An')
    await user.keyboard('{ArrowDown}')

    await user.tab()

    expect(input()).toHaveValue('An')
    expect(screen.queryByRole('listbox')).not.toBeInTheDocument()
  })
})

// The primary interaction for most people, and the one the keyboard cases above never touch.
// The mousedown handler exists so the input is not blurred before the click lands — without it
// the blur closes the popup and the click has nothing left to hit.
describe('Combobox — clicking a suggestion commits it', () => {
  it('sets the value from the clicked option and closes the popup', async () => {
    const user = userEvent.setup()
    render(
      <ControlledCombobox
        suggestions={[
          { value: 'Anna Field', kind: 'name' },
          { value: 'Anthony Cole', kind: 'name' },
        ]}
      />,
    )
    await user.type(input(), 'An')

    await user.click(screen.getByRole('option', { name: 'Anthony Cole name' }))

    expect(input()).toHaveValue('Anthony Cole')
    expect(screen.queryByRole('listbox')).not.toBeInTheDocument()
  })
})

describe('Combobox — an active option that stops matching is released, not left dangling', () => {
  it('drops aria-activedescendant rather than naming an option that no longer renders', async () => {
    const user = userEvent.setup()
    render(
      <ControlledCombobox
        suggestions={[
          { value: 'Anna Field', kind: 'name' },
          { value: 'Anthony Cole', kind: 'name' },
        ]}
      />,
    )
    await user.type(input(), 'An')
    await user.keyboard('{ArrowDown}{ArrowDown}')
    expect(activeOption()).toHaveAccessibleName('Anthony Cole name')

    // Narrowing the query to one match strands the held index past the end of the pool.
    await user.type(input(), 'na')

    expect(screen.getAllByRole('option')).toHaveLength(1)
    expect(input().hasAttribute('aria-activedescendant')).toBe(false)
  })
})
