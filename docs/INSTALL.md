# Installing snote from a pacman package or from source

The [README](../README.md#install-on-omarchy) covers the one-click Omarchy bar button. This page
covers the two manual options: a pacman package built from this repo, and a from-source checkout
without packaging.

## Pacman package (AUR-style)

Build and install it as a regular pacman package from `packaging/aur/PKGBUILD` (needs
`base-devel`):

```
git clone https://github.com/donnishcomau/snote
cd snote/packaging/aur && makepkg -Cfsi
```

`makepkg` builds the commit you have checked out in this clone and downloads no other copy of snote
(`npm ci` still fetches the dependencies listed in `package-lock.json`). To update, run `git pull` in the clone
and the build line above again. `-C` starts each build from an empty folder, so a file removed since your last
build is not packaged. `-f` builds the package again even when one of the same version is already built.
Without it, makepkg prints a warning and reinstalls that earlier package without building. Remove it with
`sudo pacman -R snote`. (If an AUR package is filed once AUR account registration reopens, it will have its own
PKGBUILD.)

## From a source checkout, without packaging

```
npm ci
npm run build
sh packaging/omarchy/install.sh
```

`npm ci` installs dependencies from the committed lockfile; `npm run build` produces
`dist/cli.js`; `packaging/omarchy/install.sh` adds the desktop launcher entry.

If you built from a source checkout or a PKGBUILD clone made before 0.2.11, `git pull` will refuse or diverge, because the public history was rewritten once for 0.2.11. Re-clone once, or run `git fetch origin` then `git reset --hard origin/main`. The reset discards any local changes in that checkout.
