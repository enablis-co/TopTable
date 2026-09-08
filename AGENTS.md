# Top Table

A seating planner for a wedding. The user is the couple, or a planner working for them.
Everything is local: no accounts, no server, no sharing.

## The requirements are not in this repo

They are in **Tickety**, an issue tracker and knowledge base served over MCP. This repo holds
*how* we build. Tickety holds *what* we are building and why.

An agent reads the repo whether you ask it to or not. It never finds Tickety unless it goes
looking. So the half of the truth that matters most — the rules, the data meaning, the protocol,
the screens — is the half you will miss by default.

**Do not infer a requirement you could have fetched.** If you have not read the ticket, its epic
and the pages they point at, you are guessing.

```bash
export TICKETY_MCP_URL=http://localhost:3000/mcp   # local; .mcp.json defaults to the public host
```

## Getting a ticket's requirements

Four steps, in this order. Do all of them before writing code.

1. **The ticket.** `getJiraIssue` with the key, for example `TT-14`.
2. **Its epic.** `getJiraIssue` on the ticket's `parent`. The epic carries the definition of done
   for the whole group and the ticket does not repeat it. This step is skipped more often than any
   other and it is where the acceptance criteria you are missing usually are.
3. **Its pages.** `getConfluencePage` on every entry in `remoteLinks`. These come back as an id
   and a title only — never content — so you have to ask.
4. **One hop further.** Those pages have `relatedPages`, also references only. Follow them.
   `KB-2` points at `KB-4`, and the top table protocol only exists there.

**Read the comments.** Some tickets carry their only route onward in a comment rather than in a
link. `TT-24` names `KB-4` in a comment and links nothing.

`searchJiraIssuesUsingJql` finds work: `parent = TT-1`, `status = "Ready for development"`,
`labels = "domain"`. It returns summaries only, so read a hit properly with `getJiraIssue`.

## Ground rules

- **A thin ticket is thin on purpose.** `TT-24` and `TT-25` have a title and nothing else because
  someone else writes that specification. Never fill one in, and never invent an acceptance
  criterion to have something to build.
- **Never build ahead of the board.** KB-1 lists what is deliberately out of the MVP. Drag and
  drop, undo, any rule beyond capacity, catering output, export and sharing are all on the board
  already, under TT-21 to TT-25 and TT-31 to TT-34.
- **The allocation engine is pure domain logic.** No rendering, no React, no store. Rules do not
  mutate the plan, do not depend on the order they run in, and produce the same result twice.
- **Adding a rule must not require editing a shared file.** Several people add rules at once.
- **Follow KB-5 and KB-6 for anything visual.** Warm paper, IBM Plex Sans, deep slate, no success
  colour, no shadows, and colour never carries meaning on its own. Top Table shares a projector
  with Tickety and the two must read as software from different companies. Do not drift toward
  Tickety's cool grey and teal.

## Agents

Five, in `.claude/agents/`. The model is set explicitly on each, because the default is inherit
and an Opus session would otherwise spawn Opus throughout.

| Agent | Model | Responsible for |
|---|---|---|
| `planner` | opus | Reads the ticket and the pages it points at, produces acceptance criteria and a file plan. Writes no code |
| `ui-developer` | sonnet | Screens, components and state. Works to KB-5 and KB-6 |
| `model-developer` | sonnet | The allocation engine, the rules and the domain model. Works to KB-2 and KB-3 |
| `tester` | sonnet | Writes tests from the acceptance criteria. **Never reads the implementation** |
| `reviewer` | opus | Reads the diff cold and reports. **No Write, no Edit** |

Plan on Opus, build on Sonnet. If a Sonnet agent cannot implement from the plan, tighten the plan
rather than raising the model.

## Branches and commits

- Nothing is committed directly to `main`
- Every branch name carries the issue key: `feat/TT-14-rules-engine`
- Every commit message carries the issue key, first: `TT-14: add the capacity rule`
- Work that belongs to no ticket does not get committed

## Done

```bash
npm run typecheck && npm run lint && npm run test
```

All of them, not the tests you just wrote. A change is not done because it worked when you tried
it by hand. CI runs the same checks on the pull request and again on merge.

## Where this is incomplete

This is the bootstrap. `TT-2` is the ticket that finishes it: the `.claude/agents/` definitions,
`docs/` for the engineering standards, and the pipeline. Fetch `TT-2` and work from that rather
than from this file.
