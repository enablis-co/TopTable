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

Three workflows in [`.github/workflows/`](../.github/workflows):

| Workflow | Runs on | Does |
|---|---|---|
| `checks.yml` | Called by the other two | Install, typecheck, lint, test |
| `pull-request.yml` | Pull requests into `main` | Calls `checks.yml` |
| `main.yml` | Pushes to `main` | Calls `checks.yml`, then releases |

`checks.yml` is a reusable workflow rather than two copies of the same steps. "The same checks run
again on merge" is then true by construction, instead of true until somebody edits one of them.

Both read Node from `.nvmrc`, so CI and your machine cannot drift apart.

**A failure blocks the merge only if the check is required.** Add `checks / verify` to the branch
protection rule for `main`, or "blocks the merge" is a convention rather than a gate. The workflow
cannot enforce this on its own — nothing in this repo can. It is a setting on the repository.

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
