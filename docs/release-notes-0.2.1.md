# snote 0.2.1 release notes

A small follow-up to the 0.2.0 release.

## What's new

**Blog draft links are always absolute.** Skryf returns draft links as
`//host/write/<id>`. snote now shows `https://host/write/<id>`, including
for drafts you sent earlier. Sending a note from snote to Skryf was also
checked end-to-end against the real service.

Nothing else about snote's behaviour has changed since 0.2.0. See
`CHANGELOG.md` for the full history.

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
