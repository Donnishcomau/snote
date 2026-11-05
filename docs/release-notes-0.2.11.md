# snote 0.2.11

Installs from 0.2.0 to 0.2.10 need a one-time reinstall; the steps are below. This release also fixes sync after a laptop sleeps, rare doubled changes after a restart and an offline edit that could be lost after a restart, and adds an opt-in way to write new notes in the built-in editor. Your saved notes, in the app and on the server, are not changed by the upgrade.

## If you installed 0.2.10 or older: reinstall once

For 0.2.11 we rewrote the public history of github.com/donnishcomau/snote once, to remove some personal and internal details from old commits. Old commit ids changed; the 0.2.11 code is unaffected. So installs made from 0.2.0 to 0.2.10 cannot update in place, this one time.

Your install may refuse the update. The bar button may say `snote update: the plugin folder cannot be fast-forwarded to 0.2.11. Nothing was reinstalled.` and `omarchy plugin update` may say it cannot fast-forward and that you have local changes. That second message is misleading: you changed nothing. Neither refusal changes anything, and your installed version keeps running. To reinstall:

1. Run `omarchy plugin remove io.github.donnishcomau.snote-simplenote`.
2. Run `omarchy plugin add https://github.com/donnishcomau/snote --enable`.
3. Click the snote bar button once. The first click installs the pre-built snote, as on a new install.
4. Run `omarchy-restart-shell` and restart any open snote windows.

Not touched: `omarchy plugin remove` deletes only the plugin folder. Your notes, the signed-in account and unsent changes are kept. New installs are not affected.

## New

- With `SNOTE_NEW_NOTE_EDITOR=inline` set, the `n` key writes a new note in the built-in editor. It saves as you type and makes no note until you type some text. The external editor stays the default.
- The main screen has a one-line header, `>_ snote`, at the top.
- In nvim, the line at the top of the editor shows `:w save & sync` and the time of the last save. The first `:w` of a new note creates it while nvim stays open.
- The export prompt (`w`) lets you edit the folder and the file name, not only add to the end. It never overwrites a file.

## Fixes

- After a laptop sleep, a connection stuck at `[stale]` now reconnects by itself and sends your unsent edits once.
- In two rare sync cases a change could be added to a note twice after a restart. Each change now lands once.
- When two devices make the same edit, the note no longer shows a conflict block that holds the same text twice.
- If you stopped snote right after a restart that held an offline edit, that edit, or another device's change to the same note, could be lost. Both are kept now.
- If the server is slow to answer when snote starts with an offline edit waiting, another device's change to that note is no longer lost, and text you type while snote waits for the reply is kept.
- An edit that is still waiting to be sent now shows as pending in the status bar. Quit tells you about it, and logout asks you to type `logout` before it removes the edit. If sending that edit fails at start-up, it stays counted as unsent.
- A note deleted forever on another device while it is open in the built-in editor comes back with your typed text, its tags and its pin, and snote says so.
- If the sync service answers a sign-in without a sign-in token, snote refuses the reply and saves nothing.
- More invisible format characters in a note, a tag or a server reply are kept off the screen and out of export file names.
- If the server redirects a sign-in request, snote no longer sends it on to the other address.
- snote removes only its own lock files, and a start no longer waits on a lock path that is not a plain file.
- Omarchy setup no longer waits forever when the Node check does not finish.
- If the draft copy of a note could not be written during `:w`, later `:w` saves in that editor session were not followed. They are now.
- snote no longer reads an update-check file that is too large.
- The status bar no longer stays at `[offline]` with no reason while the connection is open.
- Closing the terminal window, or stopping snote, no longer loses the last couple of seconds you typed in the built-in editor.
- After you sign out, snote no longer writes your old notes' text back to disk.
- The rest is internal checks.

## Known issues

- If snote is killed (not quit) within about 150 ms of saving with `:w` while the editor is open, the note can appear twice at the next start. Both copies keep your text; nothing is lost. A normal quit in that window is not affected.
- An editor that passes the file to a window that is already open is not watched for `:w`, and snote saves nothing from it. Set `SNOTE_EDITOR` to a command that waits, such as `code --wait`.
- Rare restart cases can still double or lose a change: after a restart that re-downloads every note, an edit can appear twice, and an edit made around a restart can be lost. After a restart, check recent edits in History (`h`). The full list is under 0.2.8 in CHANGELOG.md.
- With no kernel lock (macOS, a Linux without util-linux, or a data folder on a network drive), two copies of snote started at the same moment can both run. Run one snote at a time on a data folder.
- snote does not check the signature of the checksum list yet, on install or on update. Setup checks the files it installs against the list, which catches a damaged or changed download but does not show who made the release.
- Two devices adding text to one note within about a second once produced a garbled note on the real service. It has not been seen again.
- With `CI=true` set in the environment, snote draws nothing. Run `unset CI` first.

## Upgrading

Installs from 0.2.0 to 0.2.10: reinstall once, as above. Source checkouts and PKGBUILD clones made before 0.2.11: re-clone once (see `docs/INSTALL.md`), then `cd packaging/aur && makepkg -si`. After that, updates are normal again: quit snote, run `omarchy plugin update io.github.donnishcomau.snote-simplenote`, click the bar button once, then run `omarchy-restart-shell`. To go back: `setup --rollback`.

Thanks to everyone who reported what they saw.
