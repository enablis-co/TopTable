import type { RoomConfig } from '../../domain/types'
import { floorplanFromRoom, occupantsAt, type SeatingView } from './floorplan'
import { PlanTable } from './PlanTable'
import styles from './FloorplanGrid.module.css'

type FloorplanGridProps = {
  room: RoomConfig
  seating: SeatingView
}

/**
 * TT-11, C1, C2, KB-6 "Plan". The grid of tables, top table first, in one `<ul>` — not a
 * computed column count: `repeat(auto-fill, minmax(96px, 1fr))` reflows on its own as
 * `RoomConfig` changes (C1). `auto-fill`, deliberately not `auto-fit` (A5): `auto-fit`
 * collapses empty tracks and would stretch a five-table room across the full row, making a
 * small wedding's tables enormous.
 *
 * Named `FloorplanGrid`, not `Floorplan`: the pure view model this file calls into already
 * owns the name `floorplan.ts`, and TypeScript refuses two files in one directory that
 * differ only in casing (TS1149) — a real hazard between this case-insensitive filesystem
 * and a case-sensitive CI runner, not just a local build error.
 */
export function FloorplanGrid({ room, seating }: FloorplanGridProps) {
  const slots = floorplanFromRoom(room)

  return (
    <ul className={styles.grid}>
      {slots.map((slot) => (
        <PlanTable key={slot.id} slot={slot} occupants={occupantsAt(seating, slot.id)} />
      ))}
    </ul>
  )
}
