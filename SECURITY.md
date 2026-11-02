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
  other strings that originate from the sync server),
- local files: the notes cache, drafts, crash and report files and the bar's
  `status.json`,
- the bar plugin (`BarWidget.qml`) and the `snote` shim it launches,
- setup, which copies snote's pre-built files into place,
- update: the update checks and the bar's update click,
- uninstall.

## What snote sends over the network

Every network call snote makes is listed here, with when it runs and where it
goes. The file that makes each call is named in brackets. Nothing else leaves
your machine: no telemetry, and crash and report files stay local.

- Login. When you sign in, snote sends your email address, then the login code,
  over https to `app.simplenote.com`. If you choose password login, it sends your
  email address and password over https to `auth.simperium.com` instead.
  A request gives up after 15 seconds and reads at most 1 MiB of reply.
  (`src/core/auth.ts`)
- Sync. From sign-in until you quit, snote keeps one `wss` websocket open to
  `api.simperium.com`, the same protocol the official apps use. It carries your
  notes and your edits to them, and your Simperium access token, which signs you
  in on the socket. A connection that is not answered within 15
  seconds is closed and tried again. (`src/core/websocket-provider.ts`)
- Update check at start-up. At most once every 24 hours, snote runs
  `git ls-remote HEAD` against the plugin clone's https origin, and only when
  that origin is the snote repository on github.com, to see whether there is a new
  commit. Installs from a package skip it. It sends no note data and stops after
  5 seconds. `SNOTE_UPDATE_CHECK=off` (or `0`) turns it off.
  (`src/core/update-check.ts`)
- Release check. At start-up (unless a saved answer is under 24 hours old) and
  then every 24 hours while snote stays open, snote runs `git ls-remote --tags`
  against the same github.com origin to find the newest release, and shows a
  banner when it is newer than the one you run. It stops after 5 seconds.
  `SNOTE_UPDATE_CHECK=off` (or `0`) turns it off.
  (`src/core/update-check.ts`)
- Blog send. Only when you press `b`, snote sends the note's title and
  markdown, plus your blog bearer token, over https to the blog origin saved in
  `blog.json`. That origin is `skryf.art`, or `SNOTE_BLOG_ORIGIN` if you set it,
  as it was when `blog.json` was first created. A send is refused if the saved
  origin is not https, or http to localhost. A send gives up after 15 seconds
  and reads at most 1 MiB of reply. (`src/core/blog-client.ts`)
- Bar update click. Only when you click the bar's update button and answer `y`,
  the update runs `git ls-remote --tags` and, if a newer release exists, `git fetch`
  of that release tag, from github.com over https. Each step stops after
  60 seconds (`SNOTE_UPDATE_NET_SECS` changes this), the release list is read up
  to 1 MiB, and the whole download is capped at 32 MiB (`SNOTE_UPDATE_FETCH_CAP`
  can lower this). The bar update click fetches a release tag from github.com over
  https. From 0.2.9, each release carries `SHA256SUMS`, a list of file
  checksums that the maintainer signs with a hardware key (`SHA256SUMS.sig`;
  the public keys are in packaging/release/allowed_signers). snote does not
  check that signature yet, on install or on update. It checks that the
  fetched commit matches the tag list it read from the same origin, and setup
  then checks the files it installs against `SHA256SUMS` and stops if one
  differs. That catches a damaged or changed download; it does not catch an
  origin that rewrites the list too, because the list comes from the same
  download. If the plugin folder's
  origin is a local folder path instead, the update fetches from that folder,
  and only the tag and commit checks apply. `SNOTE_UPDATE_CHECK=off`
  (or `0`) makes it refuse. (`packaging/omarchy/bar-update`)
- Release notes. Only when you click the release notes action in the bar,
  your desktop opens the release page on github.com in your default browser.
  snote itself sends nothing. (`BarWidget.qml`)

Setup and uninstall make no network call. `omarchy plugin add` and
`omarchy plugin update` are Omarchy's own commands, not snote's; see below.
The overrides `SNOTE_ACCOUNT_BASE`, `SNOTE_AUTH_BASE` and `SNOTE_BLOG_ORIGIN`
must be https, or http to localhost; snote refuses to start otherwise. A saved
blog origin is checked the same way when you send. The `--server` sync option is
not checked.

## What the bar shows

The newest note's title, up to 40 characters, is written to the plugin's
`status.json` and shown in the bar tooltip, so it is visible when sharing your
screen.

## Install, update and uninstall

- The first click uses the Node.js that a standard Omarchy already has, through
  mise. Setup installs nothing but snote itself, downloads nothing and changes
  no mise config. Without Node.js 22 or newer it stops with a one-line message.
- The first click writes only the plugin folder `~/.local/share/omarchy-snote-plugin`
  (under `XDG_DATA_HOME` if set) and the `~/.local/bin/snote` shim. Each run of
  snote keeps Node's compile cache in `~/.cache/snote/compile-cache` (under
  `XDG_CACHE_HOME` if set).
- `omarchy plugin update` installs the latest commit of the public repo, and
  that repo only receives reviewed, released commits.
- Uninstall removes the app and the `~/.local/bin/snote` shim but leaves
  `~/.local/share/snote` (your token and notes cache), `~/.local/state/snote`
  (crash and report files) and `~/.cache/snote` (the compile cache): delete them
  by hand.

## How releases are signed

- From 0.2.9, each release's list of file checksums (`SHA256SUMS`) is signed by the maintainer, by hand, with a hardware security
  key, never in CI and never by an automated tool. The signature (`SHA256SUMS.sig`) and the public keys
  (`packaging/release/allowed_signers`) are published with the release. Two keys, a main key and an offline backup key, are pinned.
  The steps are in docs/RELEASE-SIGNING.md. Releases before 0.2.9 are not signed.
- snote does not check this signature yet, on install or on update. Our release check verifies it before a release is published.
  When a release includes `SHA256SUMS`, setup checks the files it installs against that list and stops with
  `update refused: the download could not be verified` if one differs. The list comes from the same download, so this catches damaged
  or changed files, not an origin that rewrites the list too.
- Touch and PIN are enforced by the key when it signs. A check of the signature cannot see them: the signer file has no option for
  them, so it cannot reject a signature that was made without them.
- A manual `omarchy plugin update` follows Omarchy's own trust model: it replaces the plugin files, including `allowed_signers`,
  without snote verifying them.

## Screen-reader output

`INK_SCREEN_READER` is ignored since 0.2.4 because that output path bypassed
the terminal-output filter.
Screen-reader mode is opt-in (`--screen-reader` or `SNOTE_SCREEN_READER=1`) and its
output passes through that filter, which in this mode also drops every colour
sequence, CR and the zero-width and bidi characters.
