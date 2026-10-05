# Changelog

All notable changes to snote are documented here. Versions follow [Semantic
Versioning](https://semver.org/).

## 0.2.3

### Changed

- First-click setup installs Node.js 22 through Omarchy
  (`omarchy-install-dev-env node`) when it is missing, so there is no
  manual step.
- The line under the panes says `focus: preview` when the preview pane
  has focus.
- The bar tooltip's sync age keeps updating while the tooltip is open.

## 0.2.2

### Added

- Arrow keys move between the tags, notes and preview panes.
- The tags list filters the notes as you move; Trash is still on Enter.
- Footer key hint `Tab Tags`.
- `snote --new`, and middle-click on the bar button, starts a new note.
- The bar tooltip shows the note count, the last note and the last sync
  time.

### Changed

- Pane headings are bold, and the focused pane is shown inverse.
- Colours come from theme roles, so key hints are blue, and dividers and
  brackets are dim and follow the terminal theme.
- Pinned notes sit above a dim rule instead of ending in ` *`.
- The bar button is a themed Nerd Font glyph and re-checks the install,
  so the tooltip no longer says "Click to install" after setup.

## 0.2.1

### Fixed

- Blog draft links are always absolute. Skryf returns `//host/write/<id>`;
  snote now shows `https://host/write/<id>`, including for drafts sent
  earlier.
- Verified end-to-end: sending a note from snote to Skryf was tested against
  the real service.

## 0.2.0

### Added

- Built-in editor. Press `i` to edit the selected note inside the preview
  pane. Ctrl+S saves through the same sync and merge path as the external
  editor; Esc cancels and asks before discarding unsaved changes. `e` still
  opens your own editor.

### Changed

- The Omarchy bar-button plugin now installs pre-built files, so the first
  click no longer runs an npm build. It needs Node.js 22 or newer, which
  Omarchy installs through mise; if it is missing, run
  `omarchy-install-dev-env node`. `plugin-dist/` is shipped in the public
  repository and CI verifies it matches the source.

### Fixed

- The `snote` launcher tries every Node candidate, and its version check
  ignores `NODE_OPTIONS`.

## 0.1.4

### Security

- `packaging/omarchy/setup` no longer uses `rsync --delete` into an
  existing directory. It refuses when the plugin data directory or
  the build directory is a symlink, builds into a fresh directory it
  creates itself and swaps it in, writes the `~/.local/bin/snote` shim
  through a temp file and only ever over its own shim (marker line, or
  the recognised pre-0.1.4 shim), and `uninstall` removes only what the
  installer created. `install.sh` got the same treatment. Reported by
  the Omarchy plugin marketplace maintainers
  (omacom/omarchy-plugin-marketplace#9458).
- `XDG_DATA_HOME` and `~/.local/bin` are resolved with `realpath -m`
  rather than refused outright for being symlinks (common for dotfile
  managers and second disks); the hard refusal is scoped to the
  directories this installer actually owns.

### Fixed

- Error notices still render red; success and info notices (`draft
  sent to your blog`, `New note saved`) now render green instead of
  looking like failures.

## 0.1.3

### Added

- Send the open note to your blog as a draft with `b`. Skryf
  (https://skryf.art) is the ready-to-go default: the first `b` asks
  only for a Skryf token, with a pointer to where to create one
  (https://skryf.art/settings/keys). Set `SNOTE_BLOG_ORIGIN` to point
  snote at another `https` blog that speaks the same API instead; then
  the first `b` asks for that blog's token. The origin and token are
  stored locally in `blog.json` (mode `0600`), next to the Simplenote
  login. snote posts `{ title, markdown, draft: true }` to
  `<origin>/api/agent/posts`. A note that was already sent asks before
  creating another draft. The preview shows `Sent as draft`, the date,
  and the editor URL. That line stays on this machine; it is not written
  into the note. Tags are not sent. Checklist lines are rewritten to
  `☐` and `☑` before the post. Publishing the draft live stays on the
  blog.
- A new demo GIF in the README and the plugin listing shows the blog
  send flow.

### Fixed

- A second blog send's `y` answer could be dropped right after the
  first send.
- The saved blog token and send records were lost on restart.

### Changed

- The direct `esbuild` dependency is `0.28.2`.
- `vitest` and `@vitest/mocker` are `4.1.11`.
- The Omarchy plugin marketplace listing moved to a new plugin id,
  `io.github.donnishcomau.snote-simplenote`, because the marketplace
  can't move a listing between repos. Remove any old listing under
  the previous id and add the plugin again to pick up the new one.

## 0.1.2

### Added

- An Omarchy bar-button plugin now lives in this repo (`manifest.json`,
  `BarWidget.qml`, `preview.png`, `snote-icon.png`,
  `packaging/omarchy/setup` and `uninstall`). Install it with one command:
  `omarchy plugin add https://github.com/donnishcomau/snote --enable`. If
  snote isn't installed yet, the first click builds and installs it through
  `mise` (Node 22, `npm ci`, then the build), with no `sudo`; it installs a
  `~/.local/bin/snote` shim and rebuilds automatically after a plugin
  update.
- `docs/INSTALL.md` now holds the manual pacman/makepkg install steps,
  linked from the README.

### Changed

- The bundle is 8.5% smaller: Ink's unused devtools code (and the `ws`
  package it pulled in) is stripped from the build.

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
