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

## Connecting to Tickety

`.mcp.json` is committed and reads `${TICKETY_MCP_URL:-https://tickety.enablis.co/mcp}`. **The
public host is not deployed.** The default names where it will live so that nothing in this repo
has to change on the day it goes up. Until then each of us overrides it locally.

Two things have to be true, and neither is true on a fresh clone.

**1. Tickety is running.** It is a separate repo, cloned alongside this one.

```bash
cd ../tickety && npm ci && npm run dev    # serves http://localhost:3000/mcp
```

Leave it running. Nothing in this repo starts it, and nothing in this repo should try.

**2. This project points at it.** Create `.claude/settings.local.json`, which is gitignored and
therefore yours alone. A shell `export` of the same variable also works and is the better choice
for a terminal session; the settings file is the one that reaches the desktop app, which does not
read your shell profile.

```json
{
  "env": {
    "TICKETY_MCP_URL": "http://localhost:3000/mcp"
  }
}
```

**Then restart the session.** MCP servers connect once, at startup. Changing the variable or
`.mcp.json` mid-session does nothing until you restart. Trust the folder when prompted, because
`env` values in a settings file do not apply before you do.

### Knowing whether it worked

Six tools: `getJiraIssue`, `getConfluencePage`, `getJiraIssueRemoteIssueLinks`,
`searchJiraIssuesUsingJql`, `addCommentToJiraIssue` and `transitionJiraIssue`. The parameter is
`issueKey` on the first, `pageId` on the second. Call `getJiraIssue` on `TT-3`; it returns "Set up
the room".

Read the failure rather than working around it:

| Error | Meaning |
|---|---|
| `ENOTFOUND tickety.enablis.co` | The variable never reached the client and it fell back to the undeployed host |
| `ECONNREFUSED 127.0.0.1:3000` | The variable arrived. Tickety is not running |
| Tools absent entirely | The server failed at startup, or the project's MCP servers are unapproved |

**A failure here is not a missing capability, and it is not a reason to proceed.** If the tools
are absent, stop and fix it. Building from the repo alone is the guessing this file exists to
prevent, and it is worse than not starting, because the result looks finished.

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

Two hooks in `.githooks/` refuse the first three, and `npm ci` installs them by pointing
`core.hooksPath` at that folder. The fourth is yours to keep: if you cannot name the ticket, the
work is not ready to commit. [docs/git-and-releases.md](docs/git-and-releases.md) has the detail.

## Done

```bash
npm run typecheck && npm run lint && npm run test
```

Or `npm run verify`, which is the same three.

All of them, not the tests you just wrote. A change is not done because it worked when you tried
it by hand. CI runs the same three on the pull request and again on merge, from one reusable
workflow rather than two copies that drift. A merge to `main` then tags a version and cuts a
release: minor bump each time, starting at `v0.1.0`.

**A failing check blocks the merge only if the check is required.** That is a branch protection
setting on the repository, not something this repo can enforce.

## The detail is in docs/

This file is the entry point and stays short enough to be read. The standards behind it are in
[`docs/`](docs/README.md):

| Page | What it covers |
|---|---|
| [engineering-standards.md](docs/engineering-standards.md) | Stack, layout, the domain and UI split, TypeScript, testing, the gate |
| [state.md](docs/state.md) | The single store, what it holds and does not hold, persistence, first visit |
| [git-and-releases.md](docs/git-and-releases.md) | Branches, commits, the hooks, the pipeline, how versions are applied |
| [style-guide.html](docs/style-guide.html) | The brand, as a working page. Design's file, not ours to edit |

Nothing in `docs/` restates a requirement. Requirements live in Tickety, and a copy is a copy that
goes stale.

## Where this is incomplete

`src/App.tsx` and `src/index.css` are scaffold placeholders and are deliberately plain rather than
half-branded. TT-7 replaces them with the tokens, the type scale and the shell; the three screens
are TT-3 to TT-6. Do not extend the placeholder.

The store's write surface is `setEventName`, `setRoom`, `setGuests` and `reset`. Guest add, edit
and remove are TT-5, because reciprocal `partnerOf` and `conflictsWith` are real domain behaviour
with their own acceptance criteria. See [docs/state.md](docs/state.md).
