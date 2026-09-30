# snote 0.1.3 release notes

## What's new

**Send a note to your blog as a draft.** With a note open, press `b`.
Skryf (https://skryf.art) is the ready-to-go default blog: the first
time, snote asks only for a Skryf token, and tells you where to create
one (https://skryf.art/settings/keys). Want a different blog instead?
Set `SNOTE_BLOG_ORIGIN` to its `https` origin before the first `b`,
and snote asks for that blog's token instead. Either way, the origin
and token are stored locally next to your Simplenote login. Confirm,
and snote posts the note as a draft. The title is the note's first
line. The rest is the body, with checklist boxes rewritten to `☐` and
`☑`. Tags stay in snote.

A note that was already sent asks before creating another draft.
Afterwards the preview shows `Sent as draft`, the date, and the link
to finish the draft. That line is local to this machine. Publishing
the draft where readers can see it stays on the blog.

See the new demo GIF in the README for the blog send flow end to end.

**Fixes.** A second send's `y` answer could be dropped if it landed
right after the first send finished. The saved blog token and send
records could be lost across a restart — both are fixed.

**Dependency pins.** The direct esbuild dependency is 0.28.2. vitest
and @vitest/mocker are 4.1.11.

**New plugin listing id.** The Omarchy plugin marketplace listing is
moving to a new plugin id, `io.github.donnishcomau.snote-simplenote`,
because the marketplace can't move a listing between repos. If you
installed the bar-button plugin under the old id, remove it and add
it again to pick up the new listing.

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
