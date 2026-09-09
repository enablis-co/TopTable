import { describe, expect, it, vi } from 'vitest'
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { GuestTable } from './GuestTable'
import type { Guest } from '../../domain/types'

/**
 * TT-6, "The guest list" — C19, C20, C21, C22, C29, C32. Written from the acceptance criteria,
 * KB-6's "Guests" wireframe and `docs/style-guide.html`'s "Guest row" section (verified directly:
 * a real `<table>` with `<th>Name</th><th>Side</th><th>Role</th><th>Tags</th><th>Needs</th>`,
 * rendering "Groom", "Mother of the bride", "Step-free access" and "Nuts" in full, capitalised,
 * and "—" for no needs). Does not open GuestTable.tsx, GuestRowMenu.tsx or their CSS.
 *
 * .claude/plans/TT-5.md section 4 does not publish GuestTable's props (unlike PillInputProps and
 * GuestDraft, which it gives in full) — only its contents and A10's row-menu naming convention
 * ("Actions for Danny Whitaker"). `GuestTableProps` here — `{ guests, onEdit, onRemove }` — is
 * this file's own inference: a filtered/full guest array in, and one callback per row action out,
 * mirroring how GuestsScreen is said to "hold... the panel's open/editing state" (so Edit must
 * bubble up an id) and keeping Remove symmetrical with it. If the real component's props differ,
 * this file fails to render at all — a contract gap to report, not a behavioural defect.
 *
 * The row menu's contents (Edit/Remove) are queried via `findAction`, which accepts either a
 * `menuitem` or a `button` role for each: A10 names a menu but TT-6 only says "row actions", and
 * a plain popover of buttons would satisfy the criterion just as literally as a menu widget.
 */

function makeGuest(id: string, overrides: Partial<Guest> = {}): Guest {
  return {
    id,
    name: `Guest ${id}`,
    side: 'bride',
    role: 'guest',
    age: 'adult',
    household: null,
    partnerOf: null,
    conflictsWith: [],
    tags: [],
    allergies: [],
    dietaryPreferences: [],
    accessibility: [],
    socialType: 'sociable',
    ...overrides,
  }
}

function renderTable(guests: Guest[], overrides: { onEdit?: (id: string) => void; onRemove?: (id: string) => void } = {}) {
  return render(
    <GuestTable guests={guests} onEdit={overrides.onEdit ?? vi.fn()} onRemove={overrides.onRemove ?? vi.fn()} />,
  )
}

async function openRowMenu(name: string) {
  const user = userEvent.setup()
  await user.click(screen.getByRole('button', { name: `Actions for ${name}` }))
  return user
}

function findAction(name: RegExp) {
  return screen.queryByRole('menuitem', { name }) ?? screen.getByRole('button', { name })
}

describe('GuestTable — columns (C19, C32)', () => {
  it('renders a real table with five visible column headers, in order: Name, Side, Role, Tags, Needs', () => {
    renderTable([makeGuest('g-1')])

    const table = screen.getByRole('table')
    const headers = within(table)
      .getAllByRole('columnheader')
      .map((h) => h.textContent?.trim())

    // Regression (TT-5/TT-6 review): the row menu's trailing cell now carries its own
    // visually-hidden column header (see the next test) so assistive tech never reports it as
    // headerless — present in the accessibility tree, and filtered out here rather than folded
    // into the five *visible* columns C19 counts.
    expect(headers.filter((text) => text !== 'Actions')).toEqual(['Name', 'Side', 'Role', 'Tags', 'Needs'])
  })

  // Regression (TT-5/TT-6 review): six <td>s per row against five <th>s meant the row menu's
  // cell had no column header at all, which assistive tech reports as such. The header lives in
  // the header row, not the Needs cell, so it cannot join Needs' own text or affect C27's count
  // (see GuestTable — cell values and the summary's "with needs" test in GuestsScreen.test.tsx).
  it("gives the row menu's own trailing cell a column header, invisibly, so it is never reported headerless", () => {
    renderTable([makeGuest('g-1')])

    const table = screen.getByRole('table')
    const headers = within(table).getAllByRole('columnheader')

    expect(headers).toHaveLength(6)
    expect(screen.getByRole('columnheader', { name: 'Actions' })).toBeInTheDocument()
  })

  it('has no age column', () => {
    renderTable([makeGuest('g-1')])

    const table = screen.getByRole('table')
    const headers = within(table)
      .getAllByRole('columnheader')
      .map((h) => h.textContent?.trim())

    expect(headers).not.toEqual(expect.arrayContaining([expect.stringMatching(/age/i)]))
  })
})

