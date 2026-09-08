import { afterEach, describe, expect, it, vi } from 'vitest'
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useState } from 'react'
import { SlideOver } from './index'

function required<T>(value: T | undefined, message: string): T {
  if (value === undefined) {
    throw new Error(message)
  }
  return value
}

function Harness() {
  const [open, setOpen] = useState(false)
  return (
    <>
      <button type="button" onClick={() => setOpen(true)}>
        Edit guest
      </button>
      <SlideOver open={open} title="Edit guest" onClose={() => setOpen(false)}>
        <button type="button">Save</button>
      </SlideOver>
    </>
  )
}

describe('SlideOver', () => {
  // Only the scroll-lock case below touches this; reset it unconditionally so
  // a failed assertion never leaks a locked scroll into a later test, and so
  // this suite makes no assumption about running last.
  afterEach(() => {
    document.body.style.overflow = ''
  })

  it('renders nothing when closed', () => {
    const { container } = render(
      <SlideOver open={false} title="Edit guest" onClose={vi.fn()}>
        <p>Form fields</p>
      </SlideOver>
    )
    expect(container).toBeEmptyDOMElement()
  })

  it('exposes a dialog whose accessible name is the title when open', () => {
    render(
      <SlideOver open title="Edit guest" onClose={vi.fn()}>
        <p>Form fields</p>
      </SlideOver>
    )
    expect(screen.getByRole('dialog', { name: 'Edit guest' })).toBeInTheDocument()
  })

  it('moves focus inside the panel when it opens', async () => {
    const user = userEvent.setup()
    render(<Harness />)
    await user.click(screen.getByRole('button', { name: 'Edit guest' }))
    const dialog = await screen.findByRole('dialog', { name: 'Edit guest' })

    const activeElement = document.activeElement
    if (activeElement === null) {
      throw new Error('expected an element to be focused once the panel opens')
    }
    expect(dialog).toContainElement(activeElement as HTMLElement)
  })

  it('calls onClose when Escape is pressed', async () => {
    const onClose = vi.fn()
    const user = userEvent.setup()
    render(
      <SlideOver open title="Edit guest" onClose={onClose}>
        <button type="button">Save</button>
      </SlideOver>
    )
    await user.keyboard('{Escape}')
    expect(onClose).toHaveBeenCalledTimes(1)
  })

  it('wraps Tab from the last focusable element to the first', async () => {
    const user = userEvent.setup()
    render(
      <SlideOver open title="Edit guest" onClose={vi.fn()}>
        <button type="button">First field</button>
        <button type="button">Second field</button>
      </SlideOver>
    )
    const dialog = screen.getByRole('dialog', { name: 'Edit guest' })
    const focusable = within(dialog).getAllByRole('button')
    const first = required(focusable[0], 'expected at least one focusable element in the dialog')
    const last = required(
      focusable[focusable.length - 1],
      'expected at least one focusable element in the dialog'
    )

    last.focus()
    await user.tab()
    expect(first).toHaveFocus()
  })

  it('wraps Shift+Tab from the first focusable element to the last', async () => {
    const user = userEvent.setup()
    render(
      <SlideOver open title="Edit guest" onClose={vi.fn()}>
        <button type="button">First field</button>
        <button type="button">Second field</button>
      </SlideOver>
    )
    const dialog = screen.getByRole('dialog', { name: 'Edit guest' })
    const focusable = within(dialog).getAllByRole('button')
    const first = required(focusable[0], 'expected at least one focusable element in the dialog')
    const last = required(
      focusable[focusable.length - 1],
      'expected at least one focusable element in the dialog'
    )

    first.focus()
    await user.tab({ shift: true })
    expect(last).toHaveFocus()
  })

  it('returns focus to the opening element after it closes', async () => {
    const user = userEvent.setup()
    render(<Harness />)
    const opener = screen.getByRole('button', { name: 'Edit guest' })
    await user.click(opener)
    await screen.findByRole('dialog', { name: 'Edit guest' })

    await user.keyboard('{Escape}')
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(opener).toHaveFocus()
  })

  it('renders footer content when supplied', () => {
    render(
      <SlideOver
        open
        title="Edit guest"
        onClose={vi.fn()}
        footer={<button type="button">Save changes</button>}
      >
        <p>Form fields</p>
      </SlideOver>
    )
    expect(screen.getByRole('button', { name: 'Save changes' })).toBeInTheDocument()
  })

  it('does not call onClose when the scrim behind the panel is clicked (open question C: scrim click does not close)', async () => {
    const onClose = vi.fn()
    const user = userEvent.setup()
    const { container } = render(
      <SlideOver open title="Edit guest" onClose={onClose}>
        <button type="button">Save</button>
      </SlideOver>
    )
    const dialog = screen.getByRole('dialog', { name: 'Edit guest' })
    const topLevelNodes = Array.from(container.children)
    const scrim = required(
      topLevelNodes.find((node) => node !== dialog),
      'expected a rendered node behind the dialog panel to act as the scrim'
    )

    await user.click(scrim)
    expect(onClose).not.toHaveBeenCalled()
  })

  // The two wrap tests above both start by calling .focus() on an element
  // already inside the panel, so they only ever exercise Tab/Shift+Tab at the
  // panel's own two boundaries. They cannot catch focus escaping by a route
  // that never starts inside the panel at all — which is exactly what a click
  // on the scrim does: it lands on nothing focusable, so the browser's normal
  // fallback takes focus to document.body. From there, an untrapped Tab (or
  // Shift+Tab) resolves against the *whole document's* tab order and can reach
  // a control on the page behind the dim, not just wrap within the dialog.
  //
  // Both cases below reproduce that starting state directly (blur whatever I1
  // autofocused on open, which — with nothing else to claim it — falls back to
  // document.body, exactly as a scrim click does) and place one outside
  // control before the SlideOver and one after it in the DOM, so that an
  // untrapped Tab and an untrapped Shift+Tab each have a real, reachable
  // escape route to be caught reaching for.

  it('keeps focus inside the dialog when Tab is pressed after focus has escaped to document.body (I1: the trap must hold from outside the panel, not only at its own wrap boundaries)', async () => {
    const user = userEvent.setup()
    render(
      <>
        <button type="button">App header</button>
        <SlideOver open title="Edit guest" onClose={vi.fn()}>
          <button type="button">Save</button>
        </SlideOver>
        <button type="button">Later on the page</button>
      </>
    )
    const dialog = screen.getByRole('dialog', { name: 'Edit guest' })
    const before = screen.getByRole('button', { name: 'App header' })
    const after = screen.getByRole('button', { name: 'Later on the page' })

    const focusedOnOpen = document.activeElement
    if (focusedOnOpen instanceof HTMLElement) {
      focusedOnOpen.blur()
    }
    expect(document.activeElement).toBe(document.body)

    await user.tab()
    expect(document.activeElement).not.toBe(before)
    expect(document.activeElement).not.toBe(after)
    expect(dialog).toContainElement(document.activeElement as HTMLElement)
  })

  it('keeps focus inside the dialog when Shift+Tab is pressed after focus has escaped to document.body (I1: the trap must hold from outside the panel, not only at its own wrap boundaries)', async () => {
    const user = userEvent.setup()
    render(
      <>
        <button type="button">App header</button>
        <SlideOver open title="Edit guest" onClose={vi.fn()}>
          <button type="button">Save</button>
        </SlideOver>
        <button type="button">Later on the page</button>
      </>
    )
    const dialog = screen.getByRole('dialog', { name: 'Edit guest' })
    const before = screen.getByRole('button', { name: 'App header' })
    const after = screen.getByRole('button', { name: 'Later on the page' })

    const focusedOnOpen = document.activeElement
    if (focusedOnOpen instanceof HTMLElement) {
      focusedOnOpen.blur()
    }
    expect(document.activeElement).toBe(document.body)

    await user.tab({ shift: true })
    expect(document.activeElement).not.toBe(before)
    expect(document.activeElement).not.toBe(after)
    expect(dialog).toContainElement(document.activeElement as HTMLElement)
  })

  it('locks the page from scrolling while open, and restores the previous overflow value when it closes (I3)', async () => {
    const user = userEvent.setup()
    // A sentinel other than '' or 'hidden': proves the close path restores the
    // value that was actually there before, not just clears its own lock.
    document.body.style.overflow = 'scroll'
    render(<Harness />)
    expect(document.body.style.overflow).toBe('scroll')

    await user.click(screen.getByRole('button', { name: 'Edit guest' }))
    await screen.findByRole('dialog', { name: 'Edit guest' })
    expect(document.body.style.overflow).toBe('hidden')

    await user.keyboard('{Escape}')
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(document.body.style.overflow).toBe('scroll')
  })
})
