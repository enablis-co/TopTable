import { describe, expect, it } from 'vitest'
import { render, screen } from '@testing-library/react'
import { ViolationsPanel } from './ViolationsPanel'
import { tabularClass } from '../../ui'
import type { RuleReport } from '../../domain/rules/engine'
import type { Violation } from '../../domain/rules/contract'

/**
 * TT-14, the violations panel — KB-6's third Plan-screen column ("Unseated rail, floorplan,
 * violations"). Written from TT-14's acceptance criteria and KB-5/KB-6, without opening
 * ViolationsPanel.tsx or ViolationsPanel.module.css.
 *
 * Fixtures build a `RuleReport`/`Violation` directly from `src/domain/rules/contract.ts` and
 * `engine.ts` — the engine's own types, not the module under test here, so importing their
 * shapes is not the trap that opening the panel's own source would be.
 */

function makeViolation(overrides: Partial<Violation> = {}): Violation {
  return {
    ruleId: 'fixture-rule',
    severity: 'hard',
    remedy: 'seating',
    tableIds: ['table-1'],
    guestIds: ['guest-1'],
    message: 'Fixture violation',
    ...overrides,
  }
}

function makeReport(violations: Violation[], ruleCount: number): RuleReport {
  return { violations, ruleCount }
}

function tabularTexts(container: HTMLElement): string[] {
  return Array.from(container.querySelectorAll(`.${tabularClass}`)).map((el) => el.textContent?.trim() ?? '')
}

describe('ViolationsPanel — a "Violations" heading (KB-6, the third Plan-screen column)', () => {
  it('renders a heading named "Violations"', () => {
    render(<ViolationsPanel report={makeReport([], 1)} />)
    expect(screen.getByRole('heading', { name: 'Violations' })).toBeInTheDocument()
  })
})

describe('ViolationsPanel — the header states how many rules are registered, pluralised at one (TT-14; KB-6 "1 rule registered")', () => {
  it('reads "3 rules registered" for three', () => {
    const { container } = render(<ViolationsPanel report={makeReport([], 3)} />)
    expect(container.textContent).toContain('3 rules registered')
  })

  it('reads "1 rule registered" for one, not "1 rules registered"', () => {
    const { container } = render(<ViolationsPanel report={makeReport([], 1)} />)
    expect(container.textContent).toContain('1 rule registered')
    expect(container.textContent).not.toContain('1 rules registered')
  })
})

describe('ViolationsPanel — a hard violation entry (TT-14; KB-6 "Hard · 9 of 8")', () => {
  it('carries data-severity="hard" and renders its message', () => {
    const violation = makeViolation({ severity: 'hard', message: 'Table 8 over capacity', detail: '9 of 8' })
    const { container } = render(<ViolationsPanel report={makeReport([violation], 1)} />)
    const entry = container.querySelector('[data-severity="hard"]')

    expect(entry).not.toBeNull()
    expect(entry?.textContent).toContain('Table 8 over capacity')
  })

  it('renders the severity word "Hard" in sentence case, its detail, and not "Soft"', () => {
    const violation = makeViolation({ severity: 'hard', message: 'Table 8 over capacity', detail: '9 of 8' })
    const { container } = render(<ViolationsPanel report={makeReport([violation], 1)} />)
    const entry = container.querySelector('[data-severity="hard"]')

    expect(entry?.textContent).toContain('Hard')
    expect(entry?.textContent).not.toContain('HARD')
    expect(entry?.textContent).toContain('9 of 8')
    expect(entry?.textContent).not.toContain('Soft')
  })
})

describe('ViolationsPanel — a soft violation entry (TT-14)', () => {
  it('carries data-severity="soft" and renders its message', () => {
    const violation = makeViolation({
      severity: 'soft',
      message: 'Priya Shah and Tom Okafor are not sitting together',
      detail: 'Table 3',
    })
    const { container } = render(<ViolationsPanel report={makeReport([violation], 1)} />)
    const entry = container.querySelector('[data-severity="soft"]')

    expect(entry).not.toBeNull()
    expect(entry?.textContent).toContain('Priya Shah and Tom Okafor are not sitting together')
  })

  it('renders the severity word "Soft" in sentence case, and not "Hard"', () => {
    const violation = makeViolation({
      severity: 'soft',
      message: 'Priya Shah and Tom Okafor are not sitting together',
      detail: 'Table 3',
    })
    const { container } = render(<ViolationsPanel report={makeReport([violation], 1)} />)
    const entry = container.querySelector('[data-severity="soft"]')

    expect(entry?.textContent).toContain('Soft')
    expect(entry?.textContent).not.toContain('SOFT')
    expect(entry?.textContent).not.toContain('Hard')
  })
})

describe('ViolationsPanel — hard violations are listed before soft ones (KB-6 layout)', () => {
  it('renders a hard entry before a soft one, even when the report lists the soft one first', () => {
    const soft = makeViolation({ severity: 'soft', message: 'Soft one' })
    const hard = makeViolation({ severity: 'hard', message: 'Hard one' })
    const { container } = render(<ViolationsPanel report={makeReport([soft, hard], 2)} />)

    const severities = Array.from(container.querySelectorAll('[data-severity]')).map((el) =>
      el.getAttribute('data-severity'),
    )
    expect(severities).toEqual(['hard', 'soft'])
  })

  it('renders every hard entry before every soft entry when there are several of each', () => {
    const violations = [
      makeViolation({ severity: 'soft', message: 'Soft one' }),
      makeViolation({ severity: 'hard', message: 'Hard one' }),
      makeViolation({ severity: 'soft', message: 'Soft two' }),
      makeViolation({ severity: 'hard', message: 'Hard two' }),
    ]
    const { container } = render(<ViolationsPanel report={makeReport(violations, 2)} />)

    const severities = Array.from(container.querySelectorAll('[data-severity]')).map((el) =>
      el.getAttribute('data-severity'),
    )
    expect(severities).toEqual(['hard', 'hard', 'soft', 'soft'])
  })
})

