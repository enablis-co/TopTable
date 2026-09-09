import { AppShell } from './shell/AppShell'
import { useNavigation } from './shell/navigation'
import { SetupScreen } from './screens/setup/SetupScreen'
import { GuestsScreen } from './screens/guests/GuestsScreen'
import { PlanScreen } from './screens/plan/PlanScreen'

/**
 * The shell and the section-to-screen map. Nothing else.
 *
 * Setup (TT-3, TT-4), Guests (TT-6, TT-5) and Plan (TT-11) are built. Plan renders the
 * floorplan alone today — KB-6's remaining "must look intentional" state (the violations
 * panel with one rule registered) belongs to TT-14, which has not landed yet.
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
      return <PlanScreen />
  }
}
