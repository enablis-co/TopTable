import type { Guest } from '../../domain/types'
import type { ScenarioId } from '../../domain/scenarios'

/**
 * TT-4: the only IO in this ticket. Not in src/domain/ — the domain stays pure and
 * reasonable at a terminal (docs/engineering-standards.md).
 */

export function scenarioUrl(id: ScenarioId): string {
  return `${import.meta.env.BASE_URL}scenarios/${id}.json`
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

/**
 * A light structural check, not per-guest validation: the files ship in the repo and are
 * already validated by scripts/generate-scenarios.mjs, but they arrive over HTTP and a 404
 * page or a truncated response must not take the screen down.
 *
 * Returns null on any failure — network, non-ok status, an unparseable body, or a body
 * whose `guests` is missing or not an array. Never throws. Does not read `meta`: the room
 * comes from the domain manifest, so `meta` is only ever a test fixture.
 */
export async function loadScenarioGuests(id: ScenarioId): Promise<Guest[] | null> {
  try {
    const response = await fetch(scenarioUrl(id))
    if (!response.ok) return null

    const body: unknown = await response.json()
    if (!isRecord(body) || !Array.isArray(body.guests)) return null

    return body.guests as Guest[]
  } catch {
    return null
  }
}
