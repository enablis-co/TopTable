# Git and releases

## Four rules

- Nothing is committed directly to `main`
- Every branch name carries the issue key: `feat/TT-14-rules-engine`
- Every commit message carries the issue key, first: `TT-14: add the capacity rule`
- Work that belongs to no ticket does not get committed

The last one is the one that matters. If you cannot name the ticket, the work is not ready to
commit — and that is usually a sign it was not ready to start.

## The hooks make them real

Two, in [`.githooks/`](../.githooks), installed by `npm ci`. The `prepare` script points
`core.hooksPath` at that folder, so a clone that has run `npm ci` has them and nobody has to
remember a setup step.

| Hook | Refuses |
|---|---|
| `pre-commit` | A commit on `main`. A branch name with no issue key |
| `commit-msg` | A subject line that does not lead with `TT-<n>: ` |

`commit-msg` lets git's own machinery through: merges, reverts, and `fixup!`, `squash!` and
`amend!`. Those are not ours to reformat.

The branch checks are in `pre-commit` rather than `commit-msg` so that a wrong branch costs you
nothing — you find out before you write the message, not after.

`--no-verify` bypasses both, because git offers it and a hook cannot take it away. If you are
reaching for it, the work wants a ticket.

## The pipeline

Four workflows in [`.github/workflows/`](../.github/workflows):

| Workflow | Runs on | Does |
|---|---|---|
| `checks.yml` | Called by `pull-request.yml` and `main.yml` | Install, typecheck, lint, test |
| `pull-request.yml` | Pull requests into `main` | Calls `checks.yml` |
| `main.yml` | Pushes to `main` | Calls `checks.yml`, works out the version, then tags and releases *and* publishes the site |
| `infrastructure.yml` | Pull requests and pushes to `main` that touch `infra/` | Posts a changeset; applies it on merge, gated |

`checks.yml` is a reusable workflow rather than two copies of the same steps. "The same checks run
again on merge" is then true by construction, instead of true until somebody edits one of them.

`checks.yml` reads Node from `.nvmrc`, so CI and your machine cannot drift apart. `infrastructure.yml`
runs no Node at all — its steps are `aws` and `gh`, nothing that needs a version pinned.

**A failure blocks the merge only if the check is required.** Add `checks / verify` to the branch
protection rule for `main`, or "blocks the merge" is a convention rather than a gate. The workflow
cannot enforce this on its own — nothing in this repo can. It is a setting on the repository.

`infrastructure.yml` is path-filtered: a change that touches nothing in `infra/` deploys no
infrastructure, and the workflow does not run at all. For exactly that reason it must **not** be
added to the branch protection rule for `main` alongside `checks / verify` — a required check that
the path filter skips never reports, and every pull request that does not touch `infra/` would
block on it forever.

The merge commit is tested even though both sides passed on their own, because the merge result is
a commit that neither side tested.

## How a version is applied

A semantic version tag on the merge commit. The first is `v0.1.0` and each later merge bumps the
minor version.

```
no tags        -> v0.1.0
v0.1.0         -> v0.2.0
v0.9.0         -> v0.10.0
v1.2.0         -> v1.3.0
```

The next version comes from the highest existing tag, sorted by version and not by date or
alphabet — `--sort=-v:refname`, which is why `v0.11.0` beats `v0.9.0`. Bumping by one from the
highest tag cannot skip a version and cannot land on one already taken. If it somehow does, the
job stops rather than moving an existing tag.

**Re-running the workflow on the same commit does not produce a second tag.** The job looks for a
version tag already pointing at `HEAD` and stops if it finds one.

Releases are serialised through a `concurrency` group, so two merges landing together cannot both
read the same latest tag and compute the same next version.

**The version calculation is its own job.** `version` runs once, after `checks`, and outputs the
version either way: the tag already on the commit if there is one, the next tag if not. Both
`release` and `publish` (below) read that one output, so they cannot disagree about what was
published, and a tagging failure in `release` does not stop `publish` from going out — `publish`
does not depend on `release` at all.

### Minor per merge, rather than read from the commits

