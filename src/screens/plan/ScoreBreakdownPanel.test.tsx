import { describe, expect, it, vi } from 'vitest'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { ScoreBreakdownPanel } from './ScoreBreakdownPanel'
import { tabularClass } from '../../ui'
import type { ScoreDimension } from '../../domain/rules/score'

/**
 * TT-16's score breakdown panel — the third column's new state, beside the violations panel
 * (untouched) and TT-15's table detail (untouched). Written from the ticket's acceptance
 * criteria and the props contract `{ id, dimensions, onDismiss }`, against `ScoreDimension`
 * (score.ts's own exported type — a type import, not the implementation). Does not open
 * ScoreBreakdownPanel.tsx or ScoreBreakdownPanel.module.css.
 *
 * `missed` is the exact, unrounded count of chances this dimension's rule did not take — never
 * `findings.length`. It is what the panel renders as "N of M missed", including when the fit
 * rounds to 100%.
 *
 * Fixtures build `ScoreDimension` values directly, the same convention ViolationsPanel.test.tsx
 * already uses for `RuleReport`/`Violation`.
 */

function makeDimension(overrides: Partial<ScoreDimension> & Pick<ScoreDimension, 'ruleId'>): ScoreDimension {
  return {
    description: `Fixture description for ${overrides.ruleId}`,
    weight: 1,
    opportunities: 4,
    missed: 1,
    fit: 0.75,
    ...overrides,
  }
}

function textOf(element: Element | null | undefined): string {
  return element?.textContent?.replace(/\s+/g, ' ').trim() ?? ''
}

describe('ScoreBreakdownPanel — a "Score breakdown" heading', () => {
  it('renders a heading named "Score breakdown"', () => {
    render(<ScoreBreakdownPanel id="breakdown" dimensions={[]} onDismiss={vi.fn()} />)
    expect(screen.getByRole('heading', { name: 'Score breakdown' })).toBeInTheDocument()
  })
})

describe('ScoreBreakdownPanel — one row per dimension, in the order given, each showing its own description verbatim', () => {
  it('renders both dimensions, each carrying its own description, in the given order', () => {
    const dimensions: ScoreDimension[] = [
      makeDimension({ ruleId: 'first-rule', description: 'The first rule reads exactly this' }),
      makeDimension({ ruleId: 'second-rule', description: 'The second rule reads exactly this' }),
    ]
    render(<ScoreBreakdownPanel id="breakdown" dimensions={dimensions} onDismiss={vi.fn()} />)

    const rows = within(screen.getByRole('list')).getAllByRole('listitem')
    expect(rows).toHaveLength(2)
    expect(textOf(rows[0])).toContain('The first rule reads exactly this')
    expect(textOf(rows[1])).toContain('The second rule reads exactly this')
  })
})

describe('ScoreBreakdownPanel — the fit and the exact missed count', () => {
  it('a dimension with 3 missed chances in 12 opportunities renders "75%" and "3 of 12 missed", both tabular', () => {
    const dimension = makeDimension({ ruleId: 'partners-adjacent', opportunities: 12, missed: 3, fit: 0.75 })
    render(<ScoreBreakdownPanel id="breakdown" dimensions={[dimension]} onDismiss={vi.fn()} />)

    const row = within(screen.getByRole('list')).getAllByRole('listitem')[0]
    if (!row) throw new Error('expected one row')
    expect(textOf(row)).toContain('75%')
    expect(textOf(row)).toContain('3 of 12 missed')

    const tabularTexts = Array.from(row.querySelectorAll(`.${tabularClass}`)).map((el) => el.textContent?.trim())
    expect(tabularTexts).toContain('75')
    expect(tabularTexts).toContain('3')
    expect(tabularTexts).toContain('12')
  })

  it('a dimension with 1 missed chance in 200 opportunities renders "1 of 200 missed" even though its fit renders as "100%"', () => {
    // 1 - 1/200 = 0.995, which rounds to 100% — the exact case the no-cap decision relies on the
    // breakdown to make visible.
    const dimension = makeDimension({ ruleId: 'celebrity-scale', opportunities: 200, missed: 1, fit: 0.995 })
    render(<ScoreBreakdownPanel id="breakdown" dimensions={[dimension]} onDismiss={vi.fn()} />)

    const row = within(screen.getByRole('list')).getAllByRole('listitem')[0]
    if (!row) throw new Error('expected one row')
    expect(textOf(row)).toContain('100%')
    expect(textOf(row)).toContain('1 of 200 missed')
  })
})

