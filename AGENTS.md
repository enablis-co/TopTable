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

`.mcp.json` is committed and reads `${TICKETY_MCP_URL:-http://localhost:3000/mcp}`. The default is
your own machine, because that is where Tickety actually runs today. **The public host is not
deployed.** When it goes up, override the variable to point at it; nothing in this repo has to
change on the day.

MCP has no failover. The client expands that variable once, at config load, and connects once, at
session start. Nothing retries onto a second URL when the first is unreachable, so the default is
not a fallback — it is simply the choice made when you have not made one. Pointing it at localhost
means a missing override lands on a server you can start, rather than a host that does not resolve.

One thing has to be true, and it is not true on a fresh clone.

**Tickety has to be running.** It is a separate repo, cloned alongside this one.

```bash
cd ../tickety && npm ci && npm run dev    # serves http://localhost:3000/mcp
```

Leave it running. Nothing in this repo starts it, and nothing in this repo should try.

### Pointing it somewhere else

Working locally needs no override. To aim at a different host — a deployed Tickety, or a port other
than 3000 — set the variable in `.claude/settings.local.json`, which is gitignored and therefore
yours alone. A shell `export` of the same variable also works and is the better choice for a
terminal session; the settings file is the one that reaches the desktop app, which does not read
your shell profile.

```json
{
  "env": {
    "TICKETY_MCP_URL": "https://tickety.enablis.co/mcp"
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
| `ECONNREFUSED 127.0.0.1:3000` | You are on the default. Tickety is not running, or not on port 3000 |
| `ENOTFOUND tickety.enablis.co` | An override pointed the client at the public host, which is not deployed |
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
- **Never build ahead of the board.** KB-1 lists what is deliberately out of the MVP: drag and
  drop, undo, catering output, export, print, sharing and accounts. Those are on the board under
  `TT-23`, `TT-25` and `TT-31` to `TT-34`, which is exactly the child set of the `TT-30`
  Enhancements epic — so ask the board for TT-30's children rather than trusting that range here.
  **Every rule on KB-2 is in the MVP**, at the severity KB-2 gives it: `TT-14` builds the engine
  and the first three, `TT-17` to `TT-22` add the remaining six, and `TT-16` scores a plan rather
  than being a rule. All of those are `TT-10`'s children, so a seating rule is never "ahead of the
  board" — it is someone else's ticket. This line is a summary, and it has gone stale twice.
- **The allocation engine is pure domain logic.** No rendering, no React, no store. Rules do not
  mutate the plan, do not depend on the order they run in, and produce the same result twice.
- **Adding a rule must not require editing a shared file.** Several people add rules at once.
- **Follow KB-5 and KB-6 for anything visual.** Warm paper, IBM Plex Sans, deep slate, no success
  colour, no shadows, and colour never carries meaning on its own. Top Table shares a projector
  with Tickety and the two must read as software from different companies. Do not drift toward
  Tickety's cool grey and teal.

## Agents

Seven, in `.claude/agents/`. The model is set explicitly on each, because the default is inherit
and an Opus session would otherwise spawn Opus throughout.

| Agent | Model | Responsible for |
|---|---|---|
| `planner` | opus | Reads the ticket and the pages it points at, produces acceptance criteria and a file plan. Writes no code |
| `ui-developer` | sonnet | Screens, components and state. Works to KB-5 and KB-6 |
| `model-developer` | sonnet | The allocation engine, the rules and the domain model. Works to KB-2 and KB-3 |
| `tester` | sonnet | Writes tests from the acceptance criteria. **Never reads the implementation** |
| `reviewer` | opus | Reads the diff cold and reports. **No Write, no Edit** |
| `infra-developer` | sonnet | The CloudFormation template, the workflows and the IAM policies. Works to KB-7 |
| `infra-reviewer` | opus | Reads an infrastructure diff cold as an AWS engineer would. **No Write, no Edit** |

Plan on Opus, build on Sonnet. If a Sonnet agent cannot implement from the plan, tighten the plan
rather than raising the model.

### "Build TT-7" means the pipeline

**A build instruction naming an issue key starts with `planner`, always.** "Build TT-7", "do TT-12",
"pick up TT-9" — the key is the whole instruction. It means `planner`, then the developer the plan
names, then `tester`, then `reviewer` — except an infra ticket, which has nothing a test can cover
and goes `infra-developer` then `infra-reviewer` instead.

No one should have to add "start with the planner agent". If that sentence is load-bearing, this
rule is not doing its job.

And do not plan it yourself instead. `planner` has Write and Edit disallowed, and that is the only
reason its output is a plan rather than a first draft of the code.

### The plan is a file

`planner` returns a report, and the session that ran it saves that report to
`.claude/plans/<KEY>.md`, for example `.claude/plans/TT-14.md`. The planner does not write it
itself: Write and Edit being disallowed there is the only thing keeping its output a plan.

The developers and `tester` read that file rather than re-deriving the plan from Tickety. So does
`reviewer` — as the author's account of what was intended, alongside the ticket it still reads
cold. A plan is one agent's reading of the source, and the gap between the two is where TT-3's
suggestion line ended up in the wrong column.

It is gitignored. A plan is a working artefact for one ticket, and a committed one becomes a second
place for a requirement to live, which is the thing this file keeps warning about.

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
| [engineering-standards.md](docs/engineering-standards.md) | Stack, layout, the domain and UI split, TypeScript, testing, what the suite cannot see, the gate |
| [state.md](docs/state.md) | The single store, what it holds and does not hold, persistence, first visit |
| [git-and-releases.md](docs/git-and-releases.md) | Branches, commits, the hooks, the pipeline, how versions are applied |
| [style-guide.html](docs/style-guide.html) | The brand, as a working page. Design's file, not ours to edit |

Nothing in `docs/` restates a requirement. Requirements live in Tickety, and a copy is a copy that
goes stale.

## Where this is incomplete

`src/ui/` (tokens, base styles, the shared components) and `src/shell/` (the header and the tab
frame) exist now; TT-7 built them. The setup screen is TT-3 and has landed; TT-4 has added the
scenario cards to it. Guests is TT-5 and TT-6 and has landed. The Plan screen's floorplan is TT-11
and has landed; placing is TT-12 and has landed too. The seating model is TT-13 and has landed,
in `src/domain/seating.ts` (the model and the table address) and `src/domain/allocate.ts` (the
solver and the rule seam); the rules engine (TT-14) and the table detail (TT-15) have not.

The store's write surface is `setEventName`, `setRoom`, `setGuests`, `importScenario`, `reset`,
`addGuest`, `updateGuest`, `removeGuest`, `pinGuest`, `unpinGuest` and `clearPins`. `addGuest`,
`updateGuest` and `removeGuest` are thin delegates onto `src/domain/guests.ts`, which owns
reciprocal `partnerOf` and `conflictsWith` and is the only place that logic lives; `pinGuest` and
`unpinGuest` are the same onto `src/domain/pins.ts`; `clearPins` (TT-37) is not, because emptying
a list owns no behaviour worth a domain function. See [docs/state.md](docs/state.md).

The hosting stack is TT-41 and has landed, in `infra/hosting.yaml`, with the first-apply ordering
in `infra/README.md`. Publishing `main` is TT-42 and previews are TT-43, and neither has.
