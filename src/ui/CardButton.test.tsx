import { describe, expect, it, vi } from 'vitest'
import { createRef } from 'react'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { CardButton } from './CardButton'

/**
 * TT-4, "Import a scenario". Written from .claude/plans/TT-4.md section 4, which publishes
 * CardButton's full public contract: `CardButtonProps = ButtonHTMLAttributes<HTMLButtonElement>`,
 * rendering `<button type="button">` and spreading every remaining prop (onClick, disabled,
 * aria-busy, id, className, ref) onto it. Does not open CardButton.tsx.
 */

describe('CardButton', () => {
  it('exposes its children as the accessible name', () => {
    render(<CardButton>Small and cosy</CardButton>)
    expect(screen.getByRole('button', { name: 'Small and cosy' })).toBeInTheDocument()
  })

  it('has type="button", so it never submits a form', () => {
    render(<CardButton>Small and cosy</CardButton>)
    expect(screen.getByRole('button', { name: 'Small and cosy' })).toHaveAttribute('type', 'button')
  })

  it('calls onClick when clicked', async () => {
    const onClick = vi.fn()
    const user = userEvent.setup()
    render(<CardButton onClick={onClick}>Small and cosy</CardButton>)

    await user.click(screen.getByRole('button', { name: 'Small and cosy' }))

    expect(onClick).toHaveBeenCalledTimes(1)
  })

  it('does not call onClick when disabled', async () => {
    const onClick = vi.fn()
    const user = userEvent.setup()
    render(
      <CardButton onClick={onClick} disabled>
        Small and cosy
      </CardButton>,
    )

    await user.click(screen.getByRole('button', { name: 'Small and cosy' }))

    expect(onClick).not.toHaveBeenCalled()
  })

  it('forwards id, aria-busy and className to the rendered element', () => {
    render(
      <CardButton id="card-1" aria-busy="true" className="extra-class">
        Small and cosy
      </CardButton>,
    )

    const button = screen.getByRole('button', { name: 'Small and cosy' })
    expect(button).toHaveAttribute('id', 'card-1')
    expect(button).toHaveAttribute('aria-busy', 'true')
    expect(button.className).toContain('extra-class')
  })

  it('forwards ref to the rendered button element', () => {
    const ref = createRef<HTMLButtonElement>()
    render(<CardButton ref={ref}>Small and cosy</CardButton>)

    expect(ref.current).toBeInstanceOf(HTMLButtonElement)
    expect(ref.current).toBe(screen.getByRole('button', { name: 'Small and cosy' }))
  })
})
