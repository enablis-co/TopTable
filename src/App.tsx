import { AppShell } from './shell/AppShell'
import { useNavigation } from './shell/navigation'
import { Panel } from './ui'
import { SetupScreen } from './screens/setup/SetupScreen'
import { GuestsScreen } from './screens/guests/GuestsScreen'

/**
 * The shell and the section-to-screen map. Nothing else.
 *
 * Setup (TT-3, TT-4) and Guests (TT-6, TT-5) are built. Plan is
 * still one scaffold line, not a designed empty state — KB-6's remaining "must look
 * intentional" state (the violations panel with one rule registered) belongs to the ticket
 * that builds that screen, not to this one.
 */
export default function App() {
  return (
    <AppShell>
      <CurrentScreen />
    </AppShell>
  )
}

function CurrentScreen() {
  const { tab } = useNavigation()

  switch (tab) {
    case 'setup':
      return <SetupScreen />
    case 'guests':
      return <GuestsScreen />
    case 'plan':
      return <Panel>The plan lands here (TT-11 to TT-15).</Panel>
  }
}
