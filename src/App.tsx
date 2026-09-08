import { AppShell } from './shell/AppShell'
import { useNavigation } from './shell/navigation'
import { Panel } from './ui'
import { SetupScreen } from './screens/setup/SetupScreen'

/**
 * The shell and the section-to-screen map. Nothing else.
 *
 * Setup is built (TT-3; TT-4 adds the scenario cards on top of it). Guests and Plan are
 * still one scaffold line each, not a designed empty state — KB-6's other two "must look
 * intentional" states (the empty guest list, one rule registered) belong to the tickets
 * that build those screens, not to this one.
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
      return <Panel>The guest list lands here (TT-5 and TT-6).</Panel>
    case 'plan':
      return <Panel>The plan lands here (TT-11 to TT-15).</Panel>
  }
}
