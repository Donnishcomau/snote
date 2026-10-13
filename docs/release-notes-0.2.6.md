# snote 0.2.6 release notes

A data-safety release. The main fix is for an edit that showed up twice
when you quit right after saving, plus a deleted note that could come
back, and several smaller fixes to the inline editor, Help and the bar.
Your saved notes are not changed by the upgrade.

## What's new

**No more doubled edits after a quick quit.** If you saved a note and
quit within about two seconds, the server could already have applied
your change while snote had not yet heard back, and after a restart the
edit appeared twice, in snote and on your other devices. snote now
keeps a small record of the changes it sent but has not seen confirmed,
and on the next start recognises the server's copy of such a change as
its own. A change that never reached the server is still sent, other
devices' edits still merge in, and a damaged record is ignored.

**An edit survives a sudden quit.** If snote was closed or killed within
half a second of saving (a crash, closing the terminal), the edit could
be lost. snote now writes it to disk straight away.

**Deleted notes stay deleted.** A note you deleted for good on another
device no longer comes back on this device after a restart that
re-reads the whole note list.

**Delete does what it says.** In the inline editor, Delete now removes
the character after the caret instead of deleting backwards. At the end
of a line it joins the next line, and at the end of the text it does
nothing. Backspace works as before.

**Very large notes.** `i` does not open the inline editor on a note
with more than 20,000 non-ASCII characters, where every key press would
take seconds; the notice line suggests `e` to edit in your editor. Long
notes of plain text still open.

**Help stays readable.** A description that does not fit now ends in
`…` instead of being cut mid-word, and key names are never cut. When
the columns would be too narrow to read, Help shows the one-column list
that scrolls with `j` and `k`.

**The bar tells you at once.** When you quit snote normally, the bar
tooltip says "snote is not running" immediately instead of "Synced …"
for up to two minutes. After a crash or kill the old two-minute
fallback still applies.

## Known issues

Three rare cases can still lose a change. Each needs a change that had
not reached the server when snote closed, and then a change to the same
note in the moment after snote starts again, before it has caught up
with the server (on a normal connection that takes well under a
second). 0.2.5 behaves the same, and a fix is planned for 0.2.7. No
note text is removed in any of them.

- A note edited offline and then pinned, trashed or tagged right after
  the next start can lose the pin, trash or tag.
- If another device changed that note's tags, pin or Markdown setting
  while snote was closed, and you change the same setting right after
  the start, the other device's change is dropped. For example, a tag
  added on your phone disappears.
- If you quit before the server confirmed an edit, and right after the
  next start change the note back to exactly how it was before that
  edit, the edit comes back.

A second save made while the first was still unconfirmed, followed by a
quit and restart, can still double the first edit. In a few rarer
timing cases around a quit, a crash or a reconnect, a change can still
appear twice, for example when the server is slow to answer after a
restart (half a second or more is enough). Nothing is lost in these cases; they
are planned for 0.2.7.

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

snote reuses the Simperium sync client and the Redux sync layer from
Automattic's open-source `simplenote-electron` project. See `NOTICE` for full
attribution.
