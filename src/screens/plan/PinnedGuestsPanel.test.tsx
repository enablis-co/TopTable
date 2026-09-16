import { describe, expect, it, vi } from 'vitest'
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { PinnedGuestsPanel } from './PinnedGuestsPanel'
import type { PinnedGuestRow } from './pinnedGuests'

/**
 * TT-16 part two's pinned-guests panel — the third column's fourth state, beside the violations
 * panel, TT-15's table detail and TT-16 part one's score breakdown, all untouched. Written from
 * section 9's AC-P criteria and the props contract `{ id, rows, onDismiss }` against
 * `PinnedGuestRow` (pinnedGuests.ts's own exported type — a type import, not the
 * implementation). Does not open PinnedGuestsPanel.tsx or PinnedGuestsPanel.module.css.
 *
 * Fixtures build `PinnedGuestRow` values directly, the same convention
 * ScoreBreakdownPanel.test.tsx already uses for `ScoreDimension`.
 */

function makeRow(overrides: Partial<PinnedGuestRow> & Pick<PinnedGuestRow, 'guestId'>): PinnedGuestRow {
  return {
    guestName: `Fixture guest for ${overrides.guestId}`,
    tableId: 'round-1',
    tableLabel: 'Table 1',
    overCapacity: false,
    ...overrides,
  }
}

function textOf(element: Element | null | undefined): string {
  return element?.textContent?.replace(/\s+/g, ' ').trim() ?? ''
}

describe('PinnedGuestsPanel — a "Pinned guests" heading', () => {
  it('renders a heading named "Pinned guests"', () => {
    render(<PinnedGuestsPanel id="pinned" rows={[makeRow({ guestId: 'a' })]} onDismiss={vi.fn()} />)
    expect(screen.getByRole('heading', { name: 'Pinned guests' })).toBeInTheDocument()
  })
})

describe('PinnedGuestsPanel — one row per pinned guest, in the order given', () => {
  it('renders both rows, each carrying its own guest name and table label, in the given order', () => {
    const rows: PinnedGuestRow[] = [
      makeRow({ guestId: 'first', guestName: 'Anna First', tableId: 'round-1', tableLabel: 'Table 1' }),
      makeRow({ guestId: 'second', guestName: 'Ben Second', tableId: 'round-2', tableLabel: 'Table 2' }),
    ]
    render(<PinnedGuestsPanel id="pinned" rows={rows} onDismiss={vi.fn()} />)

    const listRows = within(screen.getByRole('list')).getAllByRole('listitem')
    expect(listRows).toHaveLength(2)
    expect(textOf(listRows[0])).toContain('Anna First')
    expect(textOf(listRows[0])).toContain('Table 1')
    expect(textOf(listRows[1])).toContain('Ben Second')
    expect(textOf(listRows[1])).toContain('Table 2')
  })
})

describe('PinnedGuestsPanel — a guest whose pin overflowed their table', () => {
  it('is marked as over capacity', () => {
    const rows: PinnedGuestRow[] = [
      makeRow({ guestId: 'over', guestName: 'Over Capacity Guest', overCapacity: true }),
      makeRow({ guestId: 'fine', guestName: 'Ordinary Guest', overCapacity: false }),
    ]
    render(<PinnedGuestsPanel id="pinned" rows={rows} onDismiss={vi.fn()} />)

    const listRows = within(screen.getByRole('list')).getAllByRole('listitem')
    const overRow = listRows.find((row) => textOf(row).includes('Over Capacity Guest'))
    const fineRow = listRows.find((row) => textOf(row).includes('Ordinary Guest'))
    if (!overRow || !fineRow) throw new Error('expected to find both rows by their own guest name')

    expect(textOf(overRow)).toMatch(/over capacity/i)
    expect(textOf(fineRow)).not.toMatch(/over capacity/i)
  })
})

describe('PinnedGuestsPanel — no release control', () => {
  it('offers no button naming a release — releasing stays TT-15\'s table detail panel', () => {
    const rows: PinnedGuestRow[] = [makeRow({ guestId: 'a', guestName: 'Guest A' })]
    render(<PinnedGuestsPanel id="pinned" rows={rows} onDismiss={vi.fn()} />)

    expect(screen.queryByRole('button', { name: /release/i })).not.toBeInTheDocument()
  })
})

describe('PinnedGuestsPanel — the dismiss control', () => {
  it('is named "Close pinned guests", distinct from the other two dismiss controls, and calls onDismiss once when clicked', async () => {
    const user = userEvent.setup()
    const onDismiss = vi.fn()
    render(<PinnedGuestsPanel id="pinned" rows={[makeRow({ guestId: 'a' })]} onDismiss={onDismiss} />)

    const dismissButton = screen.getByRole('button', { name: 'Close pinned guests' })
    expect(screen.queryByRole('button', { name: 'Close table detail' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Close score breakdown' })).not.toBeInTheDocument()

    await user.click(dismissButton)

    expect(onDismiss).toHaveBeenCalledTimes(1)
  })
})

describe('PinnedGuestsPanel — not the soft-violation bar idiom', () => {
  // The stylesheet half of this idiom — no --hard/--soft colour, no left border anywhere in
  // PinnedGuestsPanel.module.css — is asserted in scoreStyles.test.ts, the file that reads CSS
  // as text; this file never opens PinnedGuestsPanel.module.css (see the header comment above).
  it('no row carries data-severity, even for an over-capacity row', () => {
    const rows: PinnedGuestRow[] = [makeRow({ guestId: 'a' }), makeRow({ guestId: 'b', overCapacity: true })]
    const { container } = render(<PinnedGuestsPanel id="pinned" rows={rows} onDismiss={vi.fn()} />)

    expect(container.querySelectorAll('[data-severity]')).toHaveLength(0)
  })
})

describe('PinnedGuestsPanel — the wrapper carries the id it was given', () => {
  it('renders the given id on the outer element, for aria-controls to name', () => {
    const { container } = render(
      <PinnedGuestsPanel id="the-pinned-panel-id" rows={[makeRow({ guestId: 'a' })]} onDismiss={vi.fn()} />,
    )

    expect(container.querySelector('#the-pinned-panel-id')).not.toBeNull()
  })
})
