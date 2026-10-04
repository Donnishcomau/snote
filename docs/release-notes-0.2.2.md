# snote 0.2.2 release notes

A follow-up to 0.2.1 that rounds out navigation, theming and the bar
widget.

## What's new

**Arrow keys move between panes.** `←` and `→` move between the tags,
notes and preview panes; `Tab` still cycles forward, and with the tags
pane open it steps through tags and notes. The tags list filters the
notes as you move, with Trash still on Enter. The footer hint reads
`Tab Tags`.

**A look that follows your theme.** Pane headings are bold, with the
focused pane shown inverse. Colours come from theme roles, so key hints
are blue, and dividers and brackets are dim and follow the terminal
theme. Pinned notes now sit above a dim rule instead of ending in ` *`.

**A bar widget that knows it is installed.** `snote --new`, or
middle-click on the bar button, starts a new note. The tooltip shows the
note count, the last note and the last sync time. The button is a themed
Nerd Font glyph and re-checks the install, so the tooltip no longer says
"Click to install" after setup.

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

## Thanks

snote reuses the Simperium sync client and the Redux sync layer from
Automattic's open-source `simplenote-electron` project. See `NOTICE` for full
attribution.
