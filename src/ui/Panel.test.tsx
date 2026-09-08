import { describe, expect, it } from 'vitest'
import { render, screen } from '@testing-library/react'
import { Panel } from './index'

describe('Panel', () => {
  it('renders its children', () => {
    render(
      <Panel>
        <p>Guest list is empty.</p>
      </Panel>
    )
    expect(screen.getByText('Guest list is empty.')).toBeInTheDocument()
  })

  it('exposes a heading with the title text when a title is given', () => {
    render(
      <Panel title="Guests">
        <p>Guest list is empty.</p>
      </Panel>
    )
    expect(screen.getByRole('heading', { name: 'Guests' })).toBeInTheDocument()
  })

  it('renders no heading when no title is given', () => {
    render(
      <Panel>
        <p>Guest list is empty.</p>
      </Panel>
    )
    expect(screen.queryByRole('heading')).not.toBeInTheDocument()
  })

  it('renders actions alongside the title', () => {
    render(
      <Panel title="Guests" actions={<button type="button">Add guest</button>}>
        <p>Guest list is empty.</p>
      </Panel>
    )
    expect(screen.getByRole('heading', { name: 'Guests' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Add guest' })).toBeInTheDocument()
  })
})
