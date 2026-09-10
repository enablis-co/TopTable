import { describe, expect, it } from 'vitest'
import { pinGuest, pinnedTableFor, unpinGuest } from './pins'
import type { Pin } from './types'

/**
 * TT-12, "Place a guest by clicking". Covers the pin bookkeeping behind two of its criteria —
 * placing a guest pins them, and clicking a pinned guest releases the pin — without opening
 * src/domain/pins.ts itself, in the manner of capacity.test.ts and guests.test.ts.
 *
 * pinGuest takes no guest list and cannot validate a guest or table id, so there is no test
 * here expecting it to reject one — that is resolved, or quietly ignored, by whatever later
 * reads the pins back against real guests and tables.
 */

/** Deep clone for before/after mutation comparisons — Pin is plain JSON-shaped data. */
function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T
}

describe('pinGuest — placing a guest at a table', () => {
  it('joins a guest to a table when they hold no pin yet', () => {
    const result = pinGuest([], 'g-1', 'round-3')

    expect(result).toEqual([{ guestId: 'g-1', tableId: 'round-3' }])
  })

  it('moving a pinned guest to a different table leaves exactly one pin for them, at its original array position', () => {
    const pins: Pin[] = [
      { guestId: 'g-1', tableId: 'round-1' },
      { guestId: 'g-2', tableId: 'round-2' },
      { guestId: 'g-3', tableId: 'round-3' },
    ]

    const result = pinGuest(pins, 'g-2', 'top')

    expect(result).toEqual([
      { guestId: 'g-1', tableId: 'round-1' },
      { guestId: 'g-2', tableId: 'top' },
      { guestId: 'g-3', tableId: 'round-3' },
    ])
    expect(result.filter((pin) => pin.guestId === 'g-2')).toHaveLength(1)
  })

  it('moving a guest between tables several times still leaves their pin at its original array position — order does not depend on how many times they have been moved', () => {
    const oneGuestSeated = pinGuest([], 'g-1', 'round-1')
    const twoGuestsSeated = pinGuest(oneGuestSeated, 'g-2', 'round-2')
    const threeGuestsSeated = pinGuest(twoGuestsSeated, 'g-3', 'round-3')

    const movedOnce = pinGuest(threeGuestsSeated, 'g-1', 'round-9')
    const movedTwice = pinGuest(movedOnce, 'g-1', 'top')

    expect(movedTwice).toEqual([
      { guestId: 'g-1', tableId: 'top' },
      { guestId: 'g-2', tableId: 'round-2' },
      { guestId: 'g-3', tableId: 'round-3' },
    ])
  })

  it('placing a guest at the table they are already pinned to leaves a single, unchanged pin', () => {
    const pins: Pin[] = [{ guestId: 'g-1', tableId: 'round-1' }]

    expect(pinGuest(pins, 'g-1', 'round-1')).toEqual([{ guestId: 'g-1', tableId: 'round-1' }])
  })

  it('two different guests can pin to the same table — a table holds more than one guest', () => {
    const pins: Pin[] = [{ guestId: 'g-1', tableId: 'round-1' }]

    const result = pinGuest(pins, 'g-2', 'round-1')

    expect(result).toEqual([
      { guestId: 'g-1', tableId: 'round-1' },
      { guestId: 'g-2', tableId: 'round-1' },
    ])
  })
})

describe('unpinGuest — releasing a pinned guest', () => {
  it('drops the pin for the given guest and leaves every other pin untouched', () => {
    const pins: Pin[] = [
      { guestId: 'g-1', tableId: 'round-1' },
      { guestId: 'g-2', tableId: 'round-2' },
      { guestId: 'g-3', tableId: 'round-3' },
    ]

    const result = unpinGuest(pins, 'g-2')

    expect(result).toEqual([
      { guestId: 'g-1', tableId: 'round-1' },
      { guestId: 'g-3', tableId: 'round-3' },
    ])
    expect(result).not.toBe(pins)
  })

  it('unpinning the only pin present leaves an empty array', () => {
    const pins: Pin[] = [{ guestId: 'g-1', tableId: 'round-1' }]

    expect(unpinGuest(pins, 'g-1')).toEqual([])
  })

  it('returns the same array reference when the named guest holds no pin among others', () => {
    // removeGuest documents its own same-reference guarantee and reaches it by calling
    // unpinGuest unconditionally — a freshly-copied array here, even one that looks
    // identical, would silently break that guarantee. Only an identity check catches it.
    const pins: Pin[] = [{ guestId: 'g-1', tableId: 'round-1' }]

    expect(unpinGuest(pins, 'g-does-not-exist')).toBe(pins)
  })

  it('returns the same array reference for an empty list', () => {
    const pins: Pin[] = []

    expect(unpinGuest(pins, 'g-1')).toBe(pins)
  })
})

describe('pinnedTableFor', () => {
  it('returns the table a guest is pinned to, found among other pins', () => {
    const pins: Pin[] = [
      { guestId: 'g-1', tableId: 'round-1' },
      { guestId: 'g-2', tableId: 'round-2' },
      { guestId: 'g-3', tableId: 'top' },
    ]

    expect(pinnedTableFor(pins, 'g-3')).toBe('top')
  })

  it('returns null for a guest holding no pin among others', () => {
    const pins: Pin[] = [{ guestId: 'g-1', tableId: 'round-1' }]

    expect(pinnedTableFor(pins, 'g-2')).toBeNull()
  })

  it('returns null for an empty list', () => {
    expect(pinnedTableFor([], 'g-1')).toBeNull()
  })
})

describe('purity', () => {
  it('pinGuest does not mutate its input and is repeatable', () => {
    const pins: Pin[] = [{ guestId: 'g-1', tableId: 'round-1' }]
    const snapshot = clone(pins)

    const first = pinGuest(pins, 'g-2', 'round-2')

    expect(pins).toEqual(snapshot)
    expect(pinGuest(pins, 'g-2', 'round-2')).toEqual(first)
  })

  it('unpinGuest does not mutate its input and is repeatable', () => {
    const pins: Pin[] = [
      { guestId: 'g-1', tableId: 'round-1' },
      { guestId: 'g-2', tableId: 'round-2' },
    ]
    const snapshot = clone(pins)

    const first = unpinGuest(pins, 'g-1')

    expect(pins).toEqual(snapshot)
    expect(unpinGuest(pins, 'g-1')).toEqual(first)
  })

  it('pinnedTableFor does not mutate its input and is repeatable', () => {
    const pins: Pin[] = [{ guestId: 'g-1', tableId: 'round-1' }]
    const snapshot = clone(pins)

    const first = pinnedTableFor(pins, 'g-1')

    expect(pins).toEqual(snapshot)
    expect(pinnedTableFor(pins, 'g-1')).toBe(first)
  })
})