describe('ScoreBreakdownPanel — a non-1 weight is shown, and a weight of 1 is not', () => {
  it('a dimension weighted 3 renders "counts ×3"; a dimension weighted 1 renders no weight wording at all', () => {
    const weighted = makeDimension({ ruleId: 'heavy-rule', weight: 3 })
    const unweighted = makeDimension({ ruleId: 'light-rule', weight: 1 })
    render(<ScoreBreakdownPanel id="breakdown" dimensions={[weighted, unweighted]} onDismiss={vi.fn()} />)

    const rows = within(screen.getByRole('list')).getAllByRole('listitem')
    const heavyRow = rows.find((row) => textOf(row).includes('Fixture description for heavy-rule'))
    const lightRow = rows.find((row) => textOf(row).includes('Fixture description for light-rule'))
    if (!heavyRow || !lightRow) throw new Error('expected to find both rows by their own description')

    expect(textOf(heavyRow)).toMatch(/counts\s*×\s*3/)
    expect(textOf(lightRow)).not.toMatch(/counts\s*×/)
    expect(textOf(lightRow)).not.toMatch(/×\s*1\b/)
  })
})

describe('ScoreBreakdownPanel — a dimension\'s label is whatever description it was given, and nothing else', () => {
  it('an invented description the panel could never have hardcoded renders verbatim, with no rule id shown and no substitution', () => {
    const dimension = makeDimension({
      ruleId: 'zz-never-hardcoded-id',
      description: 'Zebra crossings should not be scheduled during the speeches',
    })
    const { container } = render(<ScoreBreakdownPanel id="breakdown" dimensions={[dimension]} onDismiss={vi.fn()} />)

    expect(container.textContent).toContain('Zebra crossings should not be scheduled during the speeches')
    expect(container.textContent).not.toContain('zz-never-hardcoded-id')
  })
})

describe('ScoreBreakdownPanel — the dismiss control', () => {
  it('is named "Close score breakdown", distinct from "Close table detail", and calls onDismiss once when clicked', async () => {
    const user = userEvent.setup()
    const onDismiss = vi.fn()
    render(<ScoreBreakdownPanel id="breakdown" dimensions={[]} onDismiss={onDismiss} />)

    const dismissButton = screen.getByRole('button', { name: 'Close score breakdown' })
    expect(screen.queryByRole('button', { name: 'Close table detail' })).not.toBeInTheDocument()

    await user.click(dismissButton)

    expect(onDismiss).toHaveBeenCalledTimes(1)
  })
})

describe('ScoreBreakdownPanel — no dimension uses the soft-violation bar idiom', () => {
  it('no element in the panel carries data-severity, and the stylesheet declares no --hard or --soft colour for a row', () => {
    const dimensions: ScoreDimension[] = [
      makeDimension({ ruleId: 'a' }),
      makeDimension({ ruleId: 'b', missed: 0, fit: 1 }),
    ]
    const { container } = render(<ScoreBreakdownPanel id="breakdown" dimensions={dimensions} onDismiss={vi.fn()} />)

    expect(container.querySelectorAll('[data-severity]')).toHaveLength(0)

    const dir = dirname(fileURLToPath(import.meta.url))
    const css = readFileSync(join(dir, 'ScoreBreakdownPanel.module.css'), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '')
    expect(css).not.toMatch(/var\(--hard\)/)
    expect(css).not.toMatch(/var\(--soft\)/)
  })
})
