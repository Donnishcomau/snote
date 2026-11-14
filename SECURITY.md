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
- the one terminal hyperlink snote writes (OSC 8): the fixed sign-up address on
  the login screen; the terminal-output filter lets only that exact link through,
- local files: the notes cache, drafts, crash and report files and the bar's
  `status.json`,
- the bar plugin (`BarWidget.qml`) and the `snote` shim it launches,
- setup, which copies snote's pre-built files into place,
- update: the update checks, the bar's update click and the `U` key in snote,
- the one-time star prompt: the GitHub CLI call and the fixed repo link,
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
- Bar update click. Only when you answer `y` to the update's own question
  `Update snote now? [y/N]` (default N), the update runs
  `git ls-remote --tags` and, if a newer release exists, `git fetch` of that
  release tag, from github.com over https. You reach that question by clicking
  the bar's update button, or by pressing `U` in snote and answering `y` to
  snote's own question, which fetches nothing: snote quits and opens the
  update in a floating terminal. Each step stops after
  60 seconds (`SNOTE_UPDATE_NET_SECS` changes this), the release list is read up
  to 1 MiB, and the whole download is capped at 32 MiB (`SNOTE_UPDATE_FETCH_CAP`
  can lower this). The bar update click fetches a release tag from github.com over
  https. From 0.2.9, each release carries `SHA256SUMS`, a list of file
  checksums that the maintainer signs with a hardware key (`SHA256SUMS.sig`;
  the public keys are in packaging/release/allowed_signers). Before the plugin
  folder moves to the fetched release, the snote you already run checks that
  signature with the keys it installed (its `allowed_signers`) and checks every
  other file of the release against `SHA256SUMS`. This applies when the snote
  you run is 0.2.12 or later; an older snote cannot check, so its update to
  0.2.12 is not verified. If a check fails, `/usr/bin/ssh-keygen`
  (OpenSSH) is missing, or the installed snote has no keys, the update stops with
  `update refused: the download could not be verified` and nothing is changed.
  It also checks that the fetched commit matches the tag list it read from the
  same origin, and setup then checks the files it installs against `SHA256SUMS`
  and stops if one differs. If the plugin folder's
  origin is a local folder path instead, the update fetches from that folder,
  and the same checks apply. `SNOTE_UPDATE_CHECK=off`
  (or `0`) makes it refuse. (`packaging/omarchy/bar-update`)
- Direct install release check. A direct install (in `~/.local/share/snote-app`)
  looks for a newer release at start-up (unless a saved answer is under 24
  hours old) and then every 24 hours while snote stays open. It downloads the
  newest release's signed list `ASSETS.SHA256SUMS` and its signature over https
  from github.com's release pages, following at most 3 redirects and only to
  GitHub's release-asset hosts. It sends no note data and no snote version and
  gives up after 30 seconds. The answer counts only when the list's signature
  verifies with the keys of the snote you run. It is saved in snote's own data
  folder as a time and a version number, nothing else: it only decides whether
  snote offers the update, it is never used as the version you run, and
  logging out removes it. `SNOTE_UPDATE_CHECK=off` (or `0`) turns this check
  off, and with it the update banner and the `U` key, so a direct install with
  the check off does not update from snote. (`src/core/direct-download.ts`)
- Direct install update download. Only when you answer `y` to snote's update
  question, and after snote has saved your changes, snote downloads the signed
  list and its signature again, and the tarball the list names, from the same
  place on the same rules. It sends no note data and no snote version, reads at
  most 4 KiB for the list and 8 MiB for the tarball, and gives up after 120
  seconds. It keeps the tarball only when the list's signature verifies with
  the keys of the snote you run, the list names a newer version than the one
  you run, and the tarball matches the list. If a check fails, snote prints
  `snote did not update: the update could not be downloaded and checked` and
  nothing is installed. (`src/core/direct-download.ts`)
- Release notes. Only when you click the release notes action in the bar,
  your desktop opens the release page on github.com in your default browser.
  snote itself sends nothing. (`BarWidget.qml`)
- Star prompt. Only when you press `s` on the one-time star prompt, snote runs your own GitHub CLI: first `gh auth status --hostname github.com`, which has `gh` check your sign-in with `api.github.com` and gives up after 5 seconds, then, only if you answer `y`, `gh api --hostname github.com -X PUT user/starred/Donnishcomau/snote`, which stars the snote repository as the account `gh` is signed in to and gives up after 10 seconds. Without `gh`, or if `gh` fails, your default browser opens `https://github.com/Donnishcomau/snote` instead. snote sends no note data and never reads or stores a GitHub token. `--no-star-prompt` or `SNOTE_STAR_PROMPT=off` turns the prompt off. (`src/core/star-prompt.ts`)

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
- Trust on first use. A first install trusts the release keys (`allowed_signers`)
  it installs: the first click installs the keys in the clone that
  `omarchy plugin add` fetched, and `snote-install` checks the tarball only
  against `ASSETS.SHA256SUMS` from the same release, not its signature. A
  release changed before your first install could pin a key that later updates
  then trust. From 0.2.12, every later bar update and every later direct
  install update is checked with the keys the installed snote has at that time.
