// Type declarations for generate-scenarios.mjs, so src/domain/scenarioAges.test.ts can import
// its `ageBand`/`AGE_BANDS` with real types instead of an implicit `any`. TypeScript resolves
// a `.d.mts` file sitting beside a `.mjs` file of the same name automatically; nothing needs
// to import this file explicitly. Never loaded at runtime — Node does not read `.d.mts` files
// — so this has no bearing on `npm run generate:scenarios`, only on `npm run typecheck`.
//
// `AgeBand` is imported for its type only (erased on build), so this does not create a real
// runtime dependency from scripts/ onto src/domain/ — see the comment on `ageBand` in
// generate-scenarios.mjs for why the two files cannot share the implementation itself.
import type { AgeBand } from '../src/domain/types'

export declare const AGE_BANDS: readonly AgeBand[]
export declare function ageBand(years: number): AgeBand
