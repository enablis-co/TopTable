import { describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { Button, type ButtonVariant } from './index'

describe('Button', () => {
  const variants: ButtonVariant[] = ['primary', 'secondary', 'quiet']

  it.each(variants)('exposes its text as the accessible name for the %s variant', (variant) => {
    render(<Button variant={variant}>Save changes</Button>)
    expect(screen.getByRole('button', { name: 'Save changes' })).toBeInTheDocument()
  })

  it('defaults to type="button"', () => {
    render(<Button>Save changes</Button>)
    expect(screen.getByRole('button', { name: 'Save changes' })).toHaveAttribute('type', 'button')
  })

  it('calls onClick when activated', async () => {
    const onClick = vi.fn()
    const user = userEvent.setup()
    render(<Button onClick={onClick}>Save changes</Button>)
    await user.click(screen.getByRole('button', { name: 'Save changes' }))
    expect(onClick).toHaveBeenCalledTimes(1)
  })

  it('does not call onClick when disabled', async () => {
    const onClick = vi.fn()
    const user = userEvent.setup()
    render(
      <Button onClick={onClick} disabled>
        Save changes
      </Button>
    )
    await user.click(screen.getByRole('button', { name: 'Save changes' }))
    expect(onClick).not.toHaveBeenCalled()
  })

  it('is reachable by keyboard focus', async () => {
    const user = userEvent.setup()
    render(<Button>Save changes</Button>)
    await user.tab()
    expect(screen.getByRole('button', { name: 'Save changes' })).toHaveFocus()
  })

  it('is not reachable by keyboard focus when disabled', async () => {
    const user = userEvent.setup()
    render(
      <>
        <Button disabled>Save changes</Button>
        <button type="button">after</button>
      </>
    )
    await user.tab()
    expect(screen.getByRole('button', { name: 'after' })).toHaveFocus()
  })
})
