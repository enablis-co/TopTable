import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { ageBandFromYears, isAgeBand } from './types'
import { ageBand as generatorAgeBand } from '../../scripts/generate-scenarios.mjs'

/**
 * TT-5. Guards two things about the shipped scenario data under public/scenarios/:
 *
 * - C16: every guest in every file carries an age band, never a number.
 * - C17: regenerating the scenarios changes `age` and nothing else. Household count, conflict-pair
 *   count, tag count and accessibility count are asserted against KB-3's own published
 *   per-scenario figures (verified directly against KB-3, "Guest data and scenarios", not copied
 *   from the plan) — 35 households / 3 conflict pairs / 9 tags for "Adding up"; 96 households / 9
 *   conflict pairs / 11 tags / 21 accessibility needs for "Celebrity scale"; one conflict pair for
 *   "Small and cosy". None of these fields are touched by the age-band regeneration, so they are a
 *   stable target for the assertion regardless of when the file was last regenerated.
 *
 * A new file rather than an addition to scenarios.test.ts (TT-4's), so the two tickets' tests
 * stay separable — per .claude/plans/TT-5.md. This is the only test in the whole suite that can
 * catch a botched regeneration: meta.guests still reads 40/70/200 regardless of what the RNG
 * stream produced, and scenarios.test.ts types each file's `guests` as `unknown[]` and asserts
 * nothing about guest contents.
 *
 * Reads the real files with node:fs, in the manner of scenarios.test.ts. Imports only
 * `isAgeBand` from src/domain/types.ts, a public signature declared in the plan's section 4 —
 * does not open src/domain/guests.ts or the implementation of src/domain/types.ts itself.
 *
 * KB-3 does not publish a couple count or an allergy count for any scenario, so C17's mention of
 * those two (in the criterion's own prose, not in its cited figures) is not asserted here against
 * an invented number — see the tester's report.
 *
 * ADDITION (model-developer, TT-5/TT-6 review fix): the two describes above cannot catch a
 * moved age-band boundary. `isAgeBand` only confirms the result is one of the four valid
 * strings, not which years map to which band, and none of the KB-3 counts above change if a
 * boundary shifts — change the generator's `years < 10` to `years < 12` and every assertion in
 * this file still passes while the shipped data and the guest form's labels disagree about
 * what a nine-year-old is. Review found this file was not, in fact, the guard the plan claimed
 * it to be. Closed below by importing both `ageBand` (`scripts/generate-scenarios.mjs`) and
 * `ageBandFromYears` (`src/domain/types.ts`) directly and checking them against each other,
 * and against the published boundary, at every edge. Unlike the tests above, this one reads
 * both implementations rather than only a public predicate — it is a bug-guard, not a
 * black-box acceptance test, and says so rather than pretending otherwise.
 *
 * `generate-scenarios.mjs` is safe to import here: its build-and-write driver only runs when
 * the file is executed directly (`npm run generate:scenarios`), behind an `isMain` check, so
 * importing it for `ageBand` alone writes no file and prints nothing.
 */

const DIR = dirname(fileURLToPath(import.meta.url))

type ScenarioGuest = {
  id: string
  age: unknown
  household: string | null
  conflictsWith: string[]
  tags: string[]
  accessibility: string[]
}

type ScenarioFile = {
  meta: { scenario: string; guests: number }
  guests: ScenarioGuest[]
}

function readScenarioFile(fileName: string): ScenarioFile {
  const path = join(DIR, '../../public/scenarios', fileName)
  return JSON.parse(readFileSync(path, 'utf8')) as ScenarioFile
}

function householdCount(file: ScenarioFile): number {
  const households = new Set(
    file.guests.map((g) => g.household).filter((household): household is string => household !== null),
  )
  return households.size
}

function conflictPairCount(file: ScenarioFile): number {
  const total = file.guests.reduce((sum, g) => sum + g.conflictsWith.length, 0)
  return total / 2
}

function tagCount(file: ScenarioFile): number {
  const tags = new Set<string>()
  for (const guest of file.guests) {
    for (const tag of guest.tags) tags.add(tag)
  }
  return tags.size
}

function accessibilityNeedCount(file: ScenarioFile): number {
  return file.guests.filter((g) => g.accessibility.length > 0).length
}

describe('every shipped guest carries an age band, never a number (C16)', () => {
  it('small-and-cosy.json: every guest satisfies isAgeBand', () => {
    const file = readScenarioFile('small-and-cosy.json')

    expect(file.guests.length).toBeGreaterThan(0)
    for (const guest of file.guests) {
      expect(isAgeBand(guest.age), `${guest.id}: age ${JSON.stringify(guest.age)} is not a band`).toBe(true)
    }
  })

  it('adding-up.json: every guest satisfies isAgeBand', () => {
    const file = readScenarioFile('adding-up.json')

    expect(file.guests.length).toBeGreaterThan(0)
    for (const guest of file.guests) {
      expect(isAgeBand(guest.age), `${guest.id}: age ${JSON.stringify(guest.age)} is not a band`).toBe(true)
    }
  })

  it('celebrity-scale.json: every guest satisfies isAgeBand', () => {
    const file = readScenarioFile('celebrity-scale.json')

    expect(file.guests.length).toBeGreaterThan(0)
    for (const guest of file.guests) {
      expect(isAgeBand(guest.age), `${guest.id}: age ${JSON.stringify(guest.age)} is not a band`).toBe(true)
    }
  })
})

describe('regenerating changes age and nothing else (C17)', () => {
  it('small-and-cosy: one conflict pair (KB-3)', () => {
    const file = readScenarioFile('small-and-cosy.json')

    expect(conflictPairCount(file)).toBe(1)
  })

  it('adding-up: 35 households, 3 conflict pairs, 9 tags (KB-3)', () => {
    const file = readScenarioFile('adding-up.json')

    expect(householdCount(file)).toBe(35)
    expect(conflictPairCount(file)).toBe(3)
    expect(tagCount(file)).toBe(9)
  })

  it('celebrity-scale: 96 households, 9 conflict pairs, 11 tags, 21 accessibility needs (KB-3)', () => {
    const file = readScenarioFile('celebrity-scale.json')

    expect(householdCount(file)).toBe(96)
    expect(conflictPairCount(file)).toBe(9)
    expect(tagCount(file)).toBe(11)
    expect(accessibilityNeedCount(file)).toBe(21)
  })
})

describe('the generator and the domain agree on the 4/10/18 boundaries, edge by edge', () => {
  it.each([
    [3, 'baby'],
    [4, 'child'],
    [9, 'child'],
    [10, 'teen'],
    [17, 'teen'],
    [18, 'adult'],
  ] as const)('age %i bands as %s in both the generator and the domain', (years, expected) => {
    expect(generatorAgeBand(years)).toBe(expected)
    expect(ageBandFromYears(years)).toBe(expected)
  })

  it('agree at every age from 0 to 100, not only the six named edges', () => {
    for (let years = 0; years <= 100; years++) {
      expect(generatorAgeBand(years)).toBe(ageBandFromYears(years))
    }
  })
})
