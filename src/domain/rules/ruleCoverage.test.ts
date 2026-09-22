import { describe, expect, it } from 'vitest'
import { ruleCoverage } from './ruleCoverage'
import { REGISTERED_RULES } from './registry'

/**
 * TT-53. Imports `REGISTERED_RULES` from `./registry` — a public domain export — rather than
 * asserting against a hard-coded number, so this file keeps passing unchanged as TT-17 to TT-22
 * land.
 */

describe('ruleCoverage', () => {
  it('declares ten rules', () => {
    expect(ruleCoverage().declared).toBe(10)
  })

  it('measures the numerator off the registry, not a count of its own', () => {
    expect(ruleCoverage().registered).toBe(REGISTERED_RULES.length)
  })

  it('fails the gate once the registry has outgrown the declared count', () => {
    const { registered, declared } = ruleCoverage()

    expect(
      registered,
      `${registered} rules are registered against a declared count of ${declared}. Which of the ` +
        'two is wrong is a judgement, not an increment: if KB-2 specifies the new rule, add its ' +
        'row to KB-2 and raise RULES_SPECIFIED in ruleCoverage.ts to match. If it does not belong ' +
        'on KB-2, that is the everyone-seated situation this count already carries once, and a ' +
        'second one needs a ruling rather than a bump.',
    ).toBeLessThanOrEqual(declared)
  })
})
