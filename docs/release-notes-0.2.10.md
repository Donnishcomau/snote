# snote 0.2.10

A small fix: exporting a note no longer says `exported` when the write was cut short. Your saved notes are not changed by the upgrade.

## Fixes

- Exporting a note could be cut short by a short write (for example a full disk) and still print `exported: <path>`. snote now writes the whole file or fails with `export failed: <reason>`, and when the write fails it removes the file it created. The same write is used for the instance lock file. Your saved notes, in the app and on the server, were not touched by this bug. It was found by the Omarchy marketplace review.
- The rest is internal checks plus an update to a development-only dependency that is not shipped.

## Known issues

- If snote is killed (not quit) within about 150 ms of saving with `:w` while the editor is open, the note can appear twice at the next start. Both copies keep your text; nothing is lost. A normal quit in that window is fixed in 0.2.9.
- An editor that passes the file to a window that is already open is not watched for `:w`; the quick-return message from 0.2.9 applies.
- With no kernel lock (macOS, a Linux without util-linux, or a data folder on a network drive), two copies of snote started at the same moment can both run. Run one snote at a time on a data folder.
- Rare restart cases from 0.2.8 that 0.2.9 and this release do not close are still listed in CHANGELOG.md. After a restart, check recent edits in History (`h`).
- snote does not check the signature of the checksum list yet, on install or on update. Setup checks the files it installs against the list, which catches a damaged or changed download but does not show who made the release.
- Two devices adding text to one note within about a second once produced a garbled note on the real service. It has not been seen again.
- If the connection to the sync service opens but sign-in never finishes, the status bar can show `[offline]` with no reason.
- With `CI=true` set in the environment, snote draws nothing. Run `unset CI` first.
- When two devices make the same edit, the note can show a conflict block that holds the same text twice. Nothing is lost.
- The README screenshots show an earlier version. They are refreshed in 0.2.11.

## Upgrading

This is a normal update; nobody needs to reinstall. Plugin install: quit snote, run `omarchy plugin update io.github.donnishcomau.snote-simplenote`, click the bar button once, then run `omarchy-restart-shell`. Source or pacman package: `git pull`, then `cd packaging/aur && makepkg -si`. To go back: `setup --rollback`.

Thanks to everyone who reported what they saw, and to the Omarchy marketplace review.
