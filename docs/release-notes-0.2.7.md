# snote 0.2.7 release notes

A small release that keeps snote light in long sessions. Your saved
notes are not changed by the upgrade.

## What's new

**Less memory in long sessions.** snote used to remember the title and
preview of every version of a note it had shown. If you share a note
with someone who keeps editing it, each new version stayed in memory
for as long as snote ran. snote now keeps a note's title and preview
only while that note is in your list, so memory no longer grows as
shared notes are edited. A note whose text changed always shows its newest title.
What you see and what is saved are the same as before, and the list is
no slower.

**History no longer lingers in memory.** Opening a note's history used
to keep every old version of that note in memory for the rest of the
session. They are now released when you close history, and opening it
again shows them again. What history shows and what restore saves are
the same as before.

**Dependency update.** A development-only package (`source-map-js`) is
now 1.2.2. It is used only to run the tests and is not part of the
program you run.

## Known issues

Very fast typing, or pasting text, right after a key such as `i` or `/`
can be read as list commands on the selected note, such as publish or
move to trash, and text typed straight after `i` may not be saved. This
is also true of 0.2.6 and is fixed in the next release. Until then,
press the first key, wait for the screen to change, then type.
The same applies to yes/no questions: if `y` and another key such as an
arrow arrive together, the `y` can answer the question, for example to
log out or to send a note to your blog.

In a few rare timing cases right after snote restarts, a change can
appear twice, and in some cases a pin, trash, tag or undo made in that
moment can be lost (0.2.5 behaves the same). These are listed in the
0.2.6 release notes and still apply; a fix is planned for 0.2.8.
If you quit snote before a change has finished syncing and then delete
a note forever straight after the next start, the note can occasionally
come back in your note list; once sync has settled, move it to the trash
and delete it forever again (fix planned for 0.2.8).

See `CHANGELOG.md` for the full history.

## Upgrading

Installed through the Omarchy plugin? Update the plugin, then click the
bar button once; setup copies the new pre-built files.

Installed from source or as a pacman package built from the repo? Pull the
latest changes and rebuild:

```
git pull
cd packaging/aur && makepkg -si
```

After updating the plugin, run `omarchy-restart-shell`, because the bar
keeps the old widget until the shell restarts.

## Thanks

Thanks to the Omarchy marketplace review, which found the memory growth
and reported it clearly.

snote reuses the Simperium sync client and the Redux sync layer from
Automattic's open-source `simplenote-electron` project. See `NOTICE` for full
attribution.
