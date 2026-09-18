import type { Guest, Pin, ProtocolRole, RoomConfig } from './types'
import { PROTOCOL_ROLES } from './types'
import type { Seat, SeatingPlan, TableSlot } from './seating'
import { TOP_TABLE_ID, resolveHonouredPins, tableFor, tablesInRoom, topTableSeatPlacement } from './seating'

/**
 * The solver: seats the top table by protocol, then fills the room. In its own file,
 * deliberately, so a rule (TT-14) or the table panel (TT-15) can import the model in
 * `./seating` without also importing this.
 */

/**
 * What a guard is shown while the fill is still running: the tables built so far, in the same
 * shape `allocate` returns. No `unseated` — the fill has not finished failing to seat anyone
 * until it ends, so a running count would be fiction; read `SeatingPlan.unseated` from
 * `allocate`'s own return value instead.
 */
export type PlanSoFar = Pick<SeatingPlan, 'tables'>

export type SeatCandidate = {
  /** The plan as built so far. A guard reads it and must not mutate it. */
  plan: PlanSoFar
  tableId: string
  seatIndex: number
  guest: Guest
}

/** Asked before the fill takes a seat. `true` allows it. TT-14 supplies the rules-backed one. */
export type SeatGuard = (candidate: SeatCandidate) => boolean

export type AllocateOptions = {
  /** Defaults to allowing every seat, which is what "no rules registered yet" means. */
  allowSeat?: SeatGuard
}

/** The same shape as `SeatedTable`, mutable while the solver is still building it. */
type BuildingTable = TableSlot & {
  seats: (Seat | null)[]
  overflow: Seat[]
}

function emptyBuildingTable(slot: TableSlot): BuildingTable {
  return { ...slot, seats: new Array<Seat | null>(slot.capacity).fill(null), overflow: [] }
}

function seatAtTableOrOverflow(table: BuildingTable, guest: Guest, pinned: boolean): void {
  const freeIndex = table.seats.findIndex((seat) => seat === null)
  if (freeIndex === -1) {
    table.overflow.push({ guest, pinned })
  } else {
    table.seats[freeIndex] = { guest, pinned }
  }
}

function countFreeSeats(table: BuildingTable): number {
  return table.seats.filter((seat) => seat === null).length
}

/**
 * KB-4 at the top table: a guest who holds an honoured pin to a *different*, real table is left
 * for that pin instead of pulled here. The top table is the one place a pin can lose outright
 * (KB-4's "no exceptions") rather than simply not being the table it names.
 */
function isFreeForTopTable(guestId: string, honoured: ReadonlyMap<string, string>): boolean {
  const pinnedTableId = honoured.get(guestId)
  return pinnedTableId === undefined || pinnedTableId === TOP_TABLE_ID
}

/** Whether `guest` holds one of KB-4's eight roles, as opposed to an ordinary guest who reaches
 * the top table only by the pin below. */
function holdsProtocolRole(guest: Guest): boolean {
  return (PROTOCOL_ROLES as readonly string[]).includes(guest.role)
}

/**
 * Phase 1: the top table. A product-owner ruling overrides KB-4's "no exceptions" for this one
 * case: a guest hand-pinned to the top table is seated there even without a protocol role, and
 * the roles fill whatever seats remain rather than the pin being silently dropped. The layout —
 * which seats the pins claim, and where the reduced role order lands once they do — is
 * `seating.ts`'s `topTableSeatPlacement`, the one definition shared with the top-table rule
 * (TT-49): grading a plan against a layout this function did not produce is how a correct plan
 * reads as a violation. Pins beyond capacity overflow rather than being dropped (KB-2:
 * over-capacity is a hard violation and must stay representable).
 *
 * Returns the roles included in this table's reduced order, whether or not a holder was found to
 * seat, so `allocate` can tell a role bumped by a pin from one bumped by the table's own
 * shortfall — both get the same "seated together" treatment from `seatProtocolOverflowBlock`.
 */
