import { createContext, useContext } from 'react'

/**
 * No JSX in this file, so `react-refresh/only-export-components` never fires and this can
 * freely export constants, a type, a context and a hook side by side.
 *
 * The current tab is view state, not data: `docs/state.md` fixes the store's contents at
 * event, room and guests, and the active section is never persisted or written there.
 */
export const TABS = ['setup', 'guests', 'plan'] as const
export type Tab = (typeof TABS)[number]

export const TAB_LABELS: Record<Tab, string> = {
  setup: 'Setup',
  guests: 'Guests',
  plan: 'Plan',
}

export type Navigation = {
  tab: Tab
  goTo: (tab: Tab) => void
}

export const NavigationContext = createContext<Navigation | null>(null)

/** Throws outside the shell: every screen renders inside AppShell, so this is a bug guard. */
export function useNavigation(): Navigation {
  const navigation = useContext(NavigationContext)
  if (!navigation) {
    throw new Error('useNavigation must be called within AppShell')
  }
  return navigation
}
