import type { Guest, Pin, ProtocolRole, RoomConfig } from './types'
import { PROTOCOL_ROLES } from './types'

/**
 * The seating model: the canonical table address, KB-4's protocol order applied to any top
 * table size, ring-vs-line adjacency, and the plan a hand pin alone describes. Pure — imports
 * only `./types` — so a rule (TT-14) or the table panel (TT-15) can read the model without
 * pulling in the solver in `./allocate`.
 */

export type TableKind = 'top' | 'round'

/**
 * The canonical table address (TT-13): `TOP_TABLE_ID`, or `roundTableId(n)` with `n` 1-based.
 * Unchanged from the scheme already written into every user's stored pins, so nothing here
 * needs a storage version bump — kept true by this file's own id-format test.
 */
export const TOP_TABLE_ID = 'top'

export function roundTableId(number: number): string {
  return `round-${number}`
}

export type TableSlot = {
  id: string
  kind: TableKind
  number: number | null
  label: string
  capacity: number
}

/** Coerces a possibly-degenerate room number to a finite, non-negative integer. */
function normaliseCount(value: number): number {
  return Number.isFinite(value) ? Math.max(0, Math.trunc(value)) : 0
}

/**
 * The same coercion applied to all three fields, shared by every reader of `RoomConfig` so the
 * gate, the header and the generator can never disagree about the same stored room.
 */
export function normaliseRoom(room: RoomConfig): RoomConfig {
  return {
    roundTables: normaliseCount(room.roundTables),
    seatsEach: normaliseCount(room.seatsEach),
    topTableSeats: normaliseCount(room.topTableSeats),
  }
}

/**
 * The top table first (when it has seats), then round tables 1..N (KB-6) — the same order
 * `allocate`'s protocol-overflow block and its fill walk the room in, not only a rendering
 * concern.
 */
export function tablesInRoom(room: RoomConfig): TableSlot[] {
  const { roundTables, seatsEach, topTableSeats } = normaliseRoom(room)

  const slots: TableSlot[] = []

  if (topTableSeats > 0) {
    slots.push({ id: TOP_TABLE_ID, kind: 'top', number: null, label: 'Top table', capacity: topTableSeats })
  }

  for (let number = 1; number <= roundTables; number++) {
    slots.push({
      id: roundTableId(number),
      kind: 'round',
      number,
      label: `Table ${number}`,
      capacity: seatsEach,
    })
  }

  return slots
}

export type Seat = {
  guest: Guest
  /** The guest holds a pin naming this table, and it was honoured. */
  pinned: boolean
}

export type SeatedTable = TableSlot & {
  /** One entry per seat; index 0 is seat 1. Length always equals `capacity`. null is empty. */
  seats: readonly (Seat | null)[]
  /** Guests pinned to this table with no seat left. Empty unless a hand pin overfilled it. */
  overflow: readonly Seat[]
}

export type SeatingPlan = {
  tables: readonly SeatedTable[]
  unseated: readonly Guest[]
}

/**
 * KB-4's eight seats, taken as middle-outward pairs `(4,5) (3,6) (2,7) (1,8)` until the table
 * runs out of room. `PROTOCOL_ROLES` is read positionally and never re-sorted (TT-13; TT-14
 * reads the same constant for its own check).
 */
const TOP_TABLE_PAIR_ORDER: readonly (readonly [number, number])[] = [
  [4, 5],
  [3, 6],
  [2, 7],
  [1, 8],
]

function roleAtPosition(position: number): ProtocolRole {
  const role = PROTOCOL_ROLES[position - 1]
  if (!role) {
    throw new Error(`topTableRoleOrder: no protocol role at position ${position}`)
  }
  return role
}

/**
 * KB-4's roles in top-table seat order for a table of this many seats. Index 0 is seat 1.
 *
 * Walks the pairs above, taking both positions while two seats remain and, with exactly one
 * left, the lower position only — a table one seat short of the next pair drops that pair's
 * higher-numbered role rather than leaving a configured seat empty. Always a subsequence of
 * `PROTOCOL_ROLES`, never longer than eight; the odd sizes 1, 3, 5, 7 are where a mis-sort
 * would be silent.
 */
export function topTableRoleOrder(topTableSeats: number): readonly ProtocolRole[] {
  let remaining = Math.min(normaliseCount(topTableSeats), PROTOCOL_ROLES.length)
  const positions: number[] = []

  for (const [lower, higher] of TOP_TABLE_PAIR_ORDER) {
    if (remaining <= 0) break
    if (remaining === 1) {
      positions.push(lower)
      break
    }
    positions.push(lower, higher)
    remaining -= 2
  }

  return positions.sort((a, b) => a - b).map(roleAtPosition)
}

