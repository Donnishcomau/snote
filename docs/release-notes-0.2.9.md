# snote 0.2.9

Edit with `:w` while the editor stays open, a quit that sends your changes first, and an inline editor that saves as you type. Your saved notes are not changed by the upgrade.

## What's new

**Save with `:w` and keep editing.** In an editor that supports it, writing the file (`:w`) now saves the note and syncs it straight away, while the editor is still open. You no longer have to close the editor to get a change to your other devices.

**Quit sends your changes first.** When you quit, snote hands any change that is waiting to the server and waits a few seconds for the answer. If something could not be sent, it says how many changes are kept and that they go out the next time snote starts.

**Inline edit saves as you type.** Press `i` and your text is stored as you go. A draft survives a quit or a crash, and `Esc` closes and keeps what you wrote. `h` restores an older version.

**Screen-reader mode.** Start snote with `snote --screen-reader`, or set `SNOTE_SCREEN_READER=1`. The screen becomes one linear column with no colour. Help, the editor hand-off, search, tags and history all work in it.

**A server sign-out no longer costs you changes.** If the server signs you out, snote keeps your unsynced changes and editor drafts, and the notice tells you how many are kept. Log in to the same account and they sync. When you log out yourself with changes waiting, snote says how many first and asks you to type `logout`.

**Safer merging when two devices edit one note.** Three cases that could lose or damage text are closed: both devices changing the same word or line (the other device's edit used to be dropped), a very large note that was doubled when you closed the editor, and a note holding a stray half-character that crashed snote or lost an inline save.

**A clearer list.** Pinned notes sit under a `Pinned` label. Only the focused pane shows the inverse selected row, and its heading is a full-width accent bar. The footer names the arrow keys, tag names are no longer cut without a sign, and titles in Chinese, Japanese, Korean or with emoji are cut by screen width.

**Lighter saves with many notes.** snote no longer rewrites the whole notes file on every change. It writes only the notes that are waiting to sync, so each save does less work on a big library. A kill at any moment keeps your edit, including after you restore a version from History.

**Lighter start-up.** snote starts with less code, and the update check loads only when it runs. The copy of your notes read at start-up is no longer held in memory for the whole session.

**Releases carry a signed checksum list.** From 0.2.9, each release's list of file checksums (`SHA256SUMS`) is signed by the maintainer with a hardware security key. The signature and the public keys are published with the release. When a release includes `SHA256SUMS`, setup checks the files it installs against that list and stops with `update refused: the download could not be verified` if one differs.

**The bar shows the version you have.** An update names its version and links to its release notes. The bar stops saying "update available" once you are on the latest, and its update prompt installs the new version instead of reinstalling the old one.

## Fixes

- A second copy of snote started at the same moment as the first can no longer take the data folder in the usual cases. snote asks the system for a lock on the folder. Where it cannot (no `flock`, or a folder that refuses locks), the notice line says so.
- An editor that hands the file to a window that is already open and returns at once is now caught. snote stops and says `Set SNOTE_EDITOR to a command that waits, e.g. code --wait. Nothing was saved`, so edits are not lost silently.
- Restart edge cases: an edit that only moves lines is kept after a restart. In the usual case, an untouched line is no longer dropped when another device moved it, and a note deleted forever is no longer brought back by a restart that downloads every note again. An edit no longer appears twice after a quit and a full re-download.
- Pressing `d` to trash a note on the real service no longer gets ignored the first time.
- Two quick presses of `y` no longer send a blog draft twice, and a send that finishes while a second question is open no longer leaves the next `y` doing nothing.
- A kept editor draft is no longer cut short.
- Two accounts with similar emails no longer share one local folder.
- Network calls have limits. Login, blog send and the bar update stop waiting for a server that does not answer, and stop reading a reply that is too large. Sync no longer hangs for the whole session if the server never answers the connection.
- snote does not write through a link. A symlinked data folder, `auth.json`, temp file or setup folder is no longer followed, and a save cut off halfway leaves no `.tmp` file behind.
- If the sync server does not answer the connection twice running, the notice line reads `sync server not answering, retrying (attempt N)`.
- The bar update no longer makes git dump core and show a "Process crashed" notification when it stops an over-size download.
- Setup and the first click use the Node.js that a standard Omarchy already has. Setup installs nothing but snote itself.
- Each kind of install (plugin, source, package) gets the update steps that fit it.
- A quit from the login screen after a sign-out no longer reports the old account's unsent changes.
- A pin, trash or tag made while snote catches up after a restart is sent once, not twice, and no extra empty version of the note is created.
- A note you created while offline is no longer lost at start-up when snote's saved state cannot be loaded. It is kept and syncs.
- With three or more devices syncing, a device that is still catching up no longer adds another device's line to a note a second time. A restarting device can no longer delete another device's text while it catches up; this was fixed in tests and has never been seen live. In the 30 Oct live trial there were 0 duplicates in 110 runs, against 2 in 36 before the fix.
- A sync change with a broken character (half of an emoji pair) from another device or a misbehaving server no longer makes snote exit. No text is lost.
- A note synced from another client or a misbehaving server with missing or odd tag fields now shows normally, instead of leaving snote's screen blank.
- A note whose copy on the server has tags or system tags that are not a list no longer stops snote re-sending your offline edits at start-up.
- A saved data file with the wrong contents no longer crashes start-up or costs you offline notes. A tag with no name, a broken tag link or saved history that snote cannot use is dropped, and the rest of the file loads. If the notes themselves cannot be read, the file is set aside as `state.json.corrupt` and your offline notes are still kept.
- An edit is no longer lost when an error happens right after it is applied.
- Quitting right after an identical `:w` no longer duplicates the note at the next start.
- Logging out no longer leaves an email-named folder behind.
- Export only accepts email patterns that are real addresses. Memory use stays bounded in three places where it grew for the whole session.
- Opening a note's history loads each revision once, not twice, so it sends fewer requests.
- The update check's git calls inside the plugin clone carry the same safety flags as the other git calls. Comments in setup no longer claim the update verifies a signature.

## Known issues

- If snote is killed (not quit) within about 150 ms of saving with `:w` while the editor is open, the note can appear twice at the next start. Both copies keep your text; nothing is lost. A normal quit in that window is fixed in this release.
- An editor that passes the file to a window that is already open is not watched for `:w`; the quick-return message above applies.
- With no kernel lock (macOS, a Linux without util-linux, or a data folder on a network drive), two copies of snote started at the same moment can both run. Run one snote at a time on a data folder.
- Rare restart cases from 0.2.8 that this release does not close are still listed in CHANGELOG.md. After a restart, check recent edits in History (`h`).
- snote does not check the signature of the checksum list yet, on install or on update. Setup checks the files it installs against the list, which catches a damaged or changed download but does not show who made the release.
- Two devices adding text to one note within about a second once produced a garbled note on the real service. It has not been seen again.
- If the connection to the sync service opens but sign-in never finishes, the status bar can show `[offline]` with no reason.
- With `CI=true` set in the environment, snote draws nothing. Run `unset CI` first.
- When two devices make the same edit, the note can show a conflict block that holds the same text twice. Nothing is lost.

## Upgrading

Plugin install: quit snote, run `omarchy plugin update io.github.donnishcomau.snote-simplenote`, click the bar button once, then run `omarchy-restart-shell`. Source or pacman package: `git pull`, then `cd packaging/aur && makepkg -si`. To go back: `setup --rollback`.

Thanks to everyone who reported what they saw, and to the Omarchy marketplace review.
