# Top Table

A seating planner for a wedding. The user is the couple, or a planner working for them.

Everything is local. No accounts, no server, no sharing, and no ambition to have any: the data
lives in the browser and a scenario import replaces it.

## Start here

Four steps. The whole thing takes about two minutes.

1. **Look at what you are building.** It is live at
   **[toptable.enablis.tech](https://toptable.enablis.tech)**. Load a scenario and place a guest.
2. **Run it locally.**

   ```bash
   nvm use          # Node is pinned in .nvmrc
   npm ci
   npm run dev      # http://localhost:5173
   ```

   `npm ci` also installs the git hooks, by pointing `core.hooksPath` at `.githooks/`.
3. **Open the board.** The requirements are not in this repo. They are in **Tickety**:
   **[tickety.enablis.tech](https://tickety.enablis.tech)** for the board,
   **[/wiki](https://tickety.enablis.tech/wiki)** for the knowledge base. Claude reaches the same
   data over MCP with nothing to install and nothing to start.
4. **Check Claude can reach it.** In a session, ask it to read `TT-3`. It comes back with "Set up
   the room". If it cannot, stop and fix it — [`AGENTS.md`](AGENTS.md) has the error table.
   Building from the repo alone is guessing, and the result looks finished.

## The idea it turns on

You already know the best man sits next to the groom and that nan needs to be near a door. You do
not care where the rest go.

Placing someone by hand **pins** them, and auto-allocate works around the pins rather than over
them. The tool is not replacing judgement — it is doing the boring ninety percent around the
decisions already made.

## What to type

Seven agents live in `.claude/agents/`. You do not name them. The table reads in order: find your
way around, read one ticket properly, then build it.

| Say this | What happens |
|---|---|
| `What is Top Table? Read KB-1` | The product in a page, and what is deliberately not in it |
| `What's still open in TT-10?` | The MVP epic. Where the work is |
| `Explain TT-17` | The ticket, its epic and the pages they point at. The epic holds the definition of done |
| `How does a rule get into the engine?` | The code, entered where most tickets land |
| `Plan TT-17` | The planner alone. Stops at `.claude/plans/TT-17.md`. Read it |
| `The plan is thin on X — tighten it` | Fix the plan, not the model |
| `Build TT-17` | The pipeline: planner, developer, tester, reviewer |
| `Write the tests for TT-17 from the plan` | The tester alone. It never reads the implementation |
| `Review this branch` | The reviewer, cold on the diff. Reports, never fixes |
| `/code-review` | The current diff. `--fix` applies what it finds |
| `npm run verify` | Typecheck, lint, test. All three |

**An issue key is the whole instruction.** `Build TT-17` starts with the planner because that is
what the pipeline is. Nobody should have to say so.

**The plan is a file.** `Plan TT-17` and `Build TT-17` both leave it at
`.claude/plans/TT-17.md`, and every agent after the planner reads that rather than re-deriving it
from Tickety. It is gitignored: a plan belongs to one ticket, not to the repo.

The hooks refuse a branch or a commit without the key: `feat/TT-17-conflict-rule`, then
`TT-17: keep conflicting guests apart`.

## The requirements are not in this repo

This repo holds *how* we build. Tickety holds *what* we are building and why.

An agent reads the repo whether you ask it to or not. It never finds Tickety unless it goes
looking — so the half that matters most is the half you miss by default.
[`AGENTS.md`](AGENTS.md) has the connection and the traversal. Read it before changing anything.

## Scripts

| Script | Does |
|---|---|
| `npm run dev` | Dev server, on http://localhost:5173 |
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
  domain/rules/  One file per rule, plus the registry that finds them
  store/      The single store, and its persistence
  screens/    Setup, guests and plan
  shell/      The header and the tab frame
  ui/         Tokens, base styles and the shared components
public/
  scenarios/  Three example weddings: 40, 70 and 200 guests
infra/        The CloudFormation hosting stack
docs/         Engineering standards
.claude/
  agents/     Seven agents: planner, ui-developer, model-developer, tester, reviewer,
              infra-developer, infra-reviewer
  plans/      The planner's output, one file per ticket. Gitignored
```

`src/domain/` is pure — no rendering, no React, no store, and no import of anything that renders.
The UI imports from the domain and the domain imports nothing back. That boundary is what keeps
the solver from learning about React.

Adding a rule must not require editing a shared file. Several people add rules at once, and on a
hackathon day that is not hypothetical.

## Where to read next

| | |
|---|---|
| [`AGENTS.md`](AGENTS.md) | The entry point. How to reach the requirements, the ground rules, the agents |
| [`docs/`](docs/README.md) | Engineering standards, state and persistence, git and releases |
| [`docs/style-guide.html`](docs/style-guide.html) | The brand, as a working page. Open it in a browser |
