# snote — agent guide

This guide is for coding agents (and humans) preparing changes to snote, the
terminal client for Simplenote.

## Architecture

Start with [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md): Stack, Layout, Data
flow, Vendoring rules, Theming, and Auth.

## Vendoring rule

`vendor/simplenote/**` is upstream code. Make the smallest possible change
there, and mark every changed line with a trailing `// OMARCHY:` comment.
When a vendored or untyped type blocks the typechecker, cast at the boundary
in `src/core` (`// OMARCHY: boundary cast`); do not redesign vendored types.

## Verification

`make check` runs every gate before a change is done: typecheck, lint, all
tests, the keymap gate, and the ANSI gate (plus the perf bench). See
[docs/EVALS.md](docs/EVALS.md).

## Test conventions

- Poll with `vi.waitFor` for anything asynchronous — never fixed `setTimeout`
  delays. See `test/tui/list-export-and-lock.test.tsx`.
- Test new keys at width >= 100 too, because that is where the tags pane
  opens by itself.
- `test/fake-simperium/server.ts` must mirror the real wire protocol, not
  whatever the client happens to expect.
- Tests never open a real editor window: `test/setup.ts` points
  `SNOTE_EDITOR` at a stand-in.

## Security invariants

These hold on every path and must keep holding:

- All server-supplied text passes through `sanitizeForTerminal` at the render
  boundary (`src/core/sanitize.ts`).
- The account token is bound to the server it came from; never send it
  elsewhere.
- The data dir and its files are created via `secureMkdir` / 0600 permissions
  (`src/core/secure-fs.ts`).
- One instance per account dir, enforced by the lock in
  `src/core/instance-lock.ts`.
- Sync fixes ship with a failing test first.

## Pull requests

See CONTRIBUTING.md. A failing test doubles the chance of a fix.
