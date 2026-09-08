import { describe, expect, it } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { Tag } from './index'

describe('Tag', () => {
  it('renders its text', () => {
    render(<Tag>Vegetarian</Tag>)
    expect(screen.getByText('Vegetarian')).toBeInTheDocument()
  })

  it('exposes no interactive role', () => {
    render(<Tag>Vegetarian</Tag>)
    expect(screen.queryByRole('button')).not.toBeInTheDocument()
    expect(screen.queryByRole('link')).not.toBeInTheDocument()
    expect(screen.queryByRole('checkbox')).not.toBeInTheDocument()
  })

  it('is not reachable by keyboard focus', async () => {
    const user = userEvent.setup()
    render(
      <>
        <Tag>Vegetarian</Tag>
        <button type="button">after</button>
      </>
    )
    await user.tab()
    expect(screen.getByRole('button', { name: 'after' })).toHaveFocus()
  })
})
