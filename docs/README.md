# Engineering standards

How we build Top Table. The root [`AGENTS.md`](../AGENTS.md) is the entry point and says how to
reach the requirements, which are not in this repo. These pages are the detail behind it.

| Page | What it covers |
|---|---|
| [engineering-standards.md](engineering-standards.md) | Stack, project layout, the domain and UI split, TypeScript settings, testing, what the suite cannot see, the gate |
| [state.md](state.md) | The single store, what it holds and does not hold, persistence and first visit |
| [git-and-releases.md](git-and-releases.md) | Branches, commits, the hooks, the pipeline, how versions are applied |
| [style-guide.html](style-guide.html) | The brand, as a working page. Open it in a browser. Design's file, not ours to edit |

## Two things that live elsewhere

**The requirements are in Tickety**, over MCP, not in this repo. `AGENTS.md` has the traversal and
the setup. Nothing here restates a requirement, because a copy is a copy that goes stale.

**The brand decisions are in KB-5**, and `style-guide.html` implements them. The CSS in it is the
starting point for the app's tokens and its component markup can be lifted directly.

> KB-5 refers to this file as `docs/top-table-style-guide.html`. It is `docs/style-guide.html`
> here. The repository is the newer of the two; someone should settle the name before TT-7 builds
> tokens on top of it.
