# Architecture

## Stack
- Runtime: Node 26 (already on Omarchy via mise); TypeScript, ESM.
- Sync: `simperium@1.1.4` (official client used by simplenote-electron), websocket `wss://api.simperium.com/sock/1/chalk-bump-f49/websocket`.
- State: Redux store and reducers vendored from upstream (`vendor/simplenote/state/**`), run headless.
- UI: Ink (React for terminals). Markdown preview via `marked` + `marked-terminal`.
- Storage: one JSON file per account under `$XDG_DATA_HOME/snote/<account>/` (state.json, ghosts.json). Written atomically (tmp + rename), debounced. Move to SQLite only if the 10k-note gates fail.
- Editor: `$EDITOR` (Omarchy default Neovim) on a temp `.md` file; on exit, the buffer is diffed and dispatched as a note edit.

## Layout
```
src/cli/         entry (`snote`), flags: --check, --logout, --data-dir, --app-id
src/core/        headless app: store.ts (makeStore), persistence.ts, auth.ts, sync.ts, keymap.ts, actions.ts
src/tui/         Ink components: App, TagPane, NoteList, Preview, SearchBar, HelpOverlay, HistoryView, StatusBar
vendor/simplenote/   upstream files, pinned by scripts/vendor.sh; edit only with `// OMARCHY:` marked lines
test/            vitest unit + integration; test/fake-simperium/ websocket fake server
scripts/         vendor.sh, loop.sh, check-model.sh, bench.mjs
```

## Data flow
Keypress → Ink component → `dispatch(action)` (upstream action types) → upstream reducers → upstream simperium middleware → `simperium` bucket queue → websocket. Remote changes arrive on the bucket channel → middleware dispatches `REMOTE_NOTE_UPDATE` → reducers → Ink re-render. Persistence middleware snapshots `data` + `simperium` slices to disk.

## Vendoring rules
- `vendor/simplenote/**` is copied verbatim from the pinned upstream commit. Local changes must be minimal, each marked with a `// OMARCHY:` comment, so `scripts/vendor.sh --diff` stays reviewable.
- Browser-only code (`window`, `indexedDB`, `Notification`, analytics, electron IPC) is stubbed or removed behind `// OMARCHY:` markers, never rewritten.
- New behaviour goes in `src/`, never in `vendor/`.

## Theming rule
Only ANSI colours 0–15 plus bold/dim/inverse. No 256-colour or truecolor values anywhere in `src/tui`. This is what makes every Omarchy theme "just work".

## Auth
1. `snote` with no token → login screen: email → request-login → user pastes emailed code → complete-login → `sync_token`.
2. Alternative: `snote login --password` → Simperium `Auth.authorize(email, password)`.
3. Token to `auth.json` (0600). Client `unauthorized` event → wipe token, show login.
