# snote 0.1.4 release notes

## What's new

**Installer safety fix.** `packaging/omarchy/setup` used to run
`rsync -a --delete` straight into the existing build directory. If
something there turned out to be a symlink — the plugin's data
directory, or the build directory itself — `rsync --delete` would
follow that symlink and prune files inside whatever real directory it
pointed at, so a first click of setup could end up deleting files
from an unrelated directory. Reported by the Omarchy plugin
marketplace maintainers (omacom/omarchy-plugin-marketplace#9458).

setup now refuses outright if the plugin directory or the build
directory is a symlink, builds into a fresh directory it creates
itself, and swaps that directory into place with an atomic rename
instead of deleting into an existing one. The `~/.local/bin/snote`
shim is written the same careful way: through a temp file, and only
ever over a shim that is recognisably snote's own (either the current
marker line or the plain pre-0.1.4 shim), never over an arbitrary
file. `uninstall` only removes the shim and build directory it
recognises as its own; anything else is left alone. `install.sh` got
the identical fix for the same class of problem. `XDG_DATA_HOME` and
`~/.local/bin` themselves can still be symlinks — that's normal for
dotfile managers and second disks — only the directories the
installer owns are protected this strictly.

Existing installs upgrade cleanly: setup and uninstall both recognise
your current shim (even the older, pre-marker one from 0.1.2/0.1.3)
as snote's, so the next click of the bar button rebuilds and replaces
it as before. No manual steps needed.

**Green success notices.** Notices used to always render red, so
confirmations like `draft sent to your blog` and `New note saved`
looked like failures. Error notices stay red; success and info
notices now render green.

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
