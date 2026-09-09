import { describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useState } from 'react'
import { PillInput } from './index'

/**
 * TT-5. Written from .claude/plans/TT-5.md section 4 ("Shared UI"), which publishes
 * `PillInputProps` in full — `{ label, value, onChange, suggestions?, hint?, placeholder? }` —
 * and section 5's test list for this file. Does not open src/ui/PillInput.tsx.
 *
 * R3 is why this file exists at all: PillInput backs all four `string[]` fields on the guest
 * panel (tags, allergies, dietary preferences, accessibility), so a keyboard defect here reaches
 * all four and anything that reuses the component later. It gets its own coverage rather than
 * being exercised only through the panel.
 *
 * Two things the plan does not publish, so two judgement calls, both narrow:
 *
 * 1. The text input's accessible name is assumed to be `label`, matching TextField and Select —
 *    the only two existing precedents for a labelled field in this design system.
 * 2. Neither the input's nor the suggestion list's ARIA role is published. `getPillInput` below
 *    tries `combobox` before falling back to `textbox` (suggestions can reasonably promote the
 *    role; without them a plain textbox is just as reasonable). Suggestions themselves are
 *    queried as `option`, the standard combobox-listbox pattern and the only one with any
 *    accessibility grounding for "a suggestion can be chosen with the keyboard". A mismatch on
 *    either is a gap in the plan's component contract, not a behavioural defect, and is reported
 *    as such.
 */

function getPillInput(name: string | RegExp) {
  return screen.queryByRole('combobox', { name }) ?? screen.getByRole('textbox', { name })
}

function removeButton(value: string) {
  return screen.getByRole('button', { name: `Remove ${value}` })
}

function ControlledPillInput({
  onChange,
  suggestions,
}: {
  onChange: (next: string[]) => void
  suggestions?: readonly string[]
}) {
  const [value, setValue] = useState<string[]>([])
  return (
    <PillInput
      label="Tags"
      value={value}
      onChange={(next) => {
        setValue(next)
        onChange(next)
      }}
      suggestions={suggestions}
    />
  )
}

