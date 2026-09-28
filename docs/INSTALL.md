# Installing snote from a pacman package or from source

The [README](../README.md#install-on-omarchy) covers the one-click Omarchy bar button. This page
covers the two manual options: a pacman package built from this repo, and a from-source checkout
without packaging.

## Pacman package (AUR-style)

Build and install it as a regular pacman package from `packaging/aur/PKGBUILD` (needs
`base-devel`):

```
git clone https://github.com/donnishcomau/snote
cd snote/packaging/aur && makepkg -si
```

Remove it with `sudo pacman -R snote`. (The same PKGBUILD will go to the AUR once AUR account
registration reopens.)

## From a source checkout, without packaging

```
npm ci
npm run build
sh packaging/omarchy/install.sh
```

`npm ci` installs dependencies from the committed lockfile; `npm run build` produces
`dist/cli.js`; `packaging/omarchy/install.sh` adds the desktop launcher entry.
