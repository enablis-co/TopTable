import { describe, expect, it } from 'vitest'
import { guestSummaryFields } from './guestSummary'
import type { Guest } from '../../domain/types'

/**
 * TT-36. Written from the acceptance criteria (C3, C4, C5, C6) and A2's stated field order,
 * without opening guestSummary.ts.
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

describe('guestSummaryFields — every populated field, in the ticket\'s own order (C3)', () => {
  it('a guest with all nine facts populated yields nine fields, in order', () => {
    const partner = makeGuest('g-partner', { name: 'Priya Shah' })
    const conflictOne = makeGuest('g-conflict-1', { name: 'Danny Whitaker' })
    const conflictTwo = makeGuest('g-conflict-2', { name: 'Maureen Shah' })
    const guest = makeGuest('g-1', {
      side: 'groom',
      role: 'best man',
      household: 'The Whitakers',
      partnerOf: partner.id,
      conflictsWith: [conflictOne.id, conflictTwo.id],
      allergies: ['nuts'],
      accessibility: ['step-free access'],
      tags: ['photographer'],
      socialType: 'livewire',
    })

    const fields = guestSummaryFields(guest, [guest, partner, conflictOne, conflictTwo])

    expect(fields.map((field) => field.label)).toEqual([
      'Side',
      'Role',
      'Household',
      'Partner',
      'Kept apart from',
      'Allergies',
      'Accessibility',
      'Tags',
      'Social type',
    ])
    expect(fields).toEqual([
      { label: 'Side', value: 'Groom' },
      { label: 'Role', value: 'Best man' },
      { label: 'Household', value: 'The Whitakers' },
      { label: 'Partner', value: 'Priya Shah' },
      { label: 'Kept apart from', value: 'Danny Whitaker, Maureen Shah' },
      { label: 'Allergies', value: 'Nuts' },
      { label: 'Accessibility', value: 'Step-free access' },
      { label: 'Tags', value: 'photographer' },
      { label: 'Social type', value: 'Livewire' },
    ])
  })
})

describe('guestSummaryFields — dietary preferences never appear, for any guest, in any state (C4)', () => {
  it('a guest with both an allergy and a dietary preference shows the allergy but nothing naming the diet', () => {
    const guest = makeGuest('g-1', { allergies: ['nuts'], dietaryPreferences: ['vegan'] })

    const fields = guestSummaryFields(guest, [guest])

    const allergyField = fields.find((field) => field.label === 'Allergies')
    expect(allergyField?.value).toBe('Nuts')
    expect(fields.some((field) => /vegan/i.test(field.label) || /vegan/i.test(field.value))).toBe(false)
    expect(fields.some((field) => /diet/i.test(field.label))).toBe(false)
  })
})

describe('guestSummaryFields — partner and conflicts resolve to names, never raw ids (C5)', () => {
  it('partnerOf resolves to the partner\'s name', () => {
    const partner = makeGuest('g-2', { name: 'Priya Shah' })
    const guest = makeGuest('g-1', { partnerOf: partner.id })

    const fields = guestSummaryFields(guest, [guest, partner])

    const partnerField = fields.find((field) => field.label === 'Partner')
    expect(partnerField?.value).toBe('Priya Shah')
    expect(partnerField?.value).not.toBe(partner.id)
  })

  it('two conflict ids resolve to two names, comma-joined', () => {
    const conflictOne = makeGuest('g-2', { name: 'Danny Whitaker' })
    const conflictTwo = makeGuest('g-3', { name: 'Maureen Shah' })
    const guest = makeGuest('g-1', { conflictsWith: [conflictOne.id, conflictTwo.id] })

    const fields = guestSummaryFields(guest, [guest, conflictOne, conflictTwo])

    const conflictField = fields.find((field) => field.label === 'Kept apart from')
    expect(conflictField?.value).toBe('Danny Whitaker, Maureen Shah')
  })

  it('a partnerOf or conflictsWith id that resolves to nobody is dropped, never rendered raw', () => {
    const guest = makeGuest('g-1', { partnerOf: 'g-missing', conflictsWith: ['g-also-missing'] })

    const fields = guestSummaryFields(guest, [guest])

    expect(fields.find((field) => field.label === 'Partner')).toBeUndefined()
    expect(fields.find((field) => field.label === 'Kept apart from')).toBeUndefined()
    expect(fields.some((field) => field.value.includes('g-missing'))).toBe(false)
  })
})

describe('guestSummaryFields — a field with nothing in it renders nothing (C6)', () => {
  it('empty tags, allergies and accessibility, and a null household, yield none of those four fields', () => {
    const guest = makeGuest('g-1', {
      household: null,
      partnerOf: null,
      conflictsWith: [],
      tags: [],
      allergies: [],
      accessibility: [],
    })

    const fields = guestSummaryFields(guest, [guest])

    expect(fields.map((field) => field.label)).toEqual(['Side', 'Role', 'Social type'])
    expect(fields.every((field) => field.value.length > 0)).toBe(true)
  })
})