describe('PillInput', () => {
  it('renders `value` as pills, in order, each with its own accessible remove control', () => {
    render(<PillInput label="Tags" value={['uni', 'footie', 'family']} onChange={vi.fn()} />)

    const uni = removeButton('uni')
    const footie = removeButton('footie')
    const family = removeButton('family')

    // Order is read from DOM position, which getAllByRole preserves, rather than assumed —
    // the point of A9-style ordering claims is that they are checked, not just believed.
    const inOrder = screen.getAllByRole('button', { name: /^Remove / })
    expect(inOrder).toEqual([uni, footie, family])
  })

  it('renders no pills, and no remove controls, for an empty value', () => {
    render(<PillInput label="Tags" value={[]} onChange={vi.fn()} />)
    expect(screen.queryAllByRole('button', { name: /^Remove / })).toHaveLength(0)
  })

  it('commits typed text as a new pill when Enter is pressed', async () => {
    const onChange = vi.fn()
    const user = userEvent.setup()
    render(<ControlledPillInput onChange={onChange} />)

    const input = getPillInput('Tags')
    await user.type(input, 'sailing{Enter}')

    expect(onChange).toHaveBeenCalledWith(['sailing'])
    expect(removeButton('sailing')).toBeInTheDocument()
    // The committed text does not linger in the field to be committed a second time.
    expect(input).toHaveValue('')
  })

  // Regression (TT-5/TT-6 review, merge blocker): typing a value already present as a pill
  // and pressing Enter appended a second, identical entry — a duplicate React key, and for
  // `allergies` specifically a safety field the kitchen reads by name, so two guests' worth of
  // "Nuts, Nuts" is worse than a cosmetic bug.
  it('does not commit a duplicate of an existing pill', async () => {
    const onChange = vi.fn()
    const user = userEvent.setup()
    render(<ControlledPillInput onChange={onChange} />)

    const input = getPillInput('Tags')
    await user.type(input, 'nuts{Enter}')
    onChange.mockClear()
    await user.type(input, 'nuts{Enter}')

    expect(onChange).not.toHaveBeenCalled()
    expect(screen.getAllByRole('button', { name: 'Remove nuts' })).toHaveLength(1)
  })

  it('does nothing when Enter is pressed with no text typed', async () => {
    const onChange = vi.fn()
    const user = userEvent.setup()
    render(<ControlledPillInput onChange={onChange} />)

    await user.click(getPillInput('Tags'))
    await user.keyboard('{Enter}')

    expect(onChange).not.toHaveBeenCalled()
    expect(screen.queryAllByRole('button', { name: /^Remove / })).toHaveLength(0)
  })

  it('removes the last pill when Backspace is pressed with the input empty', async () => {
    const onChange = vi.fn()
    const user = userEvent.setup()
    render(<ControlledPillInput onChange={onChange} />)

    const input = getPillInput('Tags')
    await user.type(input, 'sailing{Enter}')
    await user.type(input, 'shooting{Enter}')
    onChange.mockClear()

    await user.click(input)
    await user.keyboard('{Backspace}')

    expect(onChange).toHaveBeenCalledWith(['sailing'])
    expect(removeButton('sailing')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Remove shooting' })).not.toBeInTheDocument()
  })

  it('does not remove a pill when Backspace is pressed while the field still has typed text', async () => {
    // The adjacent case to "Backspace on empty text removes the last pill": Backspace's normal
    // job of editing the text the user is mid-typing must still work once a pill already exists.
    const onChange = vi.fn()
    const user = userEvent.setup()
    render(<ControlledPillInput onChange={onChange} />)

    const input = getPillInput('Tags')
    await user.type(input, 'sailing{Enter}')
    onChange.mockClear()

    await user.type(input, 'shoot')
    await user.keyboard('{Backspace}')

    expect(onChange).not.toHaveBeenCalled()
    expect(removeButton('sailing')).toBeInTheDocument()
    expect(input).toHaveValue('shoo')
  })

  it('returns focus to the text input after a pill is removed', async () => {
    const user = userEvent.setup()
    render(<ControlledPillInput onChange={vi.fn()} />)

    const input = getPillInput('Tags')
    await user.type(input, 'sailing{Enter}')
    await user.click(removeButton('sailing'))

    expect(getPillInput('Tags')).toHaveFocus()
  })

  it('lets a suggestion be chosen with the keyboard', async () => {
    const onChange = vi.fn()
    const user = userEvent.setup()
    render(<ControlledPillInput onChange={onChange} suggestions={['sailing', 'shooting']} />)

    const input = getPillInput('Tags')
    await user.type(input, 'sai')
    await user.keyboard('{ArrowDown}{Enter}')

    // The pill carries the full suggestion text, not the partial string that was typed —
    // otherwise this would be indistinguishable from plain free-text Enter-to-commit.
    expect(onChange).toHaveBeenCalledWith(['sailing'])
    expect(removeButton('sailing')).toBeInTheDocument()
  })

  it('does not suggest a value that matches none of the given suggestions', async () => {
    const user = userEvent.setup()
    render(<ControlledPillInput onChange={vi.fn()} suggestions={['sailing', 'shooting']} />)

    await user.type(getPillInput('Tags'), 'zzz')

    expect(screen.queryByRole('option', { name: 'sailing' })).not.toBeInTheDocument()
    expect(screen.queryByRole('option', { name: 'shooting' })).not.toBeInTheDocument()
  })
})

/**
 * Regression (TT-5/TT-6 review): Escape here never called `stopPropagation`, so it always
 * bubbled past this field to whatever ancestor handles Escape — in the real guest panel,
 * `SlideOver`'s document-level handler, which closed the whole thirteen-field form. A plain
 * wrapping `<div onKeyDown>` stands in for that ancestor here: it is the same React bubbling
 * PillInput would traverse to reach `SlideOver` in the real component tree, without pulling in
 * `SlideOver` itself or the rest of the panel.
 */
describe('Escape and the suggestion list (regression)', () => {
  it('stops Escape reaching an ancestor handler while a suggestion list is open', async () => {
    const parentKeyDown = vi.fn()
    const user = userEvent.setup()
    render(
      <div onKeyDown={parentKeyDown}>
        <ControlledPillInput onChange={vi.fn()} suggestions={['sailing', 'shooting']} />
      </div>,
    )

    const input = getPillInput('Tags')
    await user.type(input, 'sai')
    expect(await screen.findByRole('option', { name: 'sailing' })).toBeInTheDocument()
    // Typing itself bubbles keydowns to the parent; only the Escape press is under test.
    parentKeyDown.mockClear()

    await user.keyboard('{Escape}')

    expect(parentKeyDown).not.toHaveBeenCalled()
  })

  it('lets Escape reach an ancestor handler once there is no suggestion list open', async () => {
    const parentKeyDown = vi.fn()
    const user = userEvent.setup()
    render(
      <div onKeyDown={parentKeyDown}>
        <ControlledPillInput onChange={vi.fn()} suggestions={['sailing', 'shooting']} />
      </div>,
    )

    await user.click(getPillInput('Tags'))
    await user.keyboard('{Escape}')

    expect(parentKeyDown).toHaveBeenCalledTimes(1)
  })
})
