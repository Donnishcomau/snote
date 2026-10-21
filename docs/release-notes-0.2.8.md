# snote 0.2.8 release notes

Fast typing and pasting no longer run commands on your notes, more of
your changes survive a restart, and updating is more careful. Your saved
notes are not changed by the upgrade.

## What's new

**Fast typing and pasting are safe.** Typing quickly, or pasting, right
after a key such as `i` or `/` used to be read as list commands on the
selected note, such as publish or move to trash. Now, when several keys
arrive together, only the first acts as a command. The rest go to the
text box it opened, and the notice line says `Several keys at once: only
the first was used`. A yes/no question, such as sending a note to your
blog or logging out, is answered only by a single key, and Ctrl+C
bunched with other keys no longer quits snote.

**More of your changes survive a restart.** A pin, trash, tag or untag
made just after start is no longer undone when an offline edit syncs.
Tags changed on another device are no longer lost. Undoing an edit just
after a restart is no longer lost, and a change made just after a
restart no longer makes the change you made before quitting land twice.
A note deleted forever just after a restart stays deleted. Some rarer
cases remain; they are listed under Known issues.

**Editor text is put back where it belongs.** If the editor ends with
an error while you edit an existing note, the next start puts the kept
text back into that note, as long as the note still holds the text the
edit began with. If it does not, the text comes back as a new note, as
in 0.2.7, and the notice says why. A kept file larger than 1 MiB is
left on disk untouched, and a notice says so.

**History no longer crashes on a damaged version.** Opening History on a
note with a version that has no usable date or no text used to crash
snote. The date now reads `unknown date`, and a version without text is
left out.

**Status words say what is happening.** The status bar reads
`[connecting]` before the first answer from the server, `[stale]` when
the connection is open but silent, and `[offline]` when it is closed.
If the server keeps ignoring the sign-in, the notice line reads `sync
server ignored sign-in, retrying (attempt N)`. Pressing `r` while not
connected says `sync requested`. When the server signs you out, snote
now closes the old connection.

**A clearer list.** Note titles are bold, and each preview is indented
under its title. Previews with Chinese, Japanese, Korean or emoji
characters stay inside the list column. The footer shows the pin key:
`p Pin`, or `p Unpin` when the selected note is pinned.

**The version is shown in the app.** It is on the first line of Help,
and at the right end of the status line when the terminal is 80 columns
or wider.

**Update notice and a more careful update.** While snote is open, a line
reading `Update available: <running> -> <new>` appears above the panes
when a newer release exists. Press Escape in the plain list to hide it
for that version. The check asks GitHub at most once a day, also across
restarts, and keeps the answer in a small file (`update-tag-check.json`)
in snote's status folder. `SNOTE_UPDATE_CHECK=off` turns it off.

Updating with `setup` now stops with `snote is running: quit it and run
setup again` instead of replacing the build under a running snote. It
installs the new build beside the old one and runs it once before
switching; if that fails the old build stays, and it says `update
failed: kept <version>`. `setup --rollback` brings the previous build
back. None of this touches your data folder. When a release carries a
`SHA256SUMS` file, `setup` checks every file against it and stops with
`update refused: the download could not be verified` if one differs.

**Smaller fixes.** In Help at 70 columns by 35 rows, a description no
longer touches the next key. A very large note of non-ASCII text is
refused for inline edit quickly. Crash reports (`snote --report`) keep
common error codes such as `ENOSPC` and `EAI_AGAIN`, include only the
fields snote writes itself, hide an upper-case code snote does not
know, and cut the lines under `Caused by:`.

## Known issues

Rare restart cases can still lose or double a change. After a restart
that re-downloads every note, a note deleted forever can come back, and
an edit can appear twice (the text is duplicated, not lost). An edit
that only moves lines can be dropped, and so can an untouched line when
another device moved a line you deleted offline. In rare timing cases,
an edit made around a restart can be lost. After a restart, check
recent edits in History (`h`).

When the server signs you out, snote deletes the account's folder,
including changes not yet synced and kept editor text.

A restored editor draft can, rarely, be cut short.

Two devices adding text to one note within about a second once produced
a garbled note on the real service, and pressing `d` to trash a note was
once ignored. Neither has been seen again.

The status can show `[offline]` for a moment after a save, even though
the edit arrives once.

Releases are not signed yet. Signature checks are not part of 0.2.8.

The bar's update prompt can reinstall the version you already have when
the plugin has not been updated first. Run `omarchy plugin update
io.github.donnishcomau.snote-simplenote` before you click the bar.

See `CHANGELOG.md` for the full history.

## Upgrading

Installed through the Omarchy plugin? Quit snote, update the plugin
(`omarchy plugin update io.github.donnishcomau.snote-simplenote`), then
click the bar button once; setup copies the new pre-built files. If
snote is still running, setup stops and asks you to quit it first.
After updating, run `omarchy-restart-shell`, because the bar keeps the
old widget until the shell restarts.

To go back to the previous build, run
`~/.config/omarchy/plugins/io.github.donnishcomau.snote-simplenote/packaging/omarchy/setup --rollback`.

Installed from source or as a pacman package built from the repo? Pull
the latest changes and rebuild:

```
git pull
cd packaging/aur && makepkg -si
```

## Thanks

Thanks to everyone who reported what they saw, and to the Omarchy
marketplace review.

snote reuses the Simperium sync client and the Redux sync layer from
Automattic's open-source `simplenote-electron` project. See `NOTICE` for full
attribution.
