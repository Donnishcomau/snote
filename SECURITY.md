# Security Policy

## Reporting a vulnerability

Please report security issues privately via GitHub security advisories on
[donnishcomau/snote](https://github.com/donnishcomau/snote/security/advisories/new).
Do not open a public issue for a security problem.

## Scope

The security surface of snote is:

- the Simperium sync client (wire protocol handling and reconnects),
- token storage (on-disk credentials and their file permissions),
- terminal rendering of server-supplied text (note content, tags, and any
  other strings that originate from the sync server).

## What snote sends over the network

- Login talks to `auth.simperium.com` and `app.simplenote.com`.
- Sync runs over Simperium's websocket, the same protocol the official apps use.
- Once a day at start-up snote runs a `git ls-remote` of the plugin's https
  origin to look for a new release; `SNOTE_UPDATE_CHECK=off` turns it off.
- `skryf.art`, or `SNOTE_BLOG_ORIGIN` if you set it, is contacted only when you
  press `b`: the note's title and markdown, plus your blog bearer token.
- Endpoint overrides must be https, except localhost.
- Nothing else leaves your machine: no telemetry, and crash and report files
  stay local.

## What the bar shows

The newest note's title, up to 40 characters, is written to the plugin's
`status.json` and shown in the bar tooltip, so it is visible when sharing your
screen.

## Install, update and uninstall

- The first click may run Omarchy's `omarchy-install-dev-env node`, which
  downloads Node.js through mise and changes your global mise config.
- `omarchy plugin update` installs the latest commit of the public repo, and
  that repo only receives reviewed, released commits.
- Uninstall removes the app and the `~/.local/bin/snote` shim but leaves
  `~/.local/share/snote` (your token and notes cache) and `~/.local/state/snote`
  (crash and report files): delete them by hand.

## Screen-reader output

`INK_SCREEN_READER` is ignored since 0.2.4 because that output path bypassed
the terminal-output filter.