Conventional commits would give `feat:` and `fix:` to bump from, but our commit format leads with
the issue key instead, and a message like `TT-14: add the capacity rule` carries no version
intent. Rather than bolt a second convention onto the subject line, every merge is a minor bump.
It costs nothing while nothing is released, and it means the tag is never a guess about what a
commit meant.

### The tag is the version, and `package.json` is not

`package.json` stays at `0.0.0`. The alternative is a workflow that commits a version bump to
`main`, which retriggers the workflow that just ran and needs a `[skip ci]` convention to break the
loop. One source of truth, and no commits authored by CI on the default branch.

## Publishing `main`

`publish` (`main.yml`) is gated on `checks` the same way `release` is, and takes its version from
the same `version` job. It builds `dist/` with `VITE_APP_VERSION` set to that version, syncs it to
the live bucket in three passes, invalidates CloudFront, waits for that to complete, and then
confirms the live site is serving the build it just pushed. Every value it needs — the bucket, the
distribution id, the region, the site URL and the publish role's ARN — comes from the `production`
GitHub Actions environment; see `infra/README.md`'s environments table for what each one holds and
how it is set. Nothing account-specific is written into the workflow. See KB-7 for why the pipeline
is shaped this way; the workflow's own inline comments carry the same detail at the point of danger.

**Three sync passes:**

1. `dist/assets/` (content-hashed) to `assets/`, `--cache-control 'public, max-age=31536000,
   immutable'`, no `--delete`.
2. Everything else — `index.html`, `favicon.svg`, `mark.svg`, `robots.txt`, `scenarios/*.json` —
   `--cache-control 'no-cache'`, excluding `assets/*` and `tt-*/*`, with `--delete`.
3. `dist/assets/` again, this time with `--delete` and no cache-control change, run only after the
   invalidation below has completed.

**Re-running `publish` on a commit that already published is harmless, though not a no-op.**
`version` resolves to the existing tag and the build reproduces byte-identical hashed assets — but
a fresh checkout gives every file in `dist/` a current mtime, so `aws s3 sync` re-uploads all of it
regardless of whether the bytes changed. Same bytes, same headers, so still harmless. What is
accurate: both `--delete` passes find nothing new to remove, and the invalidation refreshes the
same six paths.

### Publishing runbook — checks after a merge

The suite cannot see a `.yml` workflow at all, so none of this is covered by `npm run verify`. Run
these once, after the first merge that includes a change to `publish`, or whenever the workflow
itself is suspect. Every one observes the deployed site, never the workflow that produced it — in
the idiom of `infra/README.md`'s `V`-checks.

| # | Check | Expected |
|---|---|---|
| P1 | The `main` run's job list | `checks`, `version`, `release`, `publish`. `publish` started only after `checks` succeeded |
| P2 | `curl -sS https://toptable.enablis.tech/` | `200`, and the bundle filename matches `dist/index.html` from the same commit |
| P3 | The bottom of the left nav rail, in a browser | Reads the version the `version` job resolved, in white, in mono |
| P4 | `curl -sSI https://toptable.enablis.tech/index.html` | `cache-control: no-cache` |
| P5 | `curl -sSI https://toptable.enablis.tech/assets/<hashed>.js` | `cache-control: public, max-age=31536000, immutable` |
| P6 | `curl -sSI` on `/favicon.svg`, `/mark.svg`, `/robots.txt`, `/scenarios/adding-up.json` | `no-cache` on all four |
| P7 | `curl -sS https://toptable.enablis.tech/robots.txt` | `200`, still contains `Disallow: /tt-` |
| P8 | Before the merge, upload a throwaway `tt-0/index.html`; after it, `curl -sSI https://toptable.enablis.tech/tt-0/`; then delete it | `200`, not `404` — the production publish did not delete it |
| P9 | Re-run the same `main` run from the Actions UI | `release` skipped, `publish` green, site unchanged, no second tag |
| P10 | `gh secret list` for the repository and each environment; `grep -rn 'AKIA' .` | Nothing |
| P11 | `grep -n 'toptable-site\|enablis.tech\|arn:aws' .github/workflows/main.yml` | No match — every value comes from the environment |

**P8 is the one that earns its place.** Until previews (TT-43) exist there is no real preview to
lose, which makes a throwaway `tt-0/` prefix the only evidence available that a production publish
leaves other prefixes alone.
