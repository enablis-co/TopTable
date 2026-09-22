import { describe, expect, it } from 'vitest'
import { render, screen } from '@testing-library/react'
import { RulesApplied } from './RulesApplied'
import { REGISTERED_RULES } from '../../domain/rules/registry'

/**
 * TT-53. `RulesApplied` takes no props and reads `REGISTERED_RULES` directly, so these tests
 * render it against the real registry rather than a fixture — the same choice
 * `ruleCoverage.test.ts` makes for the same reason (AGENTS.md's discovery property: a new
 * `*.rule.ts` file must not need an edit here to be picked up).
 *
 * The grouping and ordering assertions are derived from `REGISTERED_RULES`, so they hold as
 * TT-17 to TT-22 add rules. The roster of descriptions below is not: it pins today's four by
 * name as the honest current-state check, and it is expected to need a line adding as each of
 * those tickets lands. That is a scheduled edit, not a regression — but this file does have to
 * be edited, which `registry.test.ts` and `ruleCoverage.test.ts` deliberately avoid.
 */

function expectedDescriptionsBySeverity(): { hard: string[]; soft: string[] } {
  const bySeverity = { hard: [] as string[], soft: [] as string[] }
  const sorted = [...REGISTERED_RULES].sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0))
  for (const rule of sorted) {
    bySeverity[rule.severity].push(rule.description)
  }
  return bySeverity
}

describe('RulesApplied — a "Rules applied" heading, below the panel title', () => {
  it('renders a level-3 "Rules applied" heading', () => {
    render(<RulesApplied />)
    expect(screen.getByRole('heading', { name: 'Rules applied', level: 3 })).toBeInTheDocument()
  })
})

describe('RulesApplied — grouped by severity, Hard then Soft, each a real heading (KB-6 semantics)', () => {
  it('renders "Hard" and "Soft" as headings, Hard before Soft', () => {
    render(<RulesApplied />)
    const headings = screen.getAllByRole('heading').map((heading) => heading.textContent)
    expect(headings).toEqual(['Rules applied', 'Hard', 'Soft'])
  })

  it('renders today\'s four registered rules under the right severity group, id-ascending', () => {
    render(<RulesApplied />)
    const expected = expectedDescriptionsBySeverity()

    expect(expected.hard).toEqual([
      'A table must not be seated above its capacity',
      'Every guest has a seat while the room still has an empty one',
      'The top table contains only guests holding a protocol role, in the protocol order',
    ])
    expect(expected.soft).toEqual(['Partners should sit next to each other, not merely at the same table'])

    // Queried by each list's accessible name, which comes from its own <h4> via aria-labelledby.
    // That is the tie between a rule and its severity here — not a class name, and not a DOM
    // sibling walk, either of which would keep passing if the markup were reshuffled.
    const under = (heading: string) =>
      Array.from(screen.getByRole('list', { name: heading }).querySelectorAll('li')).map((item) => item.textContent)

    expect(under('Hard')).toEqual(expected.hard)
    expect(under('Soft')).toEqual(expected.soft)
  })

  it('shows each rule\'s description and nothing else — no id, no weight, no remedy', () => {
    render(<RulesApplied />)
    for (const rule of REGISTERED_RULES) {
      const item = screen.getByText(rule.description)
      expect(item.textContent).toBe(rule.description)
    }
  })
})

describe('RulesApplied — carries severity by the heading word alone, never data-severity (KB-5; ViolationsPanel.module.css trap)', () => {
  it('renders no data-severity attribute anywhere', () => {
    const { container } = render(<RulesApplied />)
    expect(container.querySelectorAll('[data-severity]')).toHaveLength(0)
  })

  it('renders the severity words in sentence case, never upper-case', () => {
    const { container } = render(<RulesApplied />)
    const text = container.textContent ?? ''
    expect(text).toContain('Hard')
    expect(text).toContain('Soft')
    expect(text).not.toMatch(/\bHARD\b/)
    expect(text).not.toMatch(/\bSOFT\b/)
  })
})

describe('RulesApplied — every registered rule reaches the list (the discovery property)', () => {
  it('renders exactly as many items as the registry holds, so a hardcoded roster cannot survive a new rule file', () => {
    render(<RulesApplied />)
    const items = screen.getAllByRole('list').flatMap((list) => Array.from(list.querySelectorAll('li')))

    expect(items).toHaveLength(REGISTERED_RULES.length)
  })
})
