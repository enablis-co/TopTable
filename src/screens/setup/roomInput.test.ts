import { describe, expect, it } from 'vitest'
import { displayRoomNumber, parseRoomNumber } from './roomInput'

/**
 * TT-3, "Set up the room". Written from the acceptance criteria (A16: the three number
 * fields show empty rather than 0). Does not open src/screens/setup/roomInput.ts.
 */

describe('displayRoomNumber', () => {
  it('displays 0 as an empty string, so a cleared or unconfigured field never shows "0"', () => {
    expect(displayRoomNumber(0)).toBe('')
  })

  it('displays a positive number as its plain digits', () => {
    expect(displayRoomNumber(9)).toBe('9')
  })
})

describe('parseRoomNumber', () => {
  it('parses an empty string as 0', () => {
    expect(parseRoomNumber('')).toBe(0)
  })

  it('parses a plain integer string', () => {
    expect(parseRoomNumber('12')).toBe(12)
  })

  it('parses a leading-zero string', () => {
    expect(parseRoomNumber('08')).toBe(8)
  })

  it('parses a negative string as 0, never as a negative number', () => {
    expect(parseRoomNumber('-5')).toBe(0)
  })

  it('truncates a decimal string to its integer part', () => {
    expect(parseRoomNumber('3.7')).toBe(3)
  })

  it('parses non-numeric text as 0', () => {
    expect(parseRoomNumber('abc')).toBe(0)
  })
})
