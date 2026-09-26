# PRD — Simplenote for Omarchy (working name: `snote`)

Status: draft v1 · 2026-09-18

## 1. Summary
A terminal (TUI) Simplenote client for Omarchy that signs in like the official apps, syncs in real time
through Simperium exactly as the macOS client does, and covers every user-facing Simplenote feature,
but with an Omarchy-native, keyboard-first, themed, sub-100 ms interface instead of Electron.
The sync engine, data model, search parser and note utilities are vendored from the open-source
`simplenote-electron` client (GPL-2.0). Only the UI and the Linux/Omarchy integration are new.

## 2. Goals
- G1  Feature parity with Simplenote for everything a user can do to notes (see §5).
- G2  Sign in the same ways as the official apps (email + emailed code, or email + password).
- G3  Sync behaviour identical to official clients: live websocket sync, offline edits, conflict merge, history.
- G4  Omarchy-native: launched as a floating TUI from the Omarchy menu and a hotkey, themed by the terminal, driven entirely from the keyboard, edits in `$EDITOR`.
- G5  Lightweight: single install, no browser runtime, tiny footprint (numbers in §7).
- G6  Open source (GPL-2.0, inherited from vendored code) and easy to keep in step with upstream Simplenote (`scripts/vendor.sh --diff`).

## 3. Non-goals (v1)
- Account creation, password reset, email verification (link out to app.simplenote.com).
- WordPress.com OAuth login.
- A built-in rich text editor. Body editing is delegated to `$EDITOR`.
- Evernote import, PDF/HTML export, spell check, focus mode, analytics, auto-update.
- GUI (Quickshell/QML) plugin. A shell plugin for quick-capture may follow in v2.
- Collaboration (sharing a note with another account). Read-only display of the `shared` flag only.

## 4. Users
Omarchy users who already use Simplenote on macOS/iOS/Android and want the same notes on Linux without Electron.

## 5. Functional requirements
Each FR maps to an eval in `docs/EVALS.md` and one or more tasks in `TASKS.md`.

Auth
- FR-1  Login with email + emailed code (`POST app.simplenote.com/account/request-login`, then `complete-login` → `sync_token`).
- FR-2  Login with email + password (Simperium `authorize`, app id `chalk-bump-f49`).
- FR-3  Token stored at `$XDG_DATA_HOME/snote/auth.json` mode 0600. Password never written to disk. Logout wipes token and local data.

Sync
- FR-4  Live two-way sync over Simperium websocket using the vendored `simperium` client and Redux sync middleware.
- FR-5  Offline-first: all reads and writes work offline; changes queue and flush on reconnect.
- FR-6  Local state (notes, tags, ghosts, change version) persisted to disk between runs; restart resumes from the stored `cv`, no full re-index.
- FR-7  Conflicts resolved the same way as the Electron client (three-way patch from the ghost). Unknown fields and unknown system tags round-trip untouched.
- FR-8  Note history: list previous versions and restore one.

Notes
- FR-9  Create, open, edit (in `$EDITOR`), and auto-save; saving the editor buffer publishes the change.
- FR-10 Trash, restore from trash, delete forever, empty trash.
- FR-11 Pin/unpin. Markdown flag on/off. Publish/unpublish and display the publish URL (copy to clipboard).
- FR-12 Markdown preview rendered in the terminal for notes with the markdown flag.
- FR-13 Note list shows title and preview exactly as upstream `note-utils` computes them.

Tags
- FR-14 Add/remove tags on a note; tag autocomplete; rename and delete a tag across all notes; reorder tags.
- FR-15 Filter the note list by tag; show untagged notes.

Search & sort
- FR-16 Search using the upstream query grammar: terms, quoted phrases, `tag:` filters, matching upstream results for the same query.
- FR-17 Sort by modified, created, or title; ascending/descending; pinned always first.

UI
- FR-18 Three-pane layout (tags · notes · preview) collapsible to two or one pane for narrow terminals.
- FR-19 Every action reachable by a documented key; `?` shows help generated from the live keymap.
- FR-20 Uses only the 16 ANSI terminal colours so every Omarchy theme applies automatically.
- FR-21 Sync status indicator (connected / offline / pending changes).

Omarchy integration
- FR-22 Installable through Omarchy's Install > TUI flow (`omarchy-tui-install`) and launched via `omarchy-launch-tui --app-id=TUI.float snote`.
- FR-23 Documented `bindings.lua` snippet; `snote --check` verifies the environment.
- FR-24 Packaged as an AUR `PKGBUILD` and as a single `npm`-free tarball.

## 6. Keyboard map (default, vi-flavoured)
`j/k` move · `Enter` open · `e` edit in $EDITOR · `n` new · `/` search · `t` tags · `p` pin · `m` markdown toggle
`v` preview toggle · `d` trash · `u` restore · `D` delete forever · `P` publish toggle · `h` history · `s` sort
`Tab` next pane · `Esc` back/close · `?` help · `q` quit · `r` force sync · `y` copy publish URL

## 7. Non-functional requirements (hard gates)
| Metric | Gate |
|---|---|
| Cold start to first frame, 10 000 notes cached | < 150 ms |
| Search latency, 10 000 notes | < 50 ms |
| Resident memory after load, 10 000 notes | < 120 MB |
| Install size (node_modules pruned, no dev deps) | < 40 MB |
| Typecheck, lint, unit, integration | 0 failures |
| Keymap ↔ help table | 100% coverage |

## 8. Success metrics
- Daily use by the owner replaces the macOS client on Linux for two weeks with no data loss.
- Every FR has a passing automated eval.
- `scripts/vendor.sh --diff` shows zero unported upstream changes at release.

## 9. Assumptions (decided, revisit only if wrong)
- A1 Simperium's public API stays available; app id and key live in config and are swappable.
- A2 A throwaway Simplenote account exists for the nightly real-account smoke test. Never point the loop at the owner's real account.
- A3 License is GPL-2.0 because vendored code is GPL-2.0.
- A4 Working name `snote` is a placeholder; rename before publishing.
