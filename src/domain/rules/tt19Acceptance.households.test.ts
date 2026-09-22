import { describe, expect, it } from 'vitest'
import { readFileSync, readdirSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { allocate } from '../allocate'
import { roundTableId } from '../seating'
import { evaluatePlan, hardViolations, isPublishable, softViolations } from './engine'
import { evaluateRegistered, REGISTERED_RULES } from './registry'
import { ruleCoverage } from './ruleCoverage'
import type { Guest, Pin, RoomConfig } from '../types'
import type { ScenarioId } from '../scenarios'

/**
 * TT-19 — independent end-to-end pass over the household-together rule's registration and its
 * firing behaviour, driven over the real registry (`REGISTERED_RULES`, `evaluateRegistered`) and
 * the "Small and cosy" scenario, following the `tt46Acceptance.*` / `tt53Acceptance.*` naming
 * already in the repo. Written from `.claude/plans/TT-19.md` section 3 (criteria 4, 5, 6, 7, 8,
 * 11, 12, 14) and TT-14's own conformance precedent (`registry.test.ts`). Does not open
 * householdTogether.rule.ts, registry.ts, engine.ts, ruleCoverage.ts or contract.ts.
 *
 * "Small and cosy" (KB-3) carries 40 guests across 22 households, 14 of them multi-member and 3
 * of those (`h-2`: 3, `h-3`: 4, `h-10`: 3) of three or more — counted directly off the scenario's
 * own JSON below rather than assumed. `h-3`'s four members (`g-016`..`g-019`) are the household
 * pinned apart or together in the fixtures below: pins are honoured regardless of any rule's
 * severity (TT-46's own "a pin alone is enough to seat a guest"), and household-together is a
 * soft, `remedy: 'seating'` rule — never part of the hard-seating guard `seatGuardFrom` builds
 * (`GuardableRule` is `severity: 'hard'` only) — so it can never block a pin or a placement.
 *
 * Criterion 6 (the panel lists the rule by name, at its severity, in the panel's existing order)
 * is left to `RulesApplied`'s own registry-driven tests plus the count bump in
 * `tt53Acceptance.ruleCoverage.test.tsx`, per the plan: which screen column the line lands in is
 * not something this file, or jsdom, can see.
 */

const DIR = dirname(fileURLToPath(import.meta.url))

type ScenarioFixture = { meta: { tables: RoomConfig }; guests: Guest[] }

function readScenario(id: ScenarioId): ScenarioFixture {
  const path = join(DIR, '../../../public/scenarios', `${id}.json`)
  return JSON.parse(readFileSync(path, 'utf8')) as ScenarioFixture
}

/** Every *.rule.ts file under this directory except household-together's own — "the count of
 *  rules that existed before", counted off disk rather than hand-typed, since the plan is explicit
 *  that this is "not necessarily from 4" if another rule ticket lands first. */
function priorRuleFilesOnDisk(): string[] {
  return readdirSync(DIR, { withFileTypes: true })
    .filter((entry) => entry.isFile() && entry.name.endsWith('.rule.ts') && entry.name !== 'householdTogether.rule.ts')
    .map((entry) => entry.name)
}

describe('household-together registers itself through the glob alone, with no edit to any shared file (criteria 4, 5)', () => {
  it('REGISTERED_RULES contains a rule with id "household-together", at severity "soft"', () => {
    const found = REGISTERED_RULES.find((rule) => rule.id === 'household-together')

    expect(found).toBeDefined()
    expect(found?.severity).toBe('soft')
  })

  it('REGISTERED_RULES.length is exactly one higher than the count of *.rule.ts files that are not this one', () => {
    expect(REGISTERED_RULES.length).toBe(priorRuleFilesOnDisk().length + 1)
  })
})

describe('the panel header and coverage line move by exactly one rule, against the same declared 10 (criteria 7, 8)', () => {
  it('ruleCoverage().registered equals REGISTERED_RULES.length, one higher than before, with declared unchanged at 10', () => {
    const coverage = ruleCoverage()

    expect(coverage.registered).toBe(REGISTERED_RULES.length)
    expect(coverage.registered).toBe(priorRuleFilesOnDisk().length + 1)
    expect(coverage.declared).toBe(10)
  })
})

describe('household-together fires on "Small and cosy" arranged to break it, and stays quiet arranged not to (criteria 11, 4)', () => {
  /** h-3's four members (`g-016`..`g-019`), pinned across three distinct round tables — three or
   *  more, so KB-2's row fires. Everything else is left to Auto-allocate, exactly as
   *  `allocateWithRules.test.ts` drives the same scenario. */
  function splitPins(): Pin[] {
    return [
      { guestId: 'g-016', tableId: roundTableId(1) },
      { guestId: 'g-017', tableId: roundTableId(2) },
      { guestId: 'g-018', tableId: roundTableId(3) },
      { guestId: 'g-019', tableId: roundTableId(1) },
    ]
  }

  /** The same four, pinned together at one table instead — two or fewer tables, so the same row is
   *  quiet. */
  function gatheredPins(): Pin[] {
    return [
      { guestId: 'g-016', tableId: roundTableId(1) },
      { guestId: 'g-017', tableId: roundTableId(1) },
      { guestId: 'g-018', tableId: roundTableId(1) },
      { guestId: 'g-019', tableId: roundTableId(1) },
    ]
  }

  it('confirms the fixture: h-3 has three or more members, and is a multi-member household among 14 on this scenario', () => {
    const { guests } = readScenario('small-and-cosy')
    const byHousehold = new Map<string, string[]>()
    for (const guest of guests) {
      if (guest.household) {
        byHousehold.set(guest.household, [...(byHousehold.get(guest.household) ?? []), guest.id])
      }
    }
    const multiMember = [...byHousehold.values()].filter((members) => members.length >= 2)
    const threeOrMore = [...byHousehold.values()].filter((members) => members.length >= 3)

    expect(multiMember).toHaveLength(14)
    expect(threeOrMore).toHaveLength(3)
    expect(byHousehold.get('h-3')?.sort()).toEqual(['g-016', 'g-017', 'g-018', 'g-019'])
  })

  it('split across three tables: a household-together entry in softViolations, and none in hardViolations', () => {
    const { meta, guests } = readScenario('small-and-cosy')
    const plan = allocate(meta.tables, guests, splitPins())

    const report = evaluateRegistered(plan)
    const householdFindings = softViolations(report).filter((violation) => violation.ruleId === 'household-together')

    expect(householdFindings.length).toBeGreaterThan(0)
    expect(householdFindings[0]?.guestIds).toEqual(expect.arrayContaining(['g-016', 'g-017', 'g-018', 'g-019']))
    expect(hardViolations(report)).toEqual([])
  })

  it('gathered at one table: no household-together entry anywhere in the report', () => {
    const { meta, guests } = readScenario('small-and-cosy')
    const plan = allocate(meta.tables, guests, gatheredPins())

    const report = evaluateRegistered(plan)
    const householdFindings = report.violations.filter((violation) => violation.ruleId === 'household-together')

    expect(householdFindings).toEqual([])
  })

  it('is publishable is unchanged by the presence of a household-together violation on an otherwise clean plan (criterion 14)', () => {
    const { meta, guests } = readScenario('small-and-cosy')
    const splitPlan = allocate(meta.tables, guests, splitPins())
    const gatheredPlan = allocate(meta.tables, guests, gatheredPins())

    const splitReport = evaluateRegistered(splitPlan)
    const gatheredReport = evaluateRegistered(gatheredPlan)

    // The split arrangement genuinely carries a household-together violation; the gathered one
    // does not. Both, soft-only, are equally publishable — a soft violation is never a blocker.
    expect(softViolations(splitReport).some((v) => v.ruleId === 'household-together')).toBe(true)
    expect(isPublishable(splitReport)).toBe(true)
    expect(isPublishable(gatheredReport)).toBe(true)
  })
})

describe('household-together is pure, order-independent and deterministic (criterion 12)', () => {
  it('evaluating the registry in reverse order gives the same violations and outcomes as forward order, on a plan that makes the rule fire', () => {
    const { meta, guests } = readScenario('small-and-cosy')
    const pins: Pin[] = [
      { guestId: 'g-016', tableId: roundTableId(1) },
      { guestId: 'g-017', tableId: roundTableId(2) },
      { guestId: 'g-018', tableId: roundTableId(3) },
      { guestId: 'g-019', tableId: roundTableId(1) },
    ]
    const plan = allocate(meta.tables, guests, pins)

    const forward = evaluatePlan(plan, REGISTERED_RULES)
    const reversed = evaluatePlan(plan, [...REGISTERED_RULES].reverse())

    const sortedViolations = (violations: typeof forward.violations) =>
      violations.map((violation) => JSON.stringify(violation)).sort()
    const sortedOutcomes = (outcomes: typeof forward.outcomes) =>
      outcomes.map((outcome) => JSON.stringify(outcome)).sort()

    expect(sortedViolations(reversed.violations)).toEqual(sortedViolations(forward.violations))
    expect(sortedOutcomes(reversed.outcomes)).toEqual(sortedOutcomes(forward.outcomes))
  })

  it('evaluating the same plan twice through the registry gives an identical result, and never mutates the plan it is given', () => {
    const { meta, guests } = readScenario('small-and-cosy')
    const pins: Pin[] = [
      { guestId: 'g-016', tableId: roundTableId(1) },
      { guestId: 'g-017', tableId: roundTableId(2) },
      { guestId: 'g-018', tableId: roundTableId(3) },
      { guestId: 'g-019', tableId: roundTableId(1) },
    ]
    const plan = allocate(meta.tables, guests, pins)
    const beforeSnapshot = JSON.stringify(plan)

    const first = evaluateRegistered(plan)
    const second = evaluateRegistered(plan)

    expect(second).toEqual(first)
    expect(JSON.stringify(plan)).toEqual(beforeSnapshot)
  })
})
