# snote 0.1.2 release notes

## What's new

**One-command Omarchy install.** The bar-button plugin now lives directly in
this repo, so there's one command to get snote on the bar:

```
omarchy plugin add https://github.com/donnishcomau/snote --enable
```

If snote isn't installed yet, the first click builds and installs it for
you: it fetches Node 22 through `mise` and the npm dependencies, then builds
snote — no `sudo` involved. Cold, that first click takes about 25 seconds;
after that it installs a `~/.local/bin/snote` shim, and later clicks just
launch or focus the running app. A plugin update triggers an automatic
rebuild the next time you click. Remove it with:

```
~/.config/omarchy/plugins/io.github.donnishcomau.snote/packaging/omarchy/uninstall
omarchy plugin remove io.github.donnishcomau.snote
```

Prefer to install manually, from a pacman package or from source? See
[docs/INSTALL.md](INSTALL.md).

**Smaller bundle.** Ink's unused devtools code (and the `ws` package it
dragged along) is now stripped from the build, making the bundle 8.5%
smaller.

Nothing else about snote's behaviour has changed since 0.1.1. See
`CHANGELOG.md` for the full history.

## Upgrading

Installed through the Omarchy plugin? It rebuilds itself the next time you
click the bar button after updating the plugin.

Already have snote installed from source or from the AUR package? Pull the
latest changes and rebuild:

```
git pull
cd packaging/aur && makepkg -si
```

## Thanks

snote reuses the Simperium sync client and the Redux sync layer from
Automattic's open-source `simplenote-electron` project. See `NOTICE` for full
attribution.
