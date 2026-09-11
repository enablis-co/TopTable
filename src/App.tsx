import { useState } from 'react'
import { AppShell } from './shell/AppShell'
import { useNavigation } from './shell/navigation'
import { SetupScreen } from './screens/setup/SetupScreen'
import { GuestsScreen } from './screens/guests/GuestsScreen'
import { PlanScreen } from './screens/plan/PlanScreen'

/**
 * The shell and the section-to-screen map. Setup (TT-3, TT-4), Guests (TT-6, TT-5) and Plan
 * (TT-11, TT-12, TT-13) are built; KB-6's violations panel is TT-14's, not landed yet.
 *
 * Also owns `allocated`: whether the room has been auto-allocated. `CurrentScreen` unmounts the
 * outgoing screen on every tab switch, so this flag has to live above that unmount rather than
 * on Plan itself, or leaving for Guests and coming back would silently discard the allocation.
 * Setup reads it to report the plan's status (KB-6); Plan reads and sets it. Not persisted
 * (docs/state.md): a derived plan is never stored, only whether one has been asked for.
 */
export default function App() {
  const [allocated, setAllocated] = useState(false)

  return (
    <AppShell>
      <CurrentScreen allocated={allocated} setAllocated={setAllocated} />
    </AppShell>
  )
}

type CurrentScreenProps = {
  allocated: boolean
  setAllocated: (allocated: boolean) => void
}

function CurrentScreen({ allocated, setAllocated }: CurrentScreenProps) {
  const { tab } = useNavigation()

  switch (tab) {
    case 'setup':
      return <SetupScreen allocated={allocated} />
    case 'guests':
      return <GuestsScreen />
    case 'plan':
      return <PlanScreen allocated={allocated} setAllocated={setAllocated} />
  }
}
