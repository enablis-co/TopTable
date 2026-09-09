/**
 * TT-4: the three example weddings, KB-3's own numbers. Pure — no rendering, no store, no
 * fetch. The guest data itself ships in `public/scenarios/` and is fetched by the screen
 * (`src/screens/setup/scenarioSource.ts`); this file is only the manifest of what each
 * scenario is called and what room it brings, so the cards can show their arithmetic before
 * anything is imported.
 */

import { capacityFor } from './capacity'
import type { RoomConfig } from './types'

export const SCENARIO_IDS = ['small-and-cosy', 'adding-up', 'celebrity-scale'] as const

export type ScenarioId = (typeof SCENARIO_IDS)[number]

export function isScenarioId(value: unknown): value is ScenarioId {
  return typeof value === 'string' && (SCENARIO_IDS as readonly string[]).includes(value)
}

export type ScenarioManifestEntry = {
  id: ScenarioId
  name: string
  guestCount: number
  room: RoomConfig
}

/** KB-3, in KB-3's order. */
export const SCENARIOS: readonly ScenarioManifestEntry[] = [
  {
    id: 'small-and-cosy',
    name: 'Small and cosy',
    guestCount: 40,
    room: { roundTables: 4, seatsEach: 8, topTableSeats: 8 },
  },
  {
    id: 'adding-up',
    name: 'Adding up',
    guestCount: 70,
    room: { roundTables: 9, seatsEach: 8, topTableSeats: 6 },
  },
  {
    id: 'celebrity-scale',
    name: 'Celebrity scale',
    guestCount: 200,
    room: { roundTables: 26, seatsEach: 8, topTableSeats: 8 },
  },
]

export type ScenarioSummary = ScenarioManifestEntry & {
  totalSeats: number
  spare: number
}

/**
 * Seats and spare are derived through `capacityFor` rather than hardcoded — TT-3 already
 * owns that arithmetic, and one implementation of KB-1's formula is the point.
 */
export function scenarioSummary(entry: ScenarioManifestEntry): ScenarioSummary {
  const capacity = capacityFor(entry.room, entry.guestCount)
  return {
    ...entry,
    totalSeats: capacity.totalSeats,
    spare: capacity.spare,
  }
}

/** A bug guard, in the manner of `useNavigation`: every id in the app comes from SCENARIO_IDS. */
export function scenarioById(id: ScenarioId): ScenarioManifestEntry {
  const entry = SCENARIOS.find((scenario) => scenario.id === id)
  if (!entry) {
    throw new Error(`Unknown scenario id: ${id}`)
  }
  return entry
}
