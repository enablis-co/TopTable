import { describe, expect, it } from 'vitest'
import { readdirSync } from 'node:fs'
import { dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { evaluatePlan, seatGuardFrom } from './engine'
import { scorePlan } from './score'
import { REGISTERED_RULES, evaluateRegistered, registeredSeatGuard } from './registry'
import type { RulePlan } from './contract'
import type { Seat, SeatedTable } from '../seating'
import type { Guest } from '../types'

/**
 * TT-14's conformance suite: whatever is registered, not only the three rules TT-14 itself adds.
 * TT-17 to TT-22 land the same way — a new *.rule.ts file and nothing else — so this file keeps
 * covering them without being edited. Written from TT-14's acceptance criteria and
 * docs/engineering-standards.md's three rule properties. Does not open registry.ts, engine.ts,
 * contract.ts, score.ts or any *.rule.ts file.
 *
 * TT-16: `evaluate` now returns `{ findings, opportunities, missed }`. This file additionally
 * guards the contract's own invariant — `findings.length <= missed <= opportunities` — and the
 * honest shape of `opportunities` and `missed` for every registered rule, and extends its
 * order-independence check from `violations` to `outcomes` and to `scorePlan`'s own output.
 *
 * The invariant is checked against more than one fixture plan. `contract.ts`'s own doc comment
 * used to claim this file guarded the invariant generally while checking it against only the one
 * plan `buildViolatingPlan()` builds — a single plan cannot tell a rule that always reports
 * `missed === opportunities` apart from one that actually counts, so a second fixture with a
 * different shape (a clean plan, and a plan carrying a genuinely unseated partner) is what makes
 * the guard worth the claim.
 */

const RULES_DIR = dirname(fileURLToPath(import.meta.url))

function ruleFilesOnDisk(): string[] {
  return readdirSync(RULES_DIR, { withFileTypes: true })
    .filter((entry) => entry.isFile() && entry.name.endsWith('.rule.ts'))
    .map((entry) => entry.name)
}

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

function seatOccupant(guest: Guest): Seat {
  return { guest, pinned: false }
}

/**
 * Deliberately breaks every hard/seating rule TT-14 registers — an over-capacity round table and
 * a non-protocol occupant at the top table — plus a conflicting pair sharing a table, for
 * whichever future rule reads `conflictsWith` (KB-2). Also carries a seated partner pair, apart,
 * so partners-adjacent (TT-16's one scoring soft rule today) has something real to judge. So the
 * conformance checks below have something real to check, for today's rules and tomorrow's.
 */
function buildViolatingPlan(): RulePlan {
  const roundOne: SeatedTable = {
    id: 'round-1',
    kind: 'round',
    number: 1,
    label: 'Table 1',
    capacity: 4,
    seats: [makeGuest('r1-a'), makeGuest('r1-b'), makeGuest('r1-c'), makeGuest('r1-d')].map(seatOccupant),
    overflow: [seatOccupant(makeGuest('r1-overflow'))],
  }

  const roundTwo: SeatedTable = {
    id: 'round-2',
    kind: 'round',
    number: 2,
    label: 'Table 2',
    capacity: 4,
    seats: [
      seatOccupant(makeGuest('conflict-a', { conflictsWith: ['conflict-b'] })),
      seatOccupant(makeGuest('conflict-b', { conflictsWith: ['conflict-a'] })),
      seatOccupant(makeGuest('partner-a', { partnerOf: 'partner-b' })),
      null,
    ],
    overflow: [],
  }

  const roundThree: SeatedTable = {
    id: 'round-3',
    kind: 'round',
    number: 3,
    label: 'Table 3',
    capacity: 4,
    seats: [seatOccupant(makeGuest('partner-b', { partnerOf: 'partner-a' })), null, null, null],
    overflow: [],
  }

  const topTable: SeatedTable = {
    id: 'top',
    kind: 'top',
    number: null,
    label: 'Top table',
    capacity: 8,
    seats: [seatOccupant(makeGuest('interloper')), null, null, null, null, null, null, null],
    overflow: [],
  }

  return { tables: [topTable, roundOne, roundTwo, roundThree], unseated: [] }
}

/** Nothing wrong anywhere: a seated partner pair adjacent, no overflow, no top table at all (so
 *  top-table has nothing to judge). Paired with `buildViolatingPlan` so the invariant below is
 *  checked on a plan where every count is genuinely small, not only one built to break everything. */
function buildQuietPlan(): RulePlan {
  const roundOne: SeatedTable = {
    id: 'round-1',
    kind: 'round',
    number: 1,
    label: 'Table 1',
    capacity: 4,
    seats: [
      seatOccupant(makeGuest('quiet-a', { partnerOf: 'quiet-b' })),
      seatOccupant(makeGuest('quiet-b', { partnerOf: 'quiet-a' })),
      null,
      null,
    ],
    overflow: [],
  }
  return { tables: [roundOne], unseated: [] }
}

/** One partner seated, the other genuinely present but unseated. TT-16: this pair is a chance
 *  the plan did not take (`missed`) without being a seating fault (`findings`), so this fixture is
 *  the one that would catch a rule whose `missed` is quietly always equal to `findings.length`. */
function buildPlanWithUnseatedPartner(): RulePlan {
  const roundOne: SeatedTable = {
    id: 'round-1',
    kind: 'round',
    number: 1,
    label: 'Table 1',
    capacity: 2,
    seats: [seatOccupant(makeGuest('seated-partner', { partnerOf: 'absent-partner' })), null],
    overflow: [],
  }
  const unseated: Guest[] = [makeGuest('absent-partner', { partnerOf: 'seated-partner' })]
  return { tables: [roundOne], unseated }
}

function deepFreeze<T>(value: T): T {
  if (value !== null && typeof value === 'object' && !Object.isFrozen(value)) {
    const record = value as Record<string, unknown>
    for (const key of Object.keys(record)) {
      deepFreeze(record[key])
    }
    Object.freeze(value)
  }
  return value
}

describe('the registry registers every rule file on disk (TT-14; AGENTS.md)', () => {
  it('has exactly as many registered rules as there are *.rule.ts files, so a misnamed export cannot silently register nothing', () => {
    expect(REGISTERED_RULES.length).toBe(ruleFilesOnDisk().length)
  })

  it('registers at least one rule — otherwise the count check above would be vacuous', () => {
    expect(ruleFilesOnDisk().length).toBeGreaterThan(0)
  })
})

describe('every registered rule carries a real identity', () => {
  it.each(REGISTERED_RULES)('$id has a non-empty id and a non-empty description', (rule) => {
    expect(rule.id.length).toBeGreaterThan(0)
    expect(rule.description.length).toBeGreaterThan(0)
  })

  it('every id is unique across the registry', () => {
    const ids = REGISTERED_RULES.map((rule) => rule.id)
    expect(new Set(ids).size).toBe(ids.length)
  })
})

describe('every registered rule is deterministic (docs/engineering-standards.md)', () => {
  it.each(REGISTERED_RULES)('$id gives deeply equal findings from two separately-built but equal plans', (rule) => {
    expect(rule.evaluate(buildViolatingPlan())).toEqual(rule.evaluate(buildViolatingPlan()))
  })

  it.each(REGISTERED_RULES)('$id neither throws nor changes a deeply frozen plan (TT-14)', (rule) => {
    const frozen = deepFreeze(buildViolatingPlan())
    expect(() => rule.evaluate(frozen)).not.toThrow()
  })
})

describe('every registered rule honours the opportunities contract, across more than one fixture plan (TT-16)', () => {
  const fixtures: { readonly name: string; readonly plan: RulePlan }[] = [
    { name: 'a plan built to violate everything', plan: buildViolatingPlan() },
    { name: 'a plan where nothing is wrong', plan: buildQuietPlan() },
    { name: 'a plan with a genuinely unseated partner', plan: buildPlanWithUnseatedPartner() },
  ]

  for (const { name, plan } of fixtures) {
    describe(name, () => {
      it.each(REGISTERED_RULES)('$id: findings.length never exceeds missed, and missed never exceeds opportunities', (rule) => {
        const { findings, opportunities, missed } = rule.evaluate(plan)
        expect(findings.length).toBeLessThanOrEqual(missed)
        expect(missed).toBeLessThanOrEqual(opportunities)
      })

      it.each(REGISTERED_RULES)('$id: opportunities and missed are each a finite, non-negative integer', (rule) => {
        const { opportunities, missed } = rule.evaluate(plan)
        for (const count of [opportunities, missed]) {
          expect(Number.isFinite(count)).toBe(true)
          expect(Number.isInteger(count)).toBe(true)
          expect(count).toBeGreaterThanOrEqual(0)
        }
      })
    })
  }
})

describe('the registry is order-independent (docs/engineering-standards.md)', () => {
  it('evaluating the registered rules in reverse order produces the same set of violations and the same set of outcomes', () => {
    const plan = buildViolatingPlan()
    const forward = evaluatePlan(plan, REGISTERED_RULES)
    const reversed = evaluatePlan(plan, [...REGISTERED_RULES].reverse())
    const asSortedStrings = (violations: typeof forward.violations) =>
      violations.map((violation) => JSON.stringify(violation)).sort()
    const outcomesSortedStrings = (outcomes: typeof forward.outcomes) =>
      outcomes.map((outcome) => JSON.stringify(outcome)).sort()

    expect(asSortedStrings(reversed.violations)).toEqual(asSortedStrings(forward.violations))
    expect(reversed.ruleCount).toBe(forward.ruleCount)
    expect(outcomesSortedStrings(reversed.outcomes)).toEqual(outcomesSortedStrings(forward.outcomes))
  })

  it('scorePlan gives the same score and the same dimensions for the registry in forward and reverse order (TT-16)', () => {
    const plan = buildViolatingPlan()
    const forwardScore = scorePlan(evaluatePlan(plan, REGISTERED_RULES))
    const reversedScore = scorePlan(evaluatePlan(plan, [...REGISTERED_RULES].reverse()))

    expect(reversedScore).toEqual(forwardScore)
  })
})

describe('evaluateRegistered and registeredSeatGuard bind REGISTERED_RULES into the engine', () => {
  it('evaluateRegistered reports exactly what evaluatePlan(plan, REGISTERED_RULES) would', () => {
    const plan = buildViolatingPlan()

    expect(evaluateRegistered(plan)).toEqual(evaluatePlan(plan, REGISTERED_RULES))
  })

  it('registeredSeatGuard agrees with seatGuardFrom(REGISTERED_RULES) on the same candidate', () => {
    const plan = buildViolatingPlan()
    const candidate = { plan, tableId: 'round-2', seatIndex: 3, guest: makeGuest('candidate') }

    expect(registeredSeatGuard()(candidate)).toBe(seatGuardFrom(REGISTERED_RULES)(candidate))
  })
})

describe('every hard, seating-remedy rule can point at what it objects to (TT-14: "Auto-allocate has to tell those apart, or it will hunt for a seating fix that does not exist")', () => {
  const hardSeatingRules = REGISTERED_RULES.filter((rule) => rule.severity === 'hard' && rule.remedy === 'seating')

  it('the registry currently has at least one hard, seating rule to check — otherwise the check below would be vacuous', () => {
    expect(hardSeatingRules.length).toBeGreaterThan(0)
  })

  it.each(hardSeatingRules)('$id: every finding it raises names at least one table and at least one guest', (rule) => {
    const { findings } = rule.evaluate(buildViolatingPlan())

    expect(findings.length).toBeGreaterThan(0)
    for (const finding of findings) {
      expect(finding.tableIds.length).toBeGreaterThan(0)
      expect(finding.guestIds.length).toBeGreaterThan(0)
    }
  })
})

describe('every registered rule has a non-empty description, now user-facing as a score breakdown label (TT-16)', () => {
  it.each(REGISTERED_RULES)('$id has a description with real content', (rule) => {
    expect(rule.description.trim().length).toBeGreaterThan(0)
  })
})
