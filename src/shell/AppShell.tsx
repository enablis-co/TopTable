import { useCallback, useMemo, useState } from 'react'
import type { ReactNode } from 'react'
import { AppHeader } from './AppHeader'
import { NavigationContext, type Tab } from './navigation'
import styles from './AppShell.module.css'

/**
 * The app frame: provides section navigation, renders the header on every section, and
 * hands the current section's screen to `<main>`. Setup is current on first render.
 */
export function AppShell({ children }: { children: ReactNode }) {
  const [tab, setTab] = useState<Tab>('setup')

  const goTo = useCallback((next: Tab) => {
    setTab(next)
  }, [])

  const navigation = useMemo(() => ({ tab, goTo }), [tab, goTo])

  return (
    <NavigationContext.Provider value={navigation}>
      <div className={styles.shell}>
        <AppHeader />
        <main className={styles.main}>{children}</main>
      </div>
    </NavigationContext.Provider>
  )
}