- Uninstall removes the app and the `~/.local/bin/snote` shim but leaves
  `~/.local/share/snote` (your token and notes cache), `~/.local/state/snote`
  (crash and report files) and `~/.cache/snote` (the compile cache): delete them
  by hand.
- Direct install update hand-off. After the direct install update download
  (see above), snote passes the checked tarball to the installer, shipped in
  the app as `update-helper`, through the helper's standard input: first one
  line with the tarball's sha256 and its version, then the tarball. snote never puts it in a command-line argument, an
  environment variable or a file the helper is told about. The helper writes
  what it reads to a file in its own private folder inside
  `~/.local/share/snote-app`, hashes that file before and after it unpacks it,
  and installs nothing if a hash is not the one on the first line or the build
  is another version. It does not check the signature again: it reads no keys
  and makes no network call. It waits up to 10 seconds for snote to quit, then
  installs the way the first install does: it lists the files before it unpacks
  any, checks sizes, unpacks, scans, starts the new build once as a check, and
  swaps it in. (`packaging/direct/install`, shipped as `update-helper`)
- An update keeps the build it replaces as `app.prev` next to the app, one copy
  only; the next update replaces it. Uninstall removes `app.prev` with the app,
  for the plugin (`~/.local/share/omarchy-snote-plugin`) and for a direct
  install (delete `~/.local/share/snote-app`, as the README says). Uninstall
  leaves only the folders the Uninstall bullet names.

- A Homebrew install (`brew install donnishcomau/snote/snote`, Linux and macOS) comes from our own tap. Its formula downloads
  the release tarball `snote-<version>.tar.gz`, and Homebrew compares it with the formula's `sha256` before it installs
  anything. The tarball holds the release's runtime files, `LICENSE`, `NOTICE`,
  `THIRD-PARTY-NOTICES`, `allowed_signers` and `SHA256SUMS`, and nothing else.
  Before a release goes
  out, our release check verifies our signature on the release's checksum lists, then unpacks the tarball and compares
  every file with the signed checksums, byte for byte. It refuses the release on any difference. The formula's `sha256`
  is copied from the signed list that holds the tarball's checksum. Homebrew does not check our signature itself.
- A Homebrew install runs no update check and offers no in-app update: `brew upgrade snote` is its one updater. It keeps your
  notes in the same data folders as above and does not create the plugin folder.
- On macOS the Homebrew install also brings the `flock` formula. snote runs it only from `/opt/homebrew/opt/flock/bin/flock`
  (Apple silicon) or `/usr/local/opt/flock/bin/flock` (Intel), never from your `PATH`, to hold the data folder's lock, and
  copies with `/usr/bin/pbcopy`, the text on its input and never through a shell. Without that `flock`, snote says at start
  that it runs without the kernel lock.
- The one-time star prompt (`s` to star, `n` for no thanks) appears once after you have used snote for a while, and you can turn it off with `--no-star-prompt` or `SNOTE_STAR_PROMPT=off`. If your GitHub CLI (`gh`) is installed, `s` first runs `gh auth status --hostname github.com`, which has `gh` check your sign-in with GitHub, and if you are signed in it then asks `[y/N]`. Only on `y` does snote run `gh api --hostname github.com -X PUT user/starred/Donnishcomau/snote`, by the path it resolved for `gh`, with no shell, a timeout, and none of snote's own settings passed to it. snote never reads or stores a GitHub token: `gh` uses its own sign-in. Without `gh`, or if `gh` fails, `s` only opens the fixed address `https://github.com/Donnishcomau/snote` in your browser. Nothing else is sent anywhere. snote records your answer once in `star-prompt.json`, in its data folder.

## How releases are signed

- From 0.2.9, each release's list of file checksums (`SHA256SUMS`) is signed by the maintainer, by hand, with a hardware security
  key, never in CI and never by an automated tool. The signature (`SHA256SUMS.sig`) and the public keys
  (`packaging/release/allowed_signers`) are published with the release. Two keys, a main key and an offline backup key, are pinned.
  The steps are in docs/RELEASE-SIGNING.md. Releases before 0.2.9 are not signed.
- From 0.2.12, the bar update checks this signature with the keys of the installed snote before it moves to a release (see the
  bar update click above); a snote older than 0.2.12 has no such check, so its update to 0.2.12 is not verified.
  A first install does not check it (see trust on first use below). Our release check verifies it before a release is published.
  From 0.2.12, the one-key update of a direct install checks the release's signed list `ASSETS.SHA256SUMS` against its signature
  (`ASSETS.SHA256SUMS.sig`) with the keys of the installed snote before it installs (see the direct install update download above);
  the first release with a direct install is 0.2.12.
  When a release includes `SHA256SUMS`, setup checks the files it installs against that list and stops with
  `update refused: the download could not be verified` if one differs.
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
