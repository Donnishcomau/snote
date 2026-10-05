# snote 0.2.3 release notes

A follow-up to 0.2.2 that removes the last manual setup step and fixes
two rough edges found during the 0.2.2 release test.

## What's new

**No manual Node.js step on first click.** Setup now installs Node.js 22
through Omarchy itself — it runs `omarchy-install-dev-env node` in the
visible setup terminal when Node is missing, then looks again. On a
standard Omarchy installation there is nothing left to run by hand.

**The focus line tells the truth.** With the right-hand pane focused,
the line under the panes now reads `focus: preview` instead of
`focus: notes`, so it no longer looks like the notes list has focus.

**A tooltip that keeps up.** The bar tooltip's sync age (`Synced 2m
ago`) now keeps updating while the tooltip stays open, instead of
freezing at the moment the pointer arrived.

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
