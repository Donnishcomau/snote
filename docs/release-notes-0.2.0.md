# snote 0.2.0 release notes

## What's new

**Built-in editor.** Press `i` on a note and edit it right inside the
preview pane, with no second program to open. Ctrl+S saves through the
same sync and merge path as the external editor, so changes made on
another device in the meantime are merged rather than overwritten. Esc
cancels; if you have unsaved changes it asks before discarding them.
`e` still opens your own editor exactly as before.

**Faster plugin install.** The Omarchy bar-button plugin now ships
snote already built (`plugin-dist/`, checked by CI against the source),
so the first click is a plain copy: no npm, no download, no build. It
needs Node.js 22 or newer, which Omarchy installs through mise. If it
is missing, run:

```
omarchy-install-dev-env node
```

**Launcher fixes.** The `snote` launcher now tries every Node
candidate instead of giving up on the first, and its version check
ignores `NODE_OPTIONS`, so an environment that injects options no
longer makes a good Node look too old.

## Install

```
omarchy plugin add https://github.com/donnishcomau/snote --enable
```

Then click the snote bar button. See the README for other install
options (AUR package, from source) and the key reference.

## Upgrading

Installed through the Omarchy plugin? Update the plugin, then click the
bar button once; setup copies the new pre-built files.

Installed from source or the AUR package? Pull the latest changes and
rebuild:

```
git pull
cd packaging/aur && makepkg -si
```

## Thanks

snote reuses the Simperium sync client and the Redux sync layer from
Automattic's open-source `simplenote-electron` project. See `NOTICE` for full
attribution.
