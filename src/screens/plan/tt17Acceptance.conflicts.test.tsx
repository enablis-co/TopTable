import { useState } from 'react'
import { describe, expect, it, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { PlanScreen } from './PlanScreen'
import { useTopTableStore } from '../../store/store'
import { REGISTERED_RULES } from '../../domain/rules/registry'
import type { Guest } from '../../domain/types'
import { NavigationContext } from '../../shell/navigation'

/**
 * TT-17 — an acceptance-level pass over the conflicts rule and the panel it reaches, driven
 * through the real `PlanScreen`, following the `tt53Acceptance.*` precedent: real store, real
 * registry, real auto-allocate. Written from TT-17's plan section 3, P1-P3, C2, C3, G1 and G4,
 * and KB-2. Does not open PlanScreen.tsx, PlanHeader.tsx, RulesApplied.tsx, ViolationsPanel.tsx,
 * ruleCoverage.ts, engine.ts, contract.ts, allocate.ts or conflicts.rule.ts.
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

function makeGuests(count: number): Guest[] {
  return Array.from({ length: count }, (_, index) => makeGuest(`g-${index}`))
}

function PlanScreenHarness() {
  const [allocated, setAllocated] = useState(false)
  return <PlanScreen allocated={allocated} setAllocated={setAllocated} />
}

function renderPlanScreen() {
  return render(
    <NavigationContext.Provider value={{ tab: 'plan', goTo: () => {} }}>
      <PlanScreenHarness />
    </NavigationContext.Provider>,
  )
}

beforeEach(() => {
  useTopTableStore.getState().reset()
  localStorage.clear()
})

describe('TT-17 — the panel gains a fifth rule, conflicts (P1, P2, P3)', () => {
  it('after Auto-allocate, reads "5 rules registered" and "5 of 10 rules built", and lists conflicts directly after capacity under Hard', async () => {
    useTopTableStore.getState().setRoom({ roundTables: 5, seatsEach: 8, topTableSeats: 2 })
    useTopTableStore.getState().setGuests(makeGuests(10))
    const user = userEvent.setup()
    renderPlanScreen()

    await user.click(screen.getByRole('button', { name: 'Auto-allocate' }))

    // P2, P3 — derived from the real registry rather than hardcoded, so this stays true as more
    // rules land; today it happens to be 5 registered of 10 declared.
    expect(document.body.textContent).toContain(`${REGISTERED_RULES.length} rules registered`)
    expect(document.body.textContent).toContain(`${REGISTERED_RULES.length} of 10 rules built`)

    // P1 — "Rules applied", Hard group, conflicts directly after capacity, derived from the
    // registry's own id-ascending order (the same order RulesApplied.tsx renders in).
    const sortedHard = [...REGISTERED_RULES]
      .filter((rule) => rule.severity === 'hard')
      .sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0))
    const capacityIndex = sortedHard.findIndex((rule) => rule.id === 'capacity')
    const conflictsIndex = sortedHard.findIndex((rule) => rule.id === 'conflicts')
    expect(capacityIndex).toBeGreaterThanOrEqual(0)
    expect(conflictsIndex).toBe(capacityIndex + 1)

    const hardItems = Array.from(screen.getByRole('list', { name: 'Hard' }).querySelectorAll('li')).map(
      (item) => item.textContent,
    )
    expect(hardItems).toEqual(sortedHard.map((rule) => rule.description))
  })
})

describe('TT-17 — a conflict pair pinned together is seated together, reported, and blocks publishing (C2, G4)', () => {
  it('Ann and Bob, pinned to round-1 and in conflict, are seated there; the panel names them and "Can be published" is absent', async () => {
    useTopTableStore.getState().setRoom({ roundTables: 2, seatsEach: 4, topTableSeats: 2 })
    const bride = makeGuest('bride', { name: 'Bride', role: 'bride' })
    const groom = makeGuest('groom', { name: 'Groom', role: 'groom' })
    const ann = makeGuest('ann', { name: 'Ann', conflictsWith: ['bob'] })
    const bob = makeGuest('bob', { name: 'Bob', conflictsWith: ['ann'] })
    const fillers = Array.from({ length: 6 }, (_, i) => makeGuest(`filler-${i}`, { name: `Filler ${i}` }))
    useTopTableStore.getState().setGuests([bride, groom, ann, bob, ...fillers])
    useTopTableStore.getState().pinGuest('ann', 'round-1')
    useTopTableStore.getState().pinGuest('bob', 'round-1')
    const user = userEvent.setup()
    renderPlanScreen()

    await user.click(screen.getByRole('button', { name: 'Auto-allocate' }))

    const entries = Array.from(document.querySelectorAll('[data-severity="hard"]'))
    const conflictEntry = entries.find((entry) => entry.textContent?.includes('Ann and Bob are in conflict'))
    expect(conflictEntry, 'expected a hard conflicts entry naming Ann and Bob').toBeDefined()
    expect(conflictEntry?.textContent).toContain('Hard')
    expect(conflictEntry?.textContent).toContain('Table 1')

    expect(screen.queryByText('Can be published')).not.toBeInTheDocument()
  })
})

describe('TT-17 — the same room without the pins: no conflict, publishable (C3, G1)', () => {
  it('with no pins, nobody is reported in conflict and "Can be published" is present', async () => {
    useTopTableStore.getState().setRoom({ roundTables: 2, seatsEach: 4, topTableSeats: 2 })
    const bride = makeGuest('bride', { name: 'Bride', role: 'bride' })
    const groom = makeGuest('groom', { name: 'Groom', role: 'groom' })
    const ann = makeGuest('ann', { name: 'Ann', conflictsWith: ['bob'] })
    const bob = makeGuest('bob', { name: 'Bob', conflictsWith: ['ann'] })
    const fillers = Array.from({ length: 6 }, (_, i) => makeGuest(`filler-${i}`, { name: `Filler ${i}` }))
    useTopTableStore.getState().setGuests([bride, groom, ann, bob, ...fillers])
    const user = userEvent.setup()
    renderPlanScreen()

    await user.click(screen.getByRole('button', { name: 'Auto-allocate' }))

    expect(document.body.textContent).not.toMatch(/are in conflict/)
    expect(screen.getByText('Can be published')).toBeInTheDocument()
  })
})
