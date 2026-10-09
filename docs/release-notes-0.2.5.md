# snote 0.2.5 release notes

The first release since 0.2.3. It brings the security and data-safety
work from the Omarchy plugin marketplace review (planned as 0.2.4, which
was not released on its own), an update notice and theme colours, and
makes the interface hold together in small windows.

## What's new

**Small windows.** Below 20x7 snote shows "snote needs at least 20x7 —
make the window bigger" instead of overlapping panes. It keeps your
place, including unsaved inline-editor text and an open search, ignores
every key but `q`, and returns to the same screen when the window grows.
`q` quits from there, except while an inline edit is open, when it is
ignored too so unsaved text is not lost.

**Help that fits.** Help no longer draws one row over another. When the
full layout does not fit, it shows a one-column list that scrolls with
`j` and `k`.

**Everything stays on its row.** The notice line and the status line are
cut to the window width with `…` instead of wrapping or being squeezed.
The inline editor now uses the same rows and divider as the Preview, so
its footer no longer lands on the key hints.

**Inline editor.** `i` does not open the editor on a note with a line
over 10,000 characters; the notice line suggests `e` to edit in your
editor. Keys typed or pasted quickly are no longer lost, and every arrow key in
a burst moves the caret once, in order.

**The bar.** When snote is not running, the bar says "snote is not
running" instead of implying a stale sync.

**Clearer errors.** The refused-endpoint error says what is allowed:
https, or http only to localhost, 127.0.0.1 or `[::1]`, and never an
address with a username or password.

## Also in this release (planned as 0.2.4)

**An update notice.** snote now checks whether a plugin update is
available at start-up, at most once every 24 hours, and says so on its
notice line and in the bar tooltip. Set `SNOTE_UPDATE_CHECK=off` to
turn the check off, which also silences the local "downloaded,
restart" notice. The README has a new Updating section covering the
plugin update command, `q` for the diff pager, and
`omarchy-restart-shell`.

**Colours that follow the theme.** Pane headings are in the accent
colour and bold, and the focused heading stays inverse. In rendered
markdown notes, heading rows are accent, links are blue and underlined,
inline code is yellow, and checkboxes are dim or green. The notes list
dims preview lines and shows the selected row in accent; the tags list
shows the selected tag in accent and dims the system rows. The status
line's note count is dim and says `1 note`, not `1 notes`, and the
`g add tag` hint is dim.

**Middle-click starts a new note.** Middle-click on the bar button now
opens a new note in an already running snote, via `snote --notify-new`,
instead of only focusing the existing window. At login, the email step
now shows the address where you can create an account,
`https://app.simplenote.com/signup/`.

**The launcher keeps up with your setup.** The launcher finds a
mise-installed Node when `XDG_*` or `MISE_*` directories are
customised, and passes the user's arguments through unchanged.

**Safer with your data.** If snote crashes or closes suddenly, the
notes you saved before it went down come back on the next start just
as the server has them, and a note you deleted for good stays
deleted. An edit or a move to the trash you made while offline reaches
the server when snote next starts, even if the same note changed on
another device in the meantime, and a note you created offline never
vanishes while snote catches up after a restart. Logout and the
one-time move of old files now only ever touch snote's own files,
never anything else in your data folder, notes held for an offline
catch-up are released even if a later step fails, an unsent offline
change survives several offline sessions until the server confirms it,
`snote --report` shows the real note count, and a paste into the notes
list is safely ignored instead of changing anything.

**Security.** A note's text, for example a shared note, could carry
terminal control sequences such as OSC 52, which some terminals use to
set the clipboard. snote now filters OSC, DCS, APC, PM, SOS and C1
control strings, and every escape sequence except the cursor and
colour (display CSI) ones the interface itself needs, on both stdout
and stderr; `INK_SCREEN_READER=true` no longer bypasses that, and
exported file names drop control characters. Server text is sanitised
and a publish link is used only when its id is valid, terminal text
and export names drop bidi and zero-width characters, the crash key
ring never stores typed text, and the update check refuses any non-https
origin and runs `git ls-remote` outside any repository with a clean
environment, while its other git steps run in the plugin's own clone.
snote's own stderr output goes through the same guard; the `e` external
terminal editor draws note text itself, so it is not filtered.
The guard that filters what reaches the terminal keeps the
interface's own output unchanged, drops every other escape even
when it arrives split across writes or as raw bytes, and ends a
dropped string so later output is not lost. An endpoint address is
judged by the host it really points at, and one that carries a
username or password is refused. A paste containing an escape
character is remembered in the crash key ring as `<text>`. Logout
only ever removes snote's own files, the one-time move of old files
does the same, and the update check only trusts a plain hex commit
id and gives up quietly when git takes too long. Logout, in the app
and with `snote --logout`, removes all of snote's files in its data folder including
`unsynced.json` (and the bar status file from the command line); crash
and report files stay. A blog
address must be https, or http only to localhost, the token goes
nowhere else, and a blog send never follows a redirect. Crash reports no
longer copy the error text: they keep only known words of the message,
the error type, code and stack frames; `snote --report` redacts an older crash file the same way and drops its key list. Pasted text in search, the tag editor, prompts and the
inline editor is drawn safely with no colours or direction overrides,
and the inline editor still saves what you pasted. The compile cache
folder is private (0700) and the lock file private (0600). Reported in the
Omarchy plugin marketplace review. Your saved notes are not changed.

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