describe('GuestTable — Needs (C20, C21)', () => {
  it('shows an allergy in Needs, capitalised', () => {
    renderTable([makeGuest('g-1', { name: 'Amara Lindqvist', allergies: ['nuts'] })])
    const row = screen.getByText('Amara Lindqvist').closest('tr')
    expect(row?.textContent).toContain('Nuts')
  })

  it('shows an accessibility need in Needs, capitalised', () => {
    renderTable([makeGuest('g-1', { name: 'Maureen Shah', accessibility: ['step-free access'] })])
    const row = screen.getByText('Maureen Shah').closest('tr')
    expect(row?.textContent).toContain('Step-free access')
  })

  it('shows both an allergy and an accessibility need together when a guest has both', () => {
    renderTable([
      makeGuest('g-1', { name: 'Priya Kapoor', allergies: ['nuts'], accessibility: ['near an exit'] }),
    ])
    const row = screen.getByText('Priya Kapoor').closest('tr')
    expect(row?.textContent).toContain('Nuts')
    expect(row?.textContent).toContain('Near an exit')
  })

  it('shows an em dash for a guest with no allergies and no accessibility needs', () => {
    renderTable([makeGuest('g-1', { name: 'Danny Whitaker' })])
    const row = screen.getByText('Danny Whitaker').closest('tr')
    expect(row?.textContent).toContain('—')
  })

  // C11 carried into the table: a dietary preference alone is not a need. This is the assertion
  // that stops the two lists being read as one in the one place a merge would be invisible —
  // Needs would look identical whether it was fed by allergies or by dietary preferences.
  it('shows an em dash — not the dietary preference — for a guest with only a dietary preference', () => {
    renderTable([makeGuest('g-1', { name: 'Kev Braithwaite', dietaryPreferences: ['vegan'] })])
    const row = screen.getByText('Kev Braithwaite').closest('tr')
    expect(row?.textContent).toContain('—')
    expect(row?.textContent).not.toMatch(/vegan/i)
  })
})

describe('GuestTable — cell values in full (C22)', () => {
  it('renders "Mother of the bride" and "Bride" in full, not abbreviated', () => {
    // A5/A22 (report): docs/style-guide.html's own Guest row renders this exact role in full.
    // KB-6's ASCII abbreviates to "Mother of bride" — a column-width truncation in a layout
    // sketch, not the implementation, so that spelling is deliberately not asserted here.
    renderTable([makeGuest('g-1', { name: 'Maureen Shah', side: 'bride', role: 'mother of the bride' })])
    const row = screen.getByText('Maureen Shah').closest('tr')
    expect(row?.textContent).toContain('Mother of the bride')
    expect(row?.textContent).toContain('Bride')
    expect(row?.textContent).not.toContain('Mother of bird')
  })

  it('renders "Step-free access" in full, not truncated to "Step-free"', () => {
    renderTable([makeGuest('g-1', { name: 'Maureen Shah', accessibility: ['step-free access'] })])
    const row = screen.getByText('Maureen Shah').closest('tr')
    expect(row?.textContent).toContain('Step-free access')
  })

  it('renders "Groom" and "Best man" in full for a groom-side guest', () => {
    renderTable([makeGuest('g-1', { name: 'Danny Whitaker', side: 'groom', role: 'best man' })])
    const row = screen.getByText('Danny Whitaker').closest('tr')
    expect(row?.textContent).toContain('Groom')
    expect(row?.textContent).toContain('Best man')
  })

  it('renders tags as entered, not capitalised — tags are free text, not a fixed vocabulary', () => {
    // docs/style-guide.html's own Guest row renders tags lowercase ("uni", "footie") while
    // capitalising Side, Role and Needs — the distinction is deliberate, not an oversight.
    renderTable([makeGuest('g-1', { name: 'Danny Whitaker', tags: ['uni', 'footie'] })])
    const row = screen.getByText('Danny Whitaker').closest('tr')
    expect(row?.textContent).toContain('uni')
    expect(row?.textContent).not.toContain('Uni')
  })
})

describe('GuestTable — row actions (C29)', () => {
  it('offers a per-row menu button whose accessible name names the guest', () => {
    renderTable([makeGuest('g-1', { name: 'Danny Whitaker' })])
    expect(screen.getByRole('button', { name: 'Actions for Danny Whitaker' })).toBeInTheDocument()
  })

  it('gives two guests with the same name distinguishable rows (no duplicate accessible names to collide on)', () => {
    // Not a named criterion on its own, but the direct consequence of A10's stated reason for
    // naming the button after the guest at all ("so 200 rows do not yield 200 identical names") —
    // two guests can share a name, and the row still has to be reachable unambiguously somehow.
    renderTable([makeGuest('g-1', { name: 'Sam Reid' }), makeGuest('g-2', { name: 'Sam Reid' })])
    expect(screen.getAllByRole('button', { name: 'Actions for Sam Reid' })).toHaveLength(2)
  })

  it("each row's menu offers both Edit and Remove", async () => {
    renderTable([makeGuest('g-1', { name: 'Danny Whitaker' })])
    await openRowMenu('Danny Whitaker')

    expect(findAction(/^edit$/i)).toBeInTheDocument()
    expect(findAction(/^remove$/i)).toBeInTheDocument()
  })

  it('calls onEdit for the guest whose row menu is used', async () => {
    const onEdit = vi.fn()
    renderTable([makeGuest('g-1', { name: 'Danny Whitaker' })], { onEdit })
    const user = await openRowMenu('Danny Whitaker')

    await user.click(findAction(/^edit$/i))

    expect(onEdit).toHaveBeenCalledTimes(1)
  })

  it('calls onRemove for the guest whose row menu is used', async () => {
    const onRemove = vi.fn()
    renderTable([makeGuest('g-1', { name: 'Danny Whitaker' })], { onRemove })
    const user = await openRowMenu('Danny Whitaker')

    await user.click(findAction(/^remove$/i))

    expect(onRemove).toHaveBeenCalledTimes(1)
  })
})
