# Changelog

All notable changes to snote are documented here. Versions follow [Semantic
Versioning](https://semver.org/).

## 0.2.5

The first release since 0.2.3: it also ships every change listed under
0.2.4, which was not released on its own.

### Added

- Below 20x7 snote shows "snote needs at least 20x7 — make the window
  bigger" instead of overlapping panes. It keeps your place, including
  unsaved inline-editor text and an open search, ignores every key but
  `q`, and returns to the same screen when the window is big enough.
  `q` quits from there, except while an inline edit is open, when it is
  ignored too so unsaved text is not lost.
- When Help does not fit the window, it shows a one-column list that
  scrolls with `j` and `k`, so it never draws one row over another at
  any size from 20x7.

### Changed

- The notice line stays on one row, cut to the window width with `…`,
  so it no longer pushes the key hints or the status line away.
- The status line fits its width: when it is wider than the window it
  is cut with `…` instead of squeezed.
- The inline editor uses the same rows as the Preview and draws the
  same divider, so its footer and text no longer land on the key hints
  or the list.
- `i` does not open the inline editor on a note with a line over
  10,000 characters; the notice line suggests `e` to edit in your
  editor.
- The error for a refused endpoint override says what is allowed:
  https, or http only to localhost, 127.0.0.1 or `[::1]`, and never an
  address with a username or password.
- Lint warnings now fail the check, and code comments about
  `SNOTE_NODE` match what the launcher does.

### Fixed

- The Help screen no longer draws one row over another at widths 50-99
  and heights 30 and up.
- When snote is not running, the bar says "snote is not running"
  instead of implying a stale sync.
- Keys typed quickly in the inline editor, or pasted in a burst, are
  no longer lost or applied to stale text, and every arrow key in a
  burst moves the caret once, in order.

## 0.2.4

### Added

- snote checks whether a plugin update is available at start-up, at most once every 24 hours, and says so on its notice line and in the bar tooltip.
- `SNOTE_UPDATE_CHECK=off` turns the check off and also silences the
  local "downloaded, restart" notice. The README has an Updating section
  (the plugin update command, `q` for the diff pager,
  `omarchy-restart-shell`).
- The login screen's email step now shows where to create an account:
  `https://app.simplenote.com/signup/`.

### Changed

- The bar button's middle-click now opens a new note in an already
  running snote, via `snote --notify-new`.
- Pane headings are in the accent colour and bold; the focused heading
  stays inverse.
- In rendered markdown notes, heading rows are accent, links are blue
  and underlined, `inline code` is yellow, and checkboxes are dim or
  green.
- The notes list dims preview lines and shows the selected row in
  accent.
- The tags list shows the selected tag in accent and dims the system
  rows.
- The status line's note count is dim and says `1 note`, not
  `1 notes`.
- The `g add tag` hint is dim.
- The update notice is yellow (the warning colour), not the green used
  for success.

### Fixed

- The launcher finds a mise-installed Node when `XDG_*` or `MISE_*`
  directories are customised.
- The launcher passes the user's arguments through unchanged.
- The update check reports an update available only when the remote
  has something the local plugin clone does not; a clone that is ahead
  of, or has diverged from, its remote stays quiet.
- Quitting snote removes the update notice from the bar's status file,
  so the bar tooltip stops saying "Update available" after
  `omarchy plugin update` without a restart.
- A failed login shows at most 200 characters of the server's reply,
  on one line, instead of a whole error page.
- Login says when the server cannot be reached or does not answer,
  gives up after 15 seconds, and shows `Contacting the server...`
  while it waits.
- When the server signs snote out, the login screen says the session
  ended instead of returning there with no reason.
- A stale `instance.lock` whose process id has been reused by another
  program is reclaimed, instead of snote saying another snote is
  already using this data.
- A failed save or a failed re-send, and a force sync that cannot
  reach the server, shows a red notice instead of crashing or failing
  silently, and one press of force sync shows at most one `force sync`
  notice.
- After a corrupt ghost file, an edit made offline still reaches the
  server.
- An unchanged note is not re-sent.
- A note saved to the server just before a crash comes back on the
  next start, as the server has it.
- A note deleted forever stays deleted after a crash, and a failed
  save at start shows a notice instead of stopping snote.
- An edit or trash made offline is sent on the next start even if the
  note changed on another device meanwhile.
- A note created offline never disappears while snote catches up
  after a restart.
- Tags holding control characters or an emoji selector can be opened,
  renamed and deleted.
- Login waits the full 15 seconds for a slow server before giving up.
- The first key typed into the checklist or export prompt goes only
  into the prompt.
- A paste into the notes list changes nothing and shows
  `Paste ignored`.
- The AUR package passes `namcap`.
- Notes held for an offline catch-up are released even when a later
  step of the catch-up fails.
- An unsent offline change survives several offline sessions until the
  server confirms it.
- `snote --report` shows the real note count.

### Security

- A note's text (for example a shared note) could carry terminal
  control sequences such as OSC 52, which some terminals use to set
  the clipboard. snote now filters OSC, DCS, APC, PM, SOS and C1
  control strings, and every escape sequence except the cursor and
  colour (display CSI) ones the interface itself needs, on both stdout
  and stderr; `INK_SCREEN_READER=true` no longer bypasses that, and
  exported file names drop control characters. Reported in the
  Omarchy plugin marketplace review.
- The `shared with:`, `published:` and blog lines now show sanitised
  server text, and a publish link is used only when its id is valid,
  so `y` can never copy a link built from hostile text.
- Terminal text and export file names drop bidi controls, zero-width
  characters and line/paragraph separators (the emoji joiner is
  kept).
- The crash and report key ring never stores typed text: keystrokes in
  the inline editor and pasted text in any mode are stored as
  `<text>`.
- The inline editor shows control, bidi and zero-width characters as
  visible stand-ins and saves the note's bytes unchanged.
- The output guard keeps Ink's own output unchanged, drops every other
  escape, keeps one state per stream across writes and `Buffer`s, and
  ends a dropped string on `CAN` or `SUB` so later output is not lost.
- snote's own output to stderr goes through the output guard as well.
  The `e` external terminal editor draws note text itself, so what it
  shows is not filtered.
- The update check never lets the plugin clone's git config run
  anything: it reads the origin URL itself, refuses anything that is
  not `https` or a local path, and runs `git ls-remote` outside any
  repository with a clean environment. Its other git steps run in the
  plugin's own clone.
- The bar's first-click setup command quotes the setup path for both
  shells it passes through, so a space or a quote in the path can run
  nothing.
- Endpoint overrides must use https (`http://` only for localhost and
  127.0.0.1), and `NODE_TLS_REJECT_UNAUTHORIZED=0` prints a warning.
  An endpoint address is judged by its parsed host, and one with a
  username or password in it is refused.
- A pasted text containing ESC is stored in the crash key ring as
  `<text>`.
- Signing out (logout) removes only snote's own files, not other files
  in the data folder.
- The one-time migration moves only snote's own old files.
- The update check runs outside any repository, treats a timed-out git
  step as unknown (never available), and accepts only a hex commit id.
- The CI workflow runs with a read-only token and its actions pinned
  by commit SHA.
- The vendored in-memory bucket no longer carries dead debug logging
  that could print account data.
- Logout, both in the app and with `snote --logout`, removes all of
  snote's files in its data folder including `unsynced.json`, and
  `snote --logout` also removes the bar status file. Crash and report
  files, the update-check file and the compile cache stay.
- A blog address must be https, or http only to this machine
  (localhost), and the token is never sent anywhere else. A blog send
  never follows a redirect, so the note text goes only to the address
  you configured.
- Crash reports no longer copy the error text: they keep only known
  words of the message, the error type, its code and the stack frames
  (code locations). `snote --report` redacts an older crash file the
  same way before sharing it, and drops the key list of a crash file
  written by 0.2.3 or older.
- Pasted text in search, the tag editor, prompts and the inline editor
  is drawn safely, with no colours or direction overrides; the inline
  editor still saves exactly what was pasted.
- The compile cache folder is private (0700) and the lock file is
  private (0600).

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
