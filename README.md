# Top Table

A seating planner for a wedding. The user is the couple, or a planner working for them.

Everything is local. No accounts, no server, no sharing, and no ambition to have any: the data
lives in the browser and a scenario import replaces it.

## The idea it turns on

You already know the best man sits next to the groom and that nan needs to be near a door. You do
not care where the rest go.

Placing someone by hand **pins** them, and auto-allocate works around the pins rather than over
them. The tool is not replacing judgement — it is doing the boring ninety percent around the
decisions already made.

## Running it

```bash
nvm use          # Node is pinned in .nvmrc
npm ci
npm run dev      # http://localhost:5173
```

`npm ci` also installs the git hooks, by pointing `core.hooksPath` at `.githooks/`.

Right now `npm run dev` gets you the scaffold and nothing more: a form that proves state reaches
local storage and comes back after a refresh. The setup, guests and plan screens are TT-3 to TT-6
and the shell they sit in is TT-7.

## The requirements are not in this repo

They are in **Tickety**, an issue tracker and knowledge base served over MCP. This repo holds *how*
we build. Tickety holds *what* we are building and why.

It is served from `tickety.enablis.tech`, and a fresh clone reaches it with nothing to install and
nothing to start. [`AGENTS.md`](AGENTS.md) has the connection and the traversal. Read it before
changing anything — a requirement inferred from this repo alone is a guess.

## Scripts

| Script | Does |
|---|---|
| `npm run dev` | Dev server |
| `npm run build` | Production build |
| `npm run preview` | Serves the production build locally |
| `npm run verify` | The gate: typecheck, lint, test. What CI runs |
| `npm run typecheck` | `tsc --noEmit` |
| `npm run lint` | ESLint, with type-aware rules |
| `npm run test` | Vitest once. `npm run test:watch` to stay in it |
| `npm run generate:scenarios` | Regenerates the three example weddings. Seeded, so output is identical every time |

A change is not done because it worked when you tried it by hand. Run `npm run verify`, all three
of it.

## Layout

```
src/
  domain/     The domain model, the rules and the allocation engine. Pure
  store/      The single store, and its persistence
  App.tsx     Placeholder. TT-7 replaces it
public/
  scenarios/  Three example weddings: 40, 70 and 200 guests
docs/         Engineering standards
.claude/
  agents/     Five agents: planner, ui-developer, model-developer, tester, reviewer
```

`src/domain/` is pure — no rendering, no React, no store, and no import of anything that renders.
The UI imports from the domain and the domain imports nothing back. That boundary is what keeps
the solver from learning about React.

## Where to read next

| | |
|---|---|
| [`AGENTS.md`](AGENTS.md) | The entry point. How to reach the requirements, the ground rules, the agents |
| [`docs/`](docs/README.md) | Engineering standards, state and persistence, git and releases |
| [`docs/style-guide.html`](docs/style-guide.html) | The brand, as a working page. Open it in a browser |

## Scope

**Never build ahead of the board.** Drag and drop, undo, any rule beyond capacity, catering output,
export, print, sharing and accounts are all deliberately out of the MVP and already ticketed. KB-1
in Tickety is the list.