function seatTopTable(
  topTable: BuildingTable,
  guests: readonly Guest[],
  honoured: ReadonlyMap<string, string>,
  seatedGuestIds: Set<string>,
): readonly ProtocolRole[] {
  const pinnedWithoutRole = guests.filter(
    (guest) =>
      !seatedGuestIds.has(guest.id) && honoured.get(guest.id) === TOP_TABLE_ID && !holdsProtocolRole(guest),
  )
  const { pinSeatIndices, roleAt } = topTableSeatPlacement(topTable.capacity, pinnedWithoutRole.length)

  pinnedWithoutRole.forEach((guest, index) => {
    const seatIndex = pinSeatIndices[index]
    if (seatIndex === undefined) {
      topTable.overflow.push({ guest, pinned: true })
    } else {
      topTable.seats[seatIndex] = { guest, pinned: true }
    }
    seatedGuestIds.add(guest.id)
  })

  const roles: ProtocolRole[] = []

  roleAt.forEach((role, seatIndex) => {
    if (role === undefined) return
    roles.push(role)

    const holder = guests.find(
      (guest) => guest.role === role && !seatedGuestIds.has(guest.id) && isFreeForTopTable(guest.id, honoured),
    )
    if (!holder) return

    topTable.seats[seatIndex] = { guest: holder, pinned: honoured.get(holder.id) === TOP_TABLE_ID }
    seatedGuestIds.add(holder.id)
  })

  return roles
}

/** Phase 2: honoured pins on round tables, before anything algorithmic claims a seat. */
function seatHonouredRoundPins(
  tables: ReadonlyMap<string, BuildingTable>,
  guests: readonly Guest[],
  honoured: ReadonlyMap<string, string>,
  seatedGuestIds: Set<string>,
): void {
  for (const guest of guests) {
    if (seatedGuestIds.has(guest.id)) continue

    const tableId = honoured.get(guest.id)
    if (tableId === undefined || tableId === TOP_TABLE_ID) continue

    seatAtTableOrOverflow(tableFor(tables, tableId), guest, true)
    seatedGuestIds.add(guest.id)
  }
}

/**
 * A distinct free seat per guest in `block`, each cleared by `allowSeat`, assigned in guest order
 * — or `null` if `table` cannot seat the whole block that way. Read-only: nothing is placed until
 * the caller commits the returned assignment.
 */
function fitBlockAt(
  table: BuildingTable,
  block: readonly Guest[],
  allowSeat: SeatGuard,
  planSoFar: PlanSoFar,
): { guest: Guest; seatIndex: number }[] | null {
  const claimed = new Set<number>()
  const assignments: { guest: Guest; seatIndex: number }[] = []

  for (const guest of block) {
    const seatIndex = table.seats.findIndex(
      (seat, index) =>
        seat === null &&
        !claimed.has(index) &&
        allowSeat({ plan: planSoFar, tableId: table.id, seatIndex: index, guest }),
    )
    if (seatIndex === -1) return null
    claimed.add(seatIndex)
    assignments.push({ guest, seatIndex })
  }

  return assignments
}

/**
 * Phase 3: the protocol roles the top table had no room for, seated together (KB-4). `allowSeat`
 * is consulted only to prefer a destination among round tables with room for the whole block —
 * never to decide whether the block is seated, and never to split it. KB-1: "Auto-allocate
 * satisfies the hard ones", so a table every candidate is refused at is not a reason to give up —
 * the fallback below seats the block at the first table with room regardless, keeping the
 * resulting hard violation representable in the plan for TT-14 to detect (KB-2).
 */
function seatProtocolOverflowBlock(
  tables: ReadonlyMap<string, BuildingTable>,
  roundSlotsInOrder: readonly TableSlot[],
  guests: readonly Guest[],
  omittedRoles: readonly ProtocolRole[],
  seatedGuestIds: Set<string>,
  allowSeat: SeatGuard,
  planSoFar: PlanSoFar,
): void {
  const block: Guest[] = []
  for (const role of omittedRoles) {
    const holder = guests.find((guest) => guest.role === role && !seatedGuestIds.has(guest.id))
    if (holder) block.push(holder)
  }
  if (block.length === 0) return

  const candidates = roundSlotsInOrder
    .map((slot) => tableFor(tables, slot.id))
    .filter((table) => countFreeSeats(table) >= block.length)

  for (const table of candidates) {
    const assignments = fitBlockAt(table, block, allowSeat, planSoFar)
    if (!assignments) continue

    for (const { guest, seatIndex } of assignments) {
      table.seats[seatIndex] = { guest, pinned: false }
      seatedGuestIds.add(guest.id)
    }
    return
  }

  // No round table can take the whole block together: it falls through to the ordinary fill
  // rather than splitting the roles across tables.
  const fallback = candidates[0]
  if (!fallback) return

  for (const guest of block) {
    seatAtTableOrOverflow(fallback, guest, false)
    seatedGuestIds.add(guest.id)
  }
}

