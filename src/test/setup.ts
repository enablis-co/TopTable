import '@testing-library/jest-dom/vitest'
import { cleanup } from '@testing-library/react'
import { afterEach } from 'vitest'

// Vitest runs with globals: false here, so Testing Library's auto-cleanup never
// registers itself. Without this, one test's rendered tree leaks into the next.
afterEach(cleanup)
