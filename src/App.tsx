import { AppShell } from './shell/AppShell'
import { useNavigation } from './shell/navigation'
import { Panel } from './ui'

/**
 * The shell and the section-to-screen map. Nothing else.
 *
 * Each section below is one scaffold line, not a designed empty state — KB-6's three
 * "must look intentional" states (the empty setup screen, the empty guest list, one rule
 * registered) belong to the tickets that build those screens, not to this one.
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
      return <Panel>The setup screen lands here (TT-3 and TT-4).</Panel>
    case 'guests':
      return <Panel>The guest list lands here (TT-5 and TT-6).</Panel>
    case 'plan':
      return <Panel>The plan lands here (TT-11 to TT-15).</Panel>
  }
}
