# snote 0.1.0 release notes

snote is a keyboard-driven terminal client for Simplenote, built for Omarchy.
This is its first public release.

## What snote does

snote gives you the full Simplenote workflow from the terminal: browse and
search your notes, edit them in your own `$EDITOR`, tag and organise them,
preview rendered markdown, publish a note and share its link, and manage the
trash — all with a three-pane TUI and full keyboard control. It syncs through
Simperium, the same sync service the official Simplenote apps use, so your
notes, tags, and pins stay consistent across every device you use.

Colours are drawn only from your terminal's 16 ANSI colours, so snote looks
native in whatever theme you run, light or dark.

## Highlights of this release

**Core note-taking.** Three-pane navigation, markdown preview, checklist
items, tagging (add/rename/delete/reorder), search, sort (modified / created
/ A-Z, with reverse), pinning, trash (move/restore/delete forever/empty),
publish/unpublish with link copy, note history with restore, and single-note
export to `.md`.

**Reliable sync, including offline.** Edits made while snote is offline, or
while it is closed entirely, are queued and delivered once the connection (or
the app) comes back. Offline edits are rebased three-way onto whatever the
server holds by then, so an edit made concurrently on another device is
merged instead of overwritten or dropped, and lands exactly once. A note
deleted forever on another device stays deleted, and if the sync service
ever leaves a login unanswered snote reconnects on its own after 10 seconds.

**Security.** Every string that comes from the sync server — note content,
titles, and tags — is sanitized before it reaches the terminal, closing off
terminal control-sequence injection through synced data. The token is bound
to the server that issued it, the local data directory is created with
restrictive permissions, and only one snote process can run against a given
account data directory at a time.

**Omarchy-native.** Launch snote from the Omarchy app menu (`Install > TUI`)
or bind it to a Hyprland hotkey; it opens as a floating TUI window like any
other Omarchy terminal app. Pressing `e` edits the note in place with your
Omarchy default editor (nvim if none is set), with a one-line cheat-sheet of
the main nvim keys in the editor's winbar; set `SNOTE_EDITOR` to use any other
editor, including Omawrite.

## Known limitations

- Startup time is above the 150 ms target once an account has around 10,000
  notes; see `scripts/bench.mjs` for the current benchmark.
- No bulk export — notes are exported to `.md` one at a time with `w`.
- ZWJ emoji sequences (multi-codepoint emoji joined with zero-width joiners)
  can misalign panes; the sanitizer strips variation selectors but not ZWJ
  sequences themselves.
- No image attachment support.

## Installing

Build and install it as a pacman package (needs `base-devel`):

```
git clone https://github.com/donnishcomau/snote
cd snote/packaging/aur && makepkg -si
```

Remove it with `sudo pacman -R snote`. See the
[README](../README.md#install-on-omarchy) for running from source, and
[omarchy-snote](https://github.com/donnishcomau/omarchy-snote) for an optional
Omarchy bar button that opens snote.

## Thanks

snote reuses the Simperium sync client and the Redux sync layer from
Automattic's open-source `simplenote-electron` project. See `NOTICE` for full
attribution.
