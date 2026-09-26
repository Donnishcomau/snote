# Evals and gates

`make check` is the single definition of done. It must pass before any commit made by the autonomous loop.
Agents may add tests. Agents may never delete, skip, weaken, or `.only` a test to make `make check` pass.

## Gate composition
| Step | Command | Threshold |
|---|---|---|
| Typecheck | `npm run typecheck` | 0 errors |
| Lint | `npm run lint` | 0 errors |
| Unit + integration | `npm test` | 0 failures, no skipped tests added |
| Keymap coverage | `npm run test:keymap` | every keymap entry has a help string and a handler |
| Theme rule | `npm run lint:ansi` | no hex/rgb/256-colour literals in src/tui |
| Performance | `node scripts/bench.mjs` | start < 150 ms, search < 50 ms, RSS < 120 MB with 10 000 notes |
| Size | `npm run size` | prod install < 40 MB |

Steps that do not exist yet are skipped by `make check` until the task that adds them lands (the Makefile checks for the script).

## Integration tests (fake Simperium)
`test/fake-simperium/server.ts` implements the subset of the Simperium websocket channel protocol used by `simperium@1.1.4` (see `node_modules/simperium/lib/simperium/channel.js`): `init`, `auth`, `i:` index pages, `cv:` change version, `c:` change lists with `ccids`, `e:` entity fetch, `h:` heartbeat, `o` local changes. Scenarios (each a test):
1. fresh login → full index → all notes present
2. restart with stored cv → only delta fetched
3. local create/edit/trash/restore/delete while online → server state matches
4. same while offline → queued → flushed on reconnect in order
5. concurrent remote + local edit on same note → three-way merge, no data loss
6. remote note carries unknown field and unknown systemTag → preserved after local edit
7. tag rename/delete propagates to every note
8. history fetch returns versions; restore creates a new version
9. server sends `unauthorized` → client logs out cleanly

## Real-account smoke (manual / nightly, never in the loop)
`SNOTE_TEST_EMAIL` + `SNOTE_TEST_PASSWORD` for a throwaway account: login, create, edit, tag, publish, trash, delete, logout. `npm run smoke:real`.

## UI snapshot tests
`ink-testing-library` golden frames for: list, search results, tag pane, help overlay, history view, login screen, at 80×24 and 120×40.
