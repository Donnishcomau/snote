# Changelog

All notable changes to snote are documented here. Versions follow [Semantic
Versioning](https://semver.org/).

## 0.1.1

### Fixed

- `snote --version` (or `-v`) now prints `snote 0.1.1`, so the version the
  bug-report template asks for is easy to get.

## 0.1.0 — initial public release

First public release of snote, a keyboard-driven terminal client for
Simplenote built for Omarchy.

### Features

- Three-pane TUI (tags / notes / preview) with full keyboard navigation
  (`j`/`k`, `Tab`, arrow keys).
- Rendered markdown preview (`v`) alongside the raw note editor.
- Note editing through your `$EDITOR` (or Omarchy's Omawrite by default),
  with checklist item toggling (`c`) and adding (`a`) inline.
- Tagging: a dedicated tags pane, add/rename/delete/reorder tags (`g`, `t`,
  `R`, `x`, `J`/`K`).
- Search (`/`), sort by modified/created/A-Z with reverse order (`s`/`S`),
  and pinning (`p`).
- Trash workflow: move to trash, restore, delete forever, and empty trash
  (`d`, `u`, `D`, `T`, `E`).
- Publish/unpublish a note and copy its public link (`P`, `y`).
- Note history with restore (`h`).
- Export a single note to a `.md` file (`w`).
- Login by email code or password; log out with a confirmation (`L`).
- `snote --check` diagnostic command and `snote --report` bug-report bundle.
- Terminal colours use only the 16 ANSI colours from your theme — no
  hardcoded palette.

### Sync reliability

- Sync runs on Simperium, the same service the official Simplenote apps use,
  keeping notes, tags, and pins consistent across devices.
- Offline edits are queued locally and sent once the connection is back, and
  are rebased three-way onto the server's current version so a concurrent
  remote edit no longer causes data loss on reconnect.
- An edit made while snote is closed is still delivered after the next
  launch, including when the server's catch-up reply carries no changes of
  its own.
- One sync client instance per account data directory, enforced by a lock
  file, so two processes can no longer race and corrupt local state.
- Published links use `https://simp.ly/...` rather than plain `http`.

### Security hardening

- All server-supplied text (note content, tags, and other synced strings)
  passes through a terminal sanitizer before it is rendered, closing a class
  of terminal control-sequence injection issues, including in the tag editor
  and the note preview's tag line.
- The account token is bound to the server it came from and is never sent
  elsewhere.
- The local data directory and its files are created with restrictive
  permissions (`secureMkdir`, 0600 files) instead of the previous default
  directory mode.
- Note export no longer follows a symlink at the destination path.
- Emoji with a variation selector (e.g. a heart with `U+FE0F`) no longer
  misaligns the panes; the sanitizer now strips variation selectors.

See `docs/release-notes-0.1.0.md` for the fuller release notes.