describe('ViolationsPanel — a clean plan renders a sentence, not a list (TT-14 "reads as deliberate, not as broken")', () => {
  it('renders no list and no data-severity entries when there are no violations', () => {
    const { container } = render(<ViolationsPanel report={makeReport([], 3)} />)

    expect(screen.queryByRole('list')).not.toBeInTheDocument()
    expect(container.querySelectorAll('[data-severity]')).toHaveLength(0)
  })

  it('still says something concrete about the clean state, beyond the heading and the rule count', () => {
    const { container } = render(<ViolationsPanel report={makeReport([], 3)} />)
    const remainder = (container.textContent ?? '')
      .replace('Violations', '')
      .replace('3 rules registered', '')
      .trim()

    expect(remainder.length).toBeGreaterThan(0)
  })
})

describe('ViolationsPanel — the clean state carries no success wording (KB-5 "There is no success colour")', () => {
  it('contains no "success" anywhere in the rendered text', () => {
    const { container } = render(<ViolationsPanel report={makeReport([], 3)} />)
    expect(container.textContent ?? '').not.toMatch(/success/i)
  })
})

describe('ViolationsPanel — the registered-rule count is a tabular figure (KB-5 "tabular figures on every number that updates")', () => {
  it('carries the tabular class for three rules registered', () => {
    const { container } = render(<ViolationsPanel report={makeReport([], 3)} />)
    expect(tabularTexts(container)).toContain('3')
  })

  it('carries the tabular class for one rule registered', () => {
    const { container } = render(<ViolationsPanel report={makeReport([], 1)} />)
    expect(tabularTexts(container)).toContain('1')
  })
})

describe('ViolationsPanel — a violation with no detail renders cleanly (Finding.detail is optional)', () => {
  it('renders the message and severity word with no literal "undefined" or "null"', () => {
    const violation = makeViolation({ severity: 'hard', message: 'Table 8 over capacity' })
    const { container } = render(<ViolationsPanel report={makeReport([violation], 1)} />)
    const text = container.textContent ?? ''

    expect(text).toContain('Table 8 over capacity')
    expect(text).not.toContain('undefined')
    expect(text).not.toContain('null')
  })
})

describe('ViolationsPanel — the footer states what is true, and never implies a publish feature (AC20; TT-34, "Share a read-only plan", is unbuilt)', () => {
  it('reads "One hard violation needs fixing." when there is exactly one hard violation', () => {
    const violation = makeViolation({ severity: 'hard' })
    const { container } = render(<ViolationsPanel report={makeReport([violation], 1)} />)
    const text = container.textContent ?? ''

    expect(text).toContain('One hard violation needs fixing.')
    expect(text).not.toMatch(/publish/i)
  })

  it('pluralises honestly when there is more than one hard violation, rather than reusing the singular line', () => {
    const violations = [
      makeViolation({ severity: 'hard', tableIds: ['table-1'] }),
      makeViolation({ severity: 'hard', tableIds: ['table-2'] }),
    ]
    const { container } = render(<ViolationsPanel report={makeReport(violations, 1)} />)
    const text = container.textContent ?? ''

    expect(text).toContain('2 hard violations need fixing.')
    expect(text).not.toContain('One hard violation')
    expect(text).not.toMatch(/publish/i)
  })

  it('reads "Nothing is blocking this plan." when only soft violations are present', () => {
    const violation = makeViolation({ severity: 'soft' })
    const { container } = render(<ViolationsPanel report={makeReport([violation], 1)} />)
    const text = container.textContent ?? ''

    expect(text).toContain('Nothing is blocking this plan.')
    expect(text).not.toMatch(/publish/i)
  })

  it('reads "No violations." when the plan has none at all', () => {
    const { container } = render(<ViolationsPanel report={makeReport([], 1)} />)
    const text = container.textContent ?? ''

    expect(text).toContain('No violations.')
    expect(text).not.toMatch(/publish/i)
  })

  // The scope decision behind AC20: TT-34 is the ticket for a publish/share feature and it
  // is not built. "publish" alone already catches "publishing" as a substring, but both are
  // asserted because that is the exact tripwire AC20 names, and the handoff's own copy for
  // this footer — "One hard violation stops this plan publishing" — is the wording this
  // guards against.
  it('never contains "publish" or "publishing" in any of the four footer states', () => {
    const reports = [
      makeReport([makeViolation({ severity: 'hard' })], 1),
      makeReport(
        [makeViolation({ severity: 'hard', tableIds: ['table-1'] }), makeViolation({ severity: 'hard', tableIds: ['table-2'] })],
        1,
      ),
      makeReport([makeViolation({ severity: 'soft' })], 1),
      makeReport([], 1),
    ]

    for (const report of reports) {
      const { container, unmount } = render(<ViolationsPanel report={report} />)
      const text = container.textContent ?? ''
      expect(text).not.toContain('publish')
      expect(text).not.toContain('publishing')
      unmount()
    }
  })
})
