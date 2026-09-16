/// <reference types="vite/client" />

// Declaration merging onto vite/client's own ImportMetaEnv. Without this, that
// interface's `[key: string]: any` index signature types VITE_APP_VERSION as
// `any` and puts it in front of typescript-eslint's type-checked unsafe-assignment
// rules. NO top-level import or export in this file — either one turns the
// `interface` below into a module-scoped declaration and the merge silently stops
// applying, leaving VITE_APP_VERSION back on the `any` index signature.
interface ImportMetaEnv {
  readonly VITE_APP_VERSION?: string
}
