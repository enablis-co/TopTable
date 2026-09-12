import { describe, expect, it, vi } from 'vitest'
import { useState } from 'react'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { Combobox } from './Combobox'

/**
 * TT-38 delta plan, §D4/§D6 — an editable ARIA 1.2 combobox with list autocomplete, written
 * from the plan's behavioural contract without opening Combobox.tsx: the ARIA attributes, the
 * exact accessible-name shape ("Danny Whitaker name"), the key bindings and the
 * `stopPropagation()` guard against `PlanScreen`'s document-level Escape handler (D12) are all
 * given there.
 *
 * §D4 does not give this component's TypeScript prop signature the way it does for
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

describe('Combobox — ArrowUp from the first option returns to the typed text, not to an empty descendant', () => {
  it('clears aria-activedescendant to absent, not to an empty string', async () => {
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

describe('Combobox — Escape closes the list leaving the value; a second Escape clears it', () => {
  it('the first Escape closes the popup without touching the typed text', async () => {
    const user = userEvent.setup()
    render(<ControlledCombobox suggestions={[{ value: 'Anna Field', kind: 'name' }]} />)
    await user.type(input(), 'An')
    expect(screen.getByRole('listbox')).toBeInTheDocument()

    await user.keyboard('{Escape}')

    expect(screen.queryByRole('listbox')).not.toBeInTheDocument()
    expect(input()).toHaveValue('An')
  })

  it('a second Escape, with the popup already closed, clears the value', async () => {
    const user = userEvent.setup()
    render(<ControlledCombobox suggestions={[{ value: 'Anna Field', kind: 'name' }]} />)
    await user.type(input(), 'An')
    await user.keyboard('{Escape}')

    await user.keyboard('{Escape}')

    expect(input()).toHaveValue('')
  })
})

describe('Combobox — the Escape that closes the popup does not reach a document-level Escape handler (D12)', () => {
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
