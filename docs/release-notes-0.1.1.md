# snote 0.1.1 release notes

A small follow-up to the 0.1.0 release.

## What's new

**`snote --version`.** Running `snote --version` (or `snote -v`) now prints
`snote 0.1.1`. The bug-report template already asks for this, so it's now
one command away instead of a guess.

Nothing else about snote's behaviour has changed since 0.1.0. See
`CHANGELOG.md` for the full history.

## Installing

Build and install it as a pacman package (needs `base-devel`):

```
git clone https://github.com/donnishcomau/snote
cd snote/packaging/aur && makepkg -si
```

Remove it with `sudo pacman -R snote`. See the
[README](../README.md#install-on-omarchy) for running from source, and
[omarchy-snote](https://github.com/donnishcomau/omarchy-snote) for an optional
Omarchy bar button that opens snote.

## Upgrading

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
