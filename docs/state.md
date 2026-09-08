# State

## One store

[`src/store/store.ts`](../src/store/store.ts) holds the event, the room config and the guest list.
That is the whole of the product's persistent state, because everything is local: there is no
server copy and nothing to reconcile against.

```ts
type TopTableData = {
  event: EventDetails   // { name: string }
  room: RoomConfig      // { roundTables, seatsEach, topTableSeats }
  guests: Guest[]       // KB-3, thirteen fields
}
```

## What it deliberately does not hold

**The plan, the seat assignments and the violations.** They are derived from this data plus the
rules. Storing a violation list would let it disagree with the guests it describes, and then the
screen and the plan would each be right about something different.

**The pins are the exception in waiting.** A pin is a human decision, not a derivation, so it will
have to be stored. It arrives with the ticket that introduces placing, not before.

**Anything computed.** Total seats is `roundTables * seatsEach + topTableSeats` and lives with the
setup screen, TT-3. Nothing that can be recomputed from the three fields above belongs here.

## The write surface

`setEventName`, `setRoom`, `setGuests` and `reset`. That is what TT-2 needs to stand the project up
and prove persistence.

**Guest add, edit and remove are not here yet, and that is deliberate.** `partnerOf` and
`conflictsWith` are reciprocal — present on both guests, resolvable from either direction — so
adding a guest with a partner writes two records, and removing a guest has to unpick every
reference to them from both sides. That is real domain behaviour with its own acceptance criteria,
and it belongs to TT-5 rather than being improvised here.

`setGuests` replaces the whole list, because a scenario import is a replacement and not a merge.

## Persistence

Zustand's `persist` middleware, one key, `top-table`.

```ts
export const STORAGE_KEY = 'top-table'
export const STORAGE_VERSION = 1
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

`partialize` writes the three data fields and never the actions.

## First visit

```ts
{ event: { name: '' }, room: { roundTables: 0, seatsEach: 0, topTableSeats: 0 }, guests: [] }
```

Zeroed room numbers are the unconfigured state. KB-6's first-visit screen shows empty config fields
and reads "No guests yet, so nothing to work out", so nothing has been decided yet and the numbers
say so.

An empty screen is an invitation, not an apology — how that reads is TT-3's and TT-7's business,
but the state it reads from is this one.
