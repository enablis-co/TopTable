import { describe, expect, it, vi } from 'vitest'
import { loadScenarioGuests, scenarioUrl } from './scenarioSource'

/**
 * TT-4, "Import a scenario". Written from .claude/plans/TT-4.md section 5 and the two
 * contracts it publishes there: the screen fetches
 * `${import.meta.env.BASE_URL}scenarios/<id>.json` (`/scenarios/adding-up.json` under test,
 * since BASE_URL carries no base path here) and expects a body shaped `{ meta, guests: [...] }`.
 *
 * Stubbed with vi.spyOn(globalThis, 'fetch') per the plan, not vi.stubGlobal: vite.config.ts's
 * restoreMocks: true restores spies automatically between tests but does not unstub globals.
 *
 * Does not open scenarioSource.ts.
 */

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status })
}

describe('scenarioUrl (C9)', () => {
  it('builds the public/scenarios path for a given id', () => {
    expect(scenarioUrl('adding-up')).toBe('/scenarios/adding-up.json')
  })
})

describe('loadScenarioGuests requests the right file and reads its guests (C9)', () => {
  it('requests /scenarios/adding-up.json for "adding-up"', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(jsonResponse({ meta: {}, guests: [] }))

    await loadScenarioGuests('adding-up')

    expect(fetchSpy).toHaveBeenCalledTimes(1)
    expect(fetchSpy.mock.calls[0]?.[0]).toBe('/scenarios/adding-up.json')
  })

  it('returns the guests array from a well-formed body', async () => {
    const guests = [{ id: 'g1' }, { id: 'g2' }]
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      jsonResponse({ meta: { scenario: 'Adding up' }, guests }),
    )

    const result = await loadScenarioGuests('adding-up')

    expect(result).toEqual(guests)
  })
})

describe('loadScenarioGuests returns null, and never throws, on failure (C22, Assumed A8)', () => {
  it('a rejected fetch (network failure)', async () => {
    vi.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('network down'))
    await expect(loadScenarioGuests('adding-up')).resolves.toBeNull()
  })

  it('a non-ok response status (404)', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(jsonResponse({}, 404))
    await expect(loadScenarioGuests('adding-up')).resolves.toBeNull()
  })

  it('a body that is not JSON', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response('not json{{', { status: 200 }))
    await expect(loadScenarioGuests('adding-up')).resolves.toBeNull()
  })

  it('a body with no guests field at all', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(jsonResponse({ meta: {} }))
    await expect(loadScenarioGuests('adding-up')).resolves.toBeNull()
  })

  it('a body where guests is not an array', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(jsonResponse({ meta: {}, guests: 'not-an-array' }))
    await expect(loadScenarioGuests('adding-up')).resolves.toBeNull()
  })

  it('a body that parses as JSON but is not an object at all (Assumed A8: "is an object")', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(jsonResponse([1, 2, 3]))
    await expect(loadScenarioGuests('adding-up')).resolves.toBeNull()
  })
})
