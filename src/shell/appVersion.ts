/**
 * The version the running build was cut at, stamped in at build time by
 * `.github/workflows/main.yml`'s `publish` job — the step there sets
 * `VITE_APP_VERSION` to the `version` job's output before `npm run build` runs.
 * Vite replaces `import.meta.env.VITE_APP_VERSION` with that literal string in the
 * bundle; nothing here fetches anything at runtime.
 *
 * `null` is the *common* case, not the edge one: local `npm run dev` and every
 * TT-43 preview build are untagged, so the rail renders nothing rather than a
 * placeholder. See NavRail.tsx.
 */

/**
 * Pure and synchronous, so it can be exercised without an environment. Trims the
 * input and accepts it only if it is a bare `vMAJOR.MINOR.PATCH` — that single
 * shape check is what turns `undefined`, `''`, whitespace, a bare `'v'` and the
 * literal string `'undefined'` (a naive template's failure mode) all into `null`
 * at once, rather than handling each as its own case.
 */
export function versionLabel(raw: string | undefined): string | null {
  const trimmed = raw?.trim()
  if (trimmed !== undefined && /^v\d+\.\d+\.\d+$/.test(trimmed)) {
    return trimmed
  }
  return null
}

/**
 * Reads the env INSIDE the function body, not at module scope. In the built
 * bundle Vite has already replaced the expression with a literal, but under
 * Vitest the value is read at call time — a module-scope read would run once,
 * before a test's `vi.stubEnv('VITE_APP_VERSION', ...)` could set it, and every
 * test would see whatever was first.
 */
export function appVersion(): string | null {
  return versionLabel(import.meta.env.VITE_APP_VERSION)
}
