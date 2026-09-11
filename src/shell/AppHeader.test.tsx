import { describe, expect, it, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import { AppHeader } from './AppHeader'
import { useTopTableStore } from '../store/store'

/**
 * TT-35 narrowed this to identity only: the mark, the wordmark, the event name and the
 * scenario pill. The three section controls moved out to NavRail.test.tsx along with their
 * own assertions.
 */

beforeEach(() => {
  useTopTableStore.getState().reset()
})

describe('AppHeader', () => {
  it('renders a banner landmark showing the mark and the wordmark "Top Table" exactly once', () => {
    const { container } = render(<AppHeader />)
    expect(screen.getByRole('banner')).toBeInTheDocument()
    expect(screen.getAllByText('Top Table')).toHaveLength(1)
    expect(container.querySelector('svg')).toBeInTheDocument()
  })

  it('carries no section control and no other navigation', () => {
    render(<AppHeader />)
    expect(screen.queryByRole('button')).not.toBeInTheDocument()
    expect(screen.queryByRole('navigation')).not.toBeInTheDocument()
  })

  it('shows the event name from the store', () => {
    useTopTableStore.getState().setEventName("Priya & Tom's wedding")
    render(<AppHeader />)
    expect(screen.getByText("Priya & Tom's wedding")).toBeInTheDocument()
  })

  it('shows no event name and no scenario pill before anything is set up', () => {
    render(<AppHeader />)
    for (const text of ['Small and cosy', 'Adding up', 'Celebrity scale', 'Custom']) {
      expect(screen.queryByText(text)).not.toBeInTheDocument()
    }
  })

  it('shows the loaded scenario name in the pill, in sentence case', () => {
    useTopTableStore.getState().importScenario('adding-up', [])
    render(<AppHeader />)
    expect(screen.getByText('Adding up')).toBeInTheDocument()
  })

  it('shows "Custom" once the room is edited after an import', () => {
    useTopTableStore.getState().importScenario('adding-up', [])
    useTopTableStore.getState().setRoom({ roundTables: 10 })
    render(<AppHeader />)
    expect(screen.getByText('Custom')).toBeInTheDocument()
    expect(screen.queryByText('Adding up')).not.toBeInTheDocument()
  })

  it('renders in full regardless of the event name or scenario being set', () => {
    useTopTableStore.getState().setEventName('Okonjo & Whitaker')
    useTopTableStore.getState().importScenario('celebrity-scale', [])
    render(<AppHeader />)
    expect(screen.getByText('Top Table')).toBeInTheDocument()
    expect(screen.getByText('Okonjo & Whitaker')).toBeInTheDocument()
    expect(screen.getByText('Celebrity scale')).toBeInTheDocument()
  })
})
