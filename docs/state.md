# State

## One store

[`src/store/store.ts`](../src/store/store.ts) holds the event, the room config, the guest list,
which scenario (if any) is loaded, and the pins. That is the whole of the product's persistent
state, because everything is local: there is no server copy and nothing to reconcile against.

```ts
type TopTableData = {
  event: EventDetails    // { name: string }
  room: RoomConfig       // { roundTables, seatsEach, topTableSeats }
  guests: Guest[]        // KB-3, thirteen fields
  scenario: ScenarioState // ScenarioId | 'custom' | null — which scenario is loaded, if any (TT-4)
  pins: Pin[]             // { guestId, tableId } — a human decision, so it is stored (TT-12)
}
```

## What it deliberately does not hold

**The plan, the seat assignments and the violations.** They are derived from this data plus the
rules. Storing a violation list would let it disagree with the guests it describes, and then the
screen and the plan would each be right about something different.

**Pins are the exception, and they are held.** A pin is a human decision, not a derivation
(TT-12), so unlike the plan, the seat assignments and the violations above, it is real stored
state rather than something the app recomputes.

**TT-13's allocated seating is exactly this kind of derived state.** It is computed on demand
from the room, the guest list, the pins and whatever rules are registered — never written back.
Whether the room has been auto-allocated at all is `PlanScreen`'s own view state, not a field on
`TopTableData`, which is why `STORAGE_VERSION` did not move when the seating model landed.

**Anything computed.** Total seats is `roundTables * seatsEach + topTableSeats` and lives with the
setup screen, TT-3. Nothing that can be recomputed from the three fields above belongs here.

## The write surface

`setEventName`, `setRoom`, `setGuests`, `importScenario`, `reset`, `addGuest`, `updateGuest`,
`removeGuest`, `pinGuest` and `unpinGuest`. `setEventName`, `setRoom` and `setGuests` are what
TT-2 needs to stand the project up and prove persistence.

**Guest add, edit and remove are here, and reciprocity is not improvised in this file.**
`partnerOf` and `conflictsWith` are reciprocal — present on both guests, resolvable from either
direction — so adding a guest with a partner writes two records, and removing a guest has to
unpick every reference to them from both sides. That is real domain behaviour with its own
acceptance criteria (TT-5), and it lives in one place: `src/domain/guests.ts`. `addGuest`,
`updateGuest` and `removeGuest` on the store are one-line delegates onto the domain functions of
the same name — this file holds no reciprocity logic of its own. `removeGuest` also reconciles
pins in that same call (TT-12): a removed guest's pin, if they held one, is cleared inside
`src/domain/guests.ts` itself, not as a step beside it.

**`pinGuest` and `unpinGuest` are the same kind of delegate, onto `src/domain/pins.ts`** (TT-12).
Placing a guest pins them at a table; releasing drops that pin. Neither validates the guest or
table id — the caller reads the guest out of the list first, and a pin naming nothing real is
simply left unresolved wherever the plan is built from the pins.

`setGuests` replaces the whole list, because a scenario import is a replacement and not a merge.
Both it and `importScenario` clear the pins in the same `set` call, because every pin names a
guest who may no longer be in the new list. `setRoom` leaves the pins alone — editing the room is
not editing who is pinned, even though it can strand a pin on a table that no longer exists.

**`importScenario` (TT-4) replaces the guest list and the room together, in one `set` call**, so
the replacement is atomic rather than a convention two separate writes have to honour. The event
name is untouched — TT-4 does not set it. The room it writes comes from the scenario's own manifest
entry, not from the caller, so a caller cannot pair one scenario's id with another's room.

**`setRoom` detaches from a loaded scenario.** Any patch — including one that leaves every number
unchanged — moves `scenario` from a loaded id to `'custom'`, because editing the room is what "you
changed something" means here. A store that has never imported anything stays `null`: there is
nothing yet to be "Custom" relative to.

## Persistence

Zustand's `persist` middleware, one key, `top-table`.

```ts
export const STORAGE_KEY = 'top-table'
export const STORAGE_VERSION = 4
```

**Storage is not a trusted input.** It survives across releases, it is editable by hand in dev
tools, and the origin is shared with whatever else has run there. So every path through it is
wrapped, and a read that cannot be trusted returns null and the store falls back to first visit:

| What happened | What the app does |
|---|---|
| Nothing stored, first visit | First-visit state |
| Storage cleared while the app was open | First-visit state, no error |
| Stored value is not JSON | First-visit state, no error |
| Stored value parses but has the wrong shape | First-visit state, no error |
| Stored version is not `STORAGE_VERSION` | Discarded, first-visit state |
| `localStorage` throws on every call | App runs, state works in memory, nothing persists |

That last row is a private window, or a browser set to block site data. Writes are wrapped too: a
full quota must not take the app down.

**A version that does not match is discarded rather than migrated.** While nothing is released
there is no real shape to migrate from, and a migration written against a hypothetical old version
is untested code guarding data that never existed. Once there is a released version, this becomes a
real `migrate` and the honest answer changes.

`partialize` writes the five data fields and never the actions.

TT-13 needed no version bump: the table address it canonicalised — `'top'`, `roundTableId(n)` —
is the same string scheme already written into every pin in storage, so every pin from before
that ticket stays valid.

## First visit

```ts
{
  event: { name: '' },
  room: { roundTables: 0, seatsEach: 0, topTableSeats: 0 },
  guests: [],
  scenario: null,
  pins: [],
}
```

Zeroed room numbers are the unconfigured state. KB-6's first-visit screen shows empty config fields
and reads "No guests yet, so nothing to work out", so nothing has been decided yet and the numbers
say so.

An empty screen is an invitation, not an apology — how that reads is TT-3's and TT-7's business,
but the state it reads from is this one.
