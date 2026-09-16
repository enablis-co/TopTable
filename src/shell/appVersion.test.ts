import { afterEach, describe, expect, it, vi } from 'vitest'
import { appVersion, versionLabel } from './appVersion'

/**
 * TT-42. `versionLabel` is the pure shape check behind the rail's version stamp: it must
 * return `null` for every untagged or malformed input at once, because A22 ("a build with
 * no tag renders nothing — not `undefined`, not a bare `v`, not an empty element") depends
 * on the *same* function producing `null` for all of those inputs, not on separate handling
 * for each. `appVersion()` is the one-line reader on top of it; its tests confirm it reads
 * `import.meta.env.VITE_APP_VERSION` at call time, which is what makes A22's untagged branch
 * reachable at all from a test (`vi.stubEnv`), per the plan's A1.
 *
 * Does not open appVersion.ts, NavRail.tsx, NavRail.module.css or vite-env.d.ts.
 */

describe('versionLabel', () => {
  it('T1: returns a well-formed version unchanged', () => {
    expect(versionLabel('v0.7.0')).toBe('v0.7.0')
  })

  it('T2: returns null for undefined — the untagged local-dev and preview case (A22)', () => {
    expect(versionLabel(undefined)).toBeNull()
  })

  it('T3: returns null for an empty string and for a whitespace-only string (A22)', () => {
    expect(versionLabel('')).toBeNull()
    expect(versionLabel('   ')).toBeNull()
  })

  it('T4: returns null for a bare "v" — never rendered (A22)', () => {
    expect(versionLabel('v')).toBeNull()
  })

  it('T5: returns null for the literal string "undefined" — what a naive template produces (A22)', () => {
    expect(versionLabel('undefined')).toBeNull()
  })

  it('T6: accepts multi-digit segments, and trims surrounding whitespace first (A13)', () => {
    expect(versionLabel('v0.11.0')).toBe('v0.11.0')
    expect(versionLabel(' v1.2.0 ')).toBe('v1.2.0')
  })

  // Extra, beyond the plan's T1-T6 floor: the shape check is a regex anchored at both ends,
  // so nothing that merely contains a valid version should pass — a defect report pasting a
  // version alongside other text must not slip through as if it were the bare value.
  it('rejects a value that merely contains a valid version rather than matching it exactly', () => {
    expect(versionLabel('v0.7.0 ')).toBe('v0.7.0') // trimmed whitespace is fine
    expect(versionLabel('version v0.7.0')).toBeNull()
    expect(versionLabel('v0.7.0-rc1')).toBeNull()
    expect(versionLabel('v0.7')).toBeNull()
  })

  it('rejects a leading v-less version and a negative-looking segment', () => {
    expect(versionLabel('0.7.0')).toBeNull()
    expect(versionLabel('v-1.0.0')).toBeNull()
  })
})

describe('appVersion', () => {
  afterEach(() => {
    vi.unstubAllEnvs()
  })

  it('returns the tag as a version label when VITE_APP_VERSION is set to one (A15, A23)', () => {
    vi.stubEnv('VITE_APP_VERSION', 'v0.7.0')
    expect(appVersion()).toBe('v0.7.0')
  })

  it('returns null when VITE_APP_VERSION is unset — the untagged case (A22)', () => {
    vi.stubEnv('VITE_APP_VERSION', undefined)
    expect(appVersion()).toBeNull()
  })

  it('returns null when VITE_APP_VERSION is malformed, exactly as versionLabel would (A22)', () => {
    vi.stubEnv('VITE_APP_VERSION', 'v')
    expect(appVersion()).toBeNull()
  })

  // This is the behaviour A1 in the plan's clarifications rests on: import.meta.env must be
  // read inside the function body, at call time, not captured once at module load — otherwise
  // vi.stubEnv could never change what a later call returns, and the untagged branch (A22)
  // would be untestable without editing vite.config.ts.
  it('re-reads the environment on every call rather than caching it from module load (A23, A1)', () => {
    vi.stubEnv('VITE_APP_VERSION', 'v0.7.0')
    expect(appVersion()).toBe('v0.7.0')

    vi.stubEnv('VITE_APP_VERSION', 'v0.8.0')
    expect(appVersion()).toBe('v0.8.0')

    vi.stubEnv('VITE_APP_VERSION', undefined)
    expect(appVersion()).toBeNull()
  })
})
