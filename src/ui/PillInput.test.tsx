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
  restrictToSuggestions,
  initialValue = [],
}: {
  onChange: (next: string[]) => void
  suggestions?: readonly string[]
  restrictToSuggestions?: boolean
  initialValue?: string[]
}) {
  const [value, setValue] = useState<string[]>(initialValue)
  return (
    <PillInput
      label="Tags"
      value={value}
      onChange={(next) => {
        setValue(next)
        onChange(next)
      }}
      suggestions={suggestions}
      restrictToSuggestions={restrictToSuggestions}
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
 * Follow-up to TT-5, human decision 2026-09-09 — not from a ticket, so these are written from
 * that instruction rather than from acceptance criteria (see the comment on GuestPanel.tsx's
 * two `restrictToSuggestions` fields for the full reasoning). Confirmed first, by reading
 * rather than guessing: neither this file's existing suite above nor GuestPanel.test.tsx's
 * C10 asserted that an already-added value is *absent* from the suggestion list — the old
 * `!value.includes(candidate)` filter was untested at exactly the boundary this changes, so
 * nothing here needed to be inverted.
 */
describe('an already-added value shows in the suggestion list, marked, instead of being hidden', () => {
  it('shows it disabled rather than omitting it, once the typed text matches it', async () => {
    const user = userEvent.setup()
    render(
      <ControlledPillInput onChange={vi.fn()} suggestions={['sailing', 'shooting']} initialValue={['sailing']} />,
    )

    await user.type(getPillInput('Tags'), 'sai')

    const option = await screen.findByRole('option', { name: /sailing/i })
    expect(option).toHaveAttribute('aria-disabled', 'true')
    expect(option).toHaveTextContent('Already added')
  })

  it('does not commit a second time when the marked, already-added option is chosen', async () => {
    const onChange = vi.fn()
    const user = userEvent.setup()
    render(<ControlledPillInput onChange={onChange} suggestions={['sailing']} initialValue={['sailing']} />)

    await user.type(getPillInput('Tags'), 'sai')
    await user.click(await screen.findByRole('option', { name: /sailing/i }))

    expect(onChange).not.toHaveBeenCalled()
    expect(screen.getAllByRole('button', { name: 'Remove sailing' })).toHaveLength(1)
  })

  // The gap this also closes: a value can be in `value` without ever being in `suggestions`
  // (a tag added to the guest currently being edited is not yet in `tagsInUse`, which only
  // sees guests already saved). `suggestions` is empty here on purpose — the value is found
  // through `value` alone, not through a suggestions source that happens to also know it.
  it('shows a value that is only in `value`, with no suggestions source naming it at all', async () => {
    const user = userEvent.setup()
    render(<ControlledPillInput onChange={vi.fn()} suggestions={[]} initialValue={['sailing']} />)

    await user.type(getPillInput('Tags'), 'sai')

    const option = await screen.findByRole('option', { name: /sailing/i })
    expect(option).toHaveAttribute('aria-disabled', 'true')
  })

  it('says a value is already added when a duplicate commit is refused, rather than a silent no-op', async () => {
    const user = userEvent.setup()
    render(<ControlledPillInput onChange={vi.fn()} initialValue={['nuts']} />)

    await user.type(getPillInput('Tags'), 'nuts{Enter}')

    // Scoped to the notice paragraph: an already-matching suggestion's own "Already added"
    // note is a second, unrelated element carrying the same words.
    expect(await screen.findByText(/already added/i, { selector: 'p' })).toBeInTheDocument()
  })

  it('judges a duplicate case-insensitively without changing the case already on the pill', async () => {
    const onChange = vi.fn()
    const user = userEvent.setup()
    render(<ControlledPillInput onChange={onChange} initialValue={['nuts']} />)

    await user.type(getPillInput('Tags'), 'NUTS{Enter}')

    expect(onChange).not.toHaveBeenCalled()
    // Scoped to the notice paragraph: an already-matching suggestion's own "Already added"
    // note is a second, unrelated element carrying the same words.
    expect(await screen.findByText(/already added/i, { selector: 'p' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Remove nuts' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Remove NUTS' })).not.toBeInTheDocument()
  })
})

/**
 * Follow-up to TT-5, human decision 2026-09-09 (see GuestPanel.tsx). `restrictToSuggestions`
 * is what backs the allergies and dietary-preference fields specifically; every test above and
 * below this block renders the component without it and stays on the free-typing behaviour
 * those fields keep.
 */
describe('restrictToSuggestions: a picker over the vocabulary rather than free typing', () => {
  it('does not commit typed text that matches nothing in the vocabulary on a bare Enter', async () => {
    const onChange = vi.fn()
    const user = userEvent.setup()
    render(<ControlledPillInput onChange={onChange} suggestions={['nuts', 'dairy']} restrictToSuggestions />)

    await user.type(getPillInput('Tags'), 'pollen{Enter}')

    expect(onChange).not.toHaveBeenCalled()
    expect(screen.queryAllByRole('button', { name: /^Remove /i })).toHaveLength(0)
  })

  it('commits directly on a bare Enter when the typed text exactly matches a known value, case-insensitively', async () => {
    const onChange = vi.fn()
    const user = userEvent.setup()
    render(<ControlledPillInput onChange={onChange} suggestions={['nuts', 'dairy']} restrictToSuggestions />)

    await user.type(getPillInput('Tags'), 'Nuts{Enter}')

    // The typed casing is kept, not quietly swapped for the vocabulary's own casing — the
    // same "never normalise on write" rule that applies to every other field.
    expect(onChange).toHaveBeenCalledWith(['Nuts'])
    expect(removeButton('Nuts')).toBeInTheDocument()
  })

  it('offers "something else" once the typed text matches nothing, and it commits that text verbatim', async () => {
    const onChange = vi.fn()
    const user = userEvent.setup()
    render(<ControlledPillInput onChange={onChange} suggestions={['nuts', 'dairy']} restrictToSuggestions />)

    await user.type(getPillInput('Tags'), 'sesame seeds')
    const somethingElse = await screen.findByRole('option', { name: /something else/i })
    expect(somethingElse).toHaveTextContent('sesame seeds')

    await user.click(somethingElse)

    expect(onChange).toHaveBeenCalledWith(['sesame seeds'])
    expect(removeButton('sesame seeds')).toBeInTheDocument()
  })

  it('lets "something else" be reached and chosen with the keyboard, the same as any other option', async () => {
    const onChange = vi.fn()
    const user = userEvent.setup()
    render(<ControlledPillInput onChange={onChange} suggestions={['nuts', 'dairy']} restrictToSuggestions />)

    await user.type(getPillInput('Tags'), 'sesame seeds')
    await user.keyboard('{ArrowDown}{Enter}')

    expect(onChange).toHaveBeenCalledWith(['sesame seeds'])
  })

  it('does not offer "something else" once the typed text exactly matches a known value', async () => {
    const user = userEvent.setup()
    render(<ControlledPillInput onChange={vi.fn()} suggestions={['nuts', 'dairy']} restrictToSuggestions />)

    await user.type(getPillInput('Tags'), 'nuts')

    expect(screen.queryByRole('option', { name: /something else/i })).not.toBeInTheDocument()
  })

  it('still picks a suggestion by clicking it, the same as an unrestricted field', async () => {
    const onChange = vi.fn()
    const user = userEvent.setup()
    render(<ControlledPillInput onChange={onChange} suggestions={['nuts', 'dairy']} restrictToSuggestions />)

    await user.type(getPillInput('Tags'), 'nu')
    await user.click(await screen.findByRole('option', { name: 'nuts' }))

    expect(onChange).toHaveBeenCalledWith(['nuts'])
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

/*
 * TT-5. A guest can reach the panel already holding the same entry twice: the draft copies the
 * stored array verbatim and only save deduplicates it. Rendering both is wrong twice over —
 * React keys pills by value, and the remove control filters by value, so one click would take
 * away a pill the person had not pointed at.
 */
describe('PillInput — a value repeated in the caller is shown once', () => {
  it('renders one pill for a value held twice, not two', () => {
    render(
      <PillInput
        label="Accessibility"
        value={['step-free access', 'step-free access']}
        onChange={vi.fn()}
      />,
    )

    expect(screen.getAllByText('step-free access')).toHaveLength(1)
    expect(screen.getAllByRole('button', { name: 'Remove step-free access' })).toHaveLength(1)
  })

  it('treats a repeat differing only in case as the same entry, keeping the first spelling', () => {
    render(<PillInput label="Tags" value={['Uni', 'uni']} onChange={vi.fn()} />)

    const pills = screen.getAllByRole('button', { name: /^Remove / })
    expect(pills).toHaveLength(1)
    expect(pills[0]).toHaveAccessibleName('Remove Uni')
  })

  it('leaves a list with no repeats exactly as it was given', () => {
    render(<PillInput label="Tags" value={['uni', 'footie', 'family']} onChange={vi.fn()} />)

    expect(screen.getAllByRole('button', { name: /^Remove / })).toHaveLength(3)
  })
})
