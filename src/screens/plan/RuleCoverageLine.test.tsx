import { describe, expect, it } from 'vitest'
import { render } from '@testing-library/react'
import { RuleCoverageLine } from './RuleCoverageLine'

/**
 * TT-53. Renders the component directly with explicit props — no mocking of `ruleCoverage` or
 * the registry, which is the point of this component existing.
 *
 * The exact strings below are the guard on the verb: "built" counts what exists, and a measuring
 * word here would be false, because scorePlan drops every rule with no opportunities from the
 * mean (KB-8). See RuleCoverageLine.tsx's own comment for the trap.
 */

describe('RuleCoverageLine', () => {
  it('renders "4 of 10 rules built" for a partial registry', () => {
    const { container } = render(<RuleCoverageLine coverage={{ registered: 4, declared: 10 }} scored={true} />)
    expect(container.textContent).toBe('4 of 10 rules built')
  })

  it('does not singularise "rules" off a numerator of one', () => {
    const { container } = render(<RuleCoverageLine coverage={{ registered: 1, declared: 10 }} scored={true} />)
    expect(container.textContent).toBe('1 of 10 rules built')
  })

  it('renders nothing once the registry has caught up with the declared count', () => {
    const { container } = render(<RuleCoverageLine coverage={{ registered: 10, declared: 10 }} scored={true} />)
    expect(container.textContent).toBe('')
  })

  it('renders nothing when the registry has outgrown a stale declared count', () => {
    const { container } = render(<RuleCoverageLine coverage={{ registered: 11, declared: 10 }} scored={true} />)
    expect(container.textContent).toBe('')
  })

  it('renders nothing when there is no score to qualify', () => {
    const { container } = render(<RuleCoverageLine coverage={{ registered: 4, declared: 10 }} scored={false} />)
    expect(container.textContent).toBe('')
  })

  it('carries the tabular class on the two figures only, never on the paragraph', () => {
    const { container } = render(<RuleCoverageLine coverage={{ registered: 4, declared: 10 }} scored={true} />)

    const tabularElements = Array.from(container.querySelectorAll('.tt-num'))
    expect(tabularElements.map((element) => element.textContent)).toEqual(['4', '10'])

    const paragraph = container.querySelector('p')
    expect(paragraph).not.toBeNull()
    expect(paragraph?.classList.contains('tt-num')).toBe(false)
  })
})