/** The seat indices next to `seatIndex`. Round tables are a ring, the top table a line. */
export function adjacentSeats(table: SeatedTable, seatIndex: number): number[] {
  const { capacity, kind } = table

  // A ring of one seat must not report itself as its own neighbour, and there is nothing
  // adjacent to anything at a zero-capacity table.
  if (capacity <= 1 || seatIndex < 0 || seatIndex >= capacity) {
    return []
  }

  const neighbours = new Set<number>()
  const previous = seatIndex - 1
  const next = seatIndex + 1

  if (kind === 'round') {
    neighbours.add((previous + capacity) % capacity)
    neighbours.add(next % capacity)
  } else {
    if (previous >= 0) neighbours.add(previous)
    if (next < capacity) neighbours.add(next)
  }

  return [...neighbours].sort((a, b) => a - b)
}

export type SeatLocation = {
  table: SeatedTable
  /** null when the guest is in `table.overflow`. */
  seatIndex: number | null
}

/** The first match wins: `plan.tables` in order, each table's `seats` ascending, then its `overflow`. */
export function seatOf(plan: SeatingPlan, guestId: string): SeatLocation | null {
  for (const table of plan.tables) {
    for (let seatIndex = 0; seatIndex < table.seats.length; seatIndex++) {
      if (table.seats[seatIndex]?.guest.id === guestId) {
        return { table, seatIndex }
      }
    }
    for (const seat of table.overflow) {
      if (seat.guest.id === guestId) {
        return { table, seatIndex: null }
      }
    }
  }
  return null
}

/**
 * guestId -> tableId, for pins naming both a real slot and a real guest — never a seat (KB-1).
 * Exported so `allocate.ts` shares this one definition rather than keeping its own — two readings
 * of which pins are honoured is how the pre-allocate view and the solver end up disagreeing.
 */
export function resolveHonouredPins(
  slots: readonly TableSlot[],
  guests: readonly Guest[],
  pins: readonly Pin[],
): Map<string, string> {
  const slotIds = new Set(slots.map((slot) => slot.id))
  const guestIds = new Set(guests.map((guest) => guest.id))
  const byGuestId = new Map<string, string>()
  for (const pin of pins) {
    if (slotIds.has(pin.tableId) && guestIds.has(pin.guestId)) {
      byGuestId.set(pin.guestId, pin.tableId)
    }
  }
  return byGuestId
}

/**
 * `tables` always has an entry for every id drawn from `slots`; this documents that rather than
 * asserting past it. Generic and exported so `allocate.ts`'s mutable `BuildingTable` map and this
 * file's `SeatedTable` one share the one lookup.
 */
export function tableFor<T>(tables: ReadonlyMap<string, T>, id: string): T {
  const table = tables.get(id)
  if (!table) {
    throw new Error(`no table built for ${id}`)
  }
  return table
}

/**
 * The plan the pins alone describe: no protocol seating, no filling — so a non-protocol guest
 * hand-pinned to the top table **is** seated there, which is what gives TT-14's top-table rule
 * something to fire on before `allocate` ever runs.
 */
export function seatPins(room: RoomConfig, guests: Guest[], pins: Pin[]): SeatingPlan {
  const slots = tablesInRoom(room)
  const honoured = resolveHonouredPins(slots, guests, pins)

  const tables = new Map<string, SeatedTable>()
  for (const slot of slots) {
    tables.set(slot.id, { ...slot, seats: new Array(slot.capacity).fill(null), overflow: [] })
  }

  const unseated: Guest[] = []

  for (const guest of guests) {
    const tableId = honoured.get(guest.id)
    if (tableId === undefined) {
      unseated.push(guest)
      continue
    }

    const table = tableFor(tables, tableId)
    const seats = table.seats.slice()
    const freeIndex = seats.findIndex((seat) => seat === null)
    if (freeIndex === -1) {
      tables.set(tableId, { ...table, overflow: [...table.overflow, { guest, pinned: true }] })
    } else {
      seats[freeIndex] = { guest, pinned: true }
      tables.set(tableId, { ...table, seats })
    }
  }

  return { tables: slots.map((slot) => tableFor(tables, slot.id)), unseated }
}

export type PlanOccupancy = {
  /** Every guest the plan knows about: seated + overflow + unseated. */
  guests: number
  /** Guests holding a real seat index. A guest in a table's `overflow` does not count — pinned
   *  to a table with no room left is not a seat. */
  seated: number
  /** Sum of every table's capacity. */
  totalSeats: number
  /** `totalSeats - seated`. */
  freeSeats: number
}

/**
 * The one definition of "seated" (TT-47, TT-48), shared by `everyoneSeated.rule.ts` and
 * `score.ts` so the rule that flags an unseated guest and the factor that scales the score for
 * one can never disagree about who counts. Typed against a structural `Pick`, not `RulePlan`
 * from `./rules/contract` — that file imports from here, and importing back would be a cycle.
 */
export function planOccupancy(plan: Pick<SeatingPlan, 'tables' | 'unseated'>): PlanOccupancy {
  let seated = 0
  let overflow = 0
  let totalSeats = 0

  for (const table of plan.tables) {
    totalSeats += table.capacity
    seated += table.seats.filter((seat) => seat !== null).length
    overflow += table.overflow.length
  }

  return {
    guests: seated + overflow + plan.unseated.length,
    seated,
    totalSeats,
    freeSeats: totalSeats - seated,
  }
}