/** The first seat, in slot order then ascending seat order, that is empty and `allowSeat` clears. */
function seatIntoFirstAllowedSeat(
  tables: ReadonlyMap<string, BuildingTable>,
  roundSlotsInOrder: readonly TableSlot[],
  guest: Guest,
  allowSeat: SeatGuard,
  planSoFar: PlanSoFar,
): boolean {
  for (const slot of roundSlotsInOrder) {
    const table = tableFor(tables, slot.id)
    for (let seatIndex = 0; seatIndex < table.seats.length; seatIndex++) {
      if (table.seats[seatIndex] !== null) continue
      if (!allowSeat({ plan: planSoFar, tableId: slot.id, seatIndex, guest })) continue

      table.seats[seatIndex] = { guest, pinned: false }
      return true
    }
  }
  return false
}

/** Phase 4: the fill. Round tables only — the top table is never a fill destination. */
function fillRemainingGuests(
  tables: ReadonlyMap<string, BuildingTable>,
  roundSlotsInOrder: readonly TableSlot[],
  guests: readonly Guest[],
  seatedGuestIds: Set<string>,
  allowSeat: SeatGuard,
  planSoFar: PlanSoFar,
): Guest[] {
  const unseated: Guest[] = []

  for (const guest of guests) {
    if (seatedGuestIds.has(guest.id)) continue

    if (seatIntoFirstAllowedSeat(tables, roundSlotsInOrder, guest, allowSeat, planSoFar)) {
      seatedGuestIds.add(guest.id)
    } else {
      unseated.push(guest)
    }
  }

  return unseated
}

const allowEverySeat: SeatGuard = () => true

/**
 * Seats the top table — a guest's own pin to it first, KB-4's protocol roles into whatever
 * remains — then honours pins to a round table, then the top table's overflow roles together,
 * then fills what is left. Phases 1-2 never call `allowSeat`: a pin and the protocol order are
 * positions KB-4 or a human already fixed (see this file's own guard tests). Phase 3 calls it
 * only to prefer a destination for the overflow block, with a documented fallback
 * (`seatProtocolOverflowBlock`); phase 4 asks per guest, per seat. Deterministic and pure: every
 * phase walks a fixed order, and neither `guests` nor `pins` is written to.
 */
export function allocate(room: RoomConfig, guests: Guest[], pins: Pin[], options?: AllocateOptions): SeatingPlan {
  const allowSeat = options?.allowSeat ?? allowEverySeat

  const slots = tablesInRoom(room)
  const roundSlots = slots.filter((slot) => slot.kind === 'round')
  const topSlot = slots.find((slot) => slot.kind === 'top')

  const honoured = resolveHonouredPins(slots, guests, pins)

  const tables = new Map<string, BuildingTable>()
  for (const slot of slots) {
    tables.set(slot.id, emptyBuildingTable(slot))
  }

  // Built once: every phase mutates the same `BuildingTable` objects this holds, so a guard sees
  // each seat land as it happens, and the return below hands back this same table list.
  const planSoFar: PlanSoFar = { tables: slots.map((slot) => tableFor(tables, slot.id)) }

  const seatedGuestIds = new Set<string>()

  // `seatTopTable` reports which roles it actually seated, which is fewer than
  // `topTableRoleOrder(topSlot.capacity)` whenever a pin claimed one of that table's seats —
  // `omittedRoles` has to read from this, not recompute it from raw capacity, or a role bumped
  // by a pin would fall through to the ordinary fill instead of the overflow block's "seated
  // together" treatment.
  const includedRoles = topSlot ? seatTopTable(tableFor(tables, topSlot.id), guests, honoured, seatedGuestIds) : []

  seatHonouredRoundPins(tables, guests, honoured, seatedGuestIds)

  const omittedRoles = PROTOCOL_ROLES.filter((role) => !includedRoles.includes(role))
  seatProtocolOverflowBlock(tables, roundSlots, guests, omittedRoles, seatedGuestIds, allowSeat, planSoFar)

  const unseated = fillRemainingGuests(tables, roundSlots, guests, seatedGuestIds, allowSeat, planSoFar)

  return {
    tables: planSoFar.tables,
    unseated,
  }
}
