# Release assets: the signed asset list

A release that users install directly from GitHub carries four files, and only these four:

| File | What it is |
| --- | --- |
| `snote-<version>.tar.gz` | the files under `plugin-dist/` of the release tree, owner 0, mtime 0, built the same way every time |
| `snote-install` | a byte copy of `packaging/direct/install` at the release commit (the installer the README downloads) |
| `ASSETS.SHA256SUMS` | line 1 `snote-assets <version> <commit>`, then the SHA-256 of the two files above, nothing else |
| `ASSETS.SHA256SUMS.sig` | the release owner's signature of `ASSETS.SHA256SUMS`, made with the same key and namespace as `SHA256SUMS.sig` |

`scripts/release-asset.sh` writes them into `<export-dir>-assets/`, next to the release tree and never inside it. It needs GNU tar, so it and
the release gate run on the Linux release host.

## Steps, after `release-manifest.sh` has written `SHA256SUMS` and it is signed (docs/RELEASE-SIGNING.md)

1. `bash scripts/release-asset.sh /tmp/snote-public <version> <commit>` writes the three files. Before it makes the assets folder, it checks every
   folder on its path up to `/`: each must be yours or root's, and no other user may write to it unless it is sticky like `/tmp`. A path that fails
   gets no folder. Then it checks that the assets folder is yours and that no other user can write to it,
   and leaves a folder that is not yours as it is. Then it deletes any old `ASSETS.SHA256SUMS.sig` before it writes anything.
   On a normal host `/tmp/snote-public` passes. If the refusal names a folder of yours, another user can write to it (a folder made under
   umask 002 has a group write bit): run `chmod go-w` on that folder, or keep the export in `/tmp`. If it names a folder of another user, you
   cannot fix it: use a path that does not go through it.
2. `bash scripts/release-asset.sh --check /tmp/snote-public <version> <commit>` must print `is right for`. It proves the tarball holds exactly the
   `plugin-dist/` files of the signed `SHA256SUMS`, each byte for byte, that `snote-install` equals `packaging/direct/install`, and that no entry is
   a link, a device, an absolute path, a `..` path or a name with a control character or a backslash.
3. Only now sign, in the assets folder: `ssh-keygen -Y sign -f ~/.ssh/snote-release-main -n snote-release ASSETS.SHA256SUMS` (touch the key; give the PIN).
4. Run `scripts/release-gate.sh <version>` again. It verifies `ASSETS.SHA256SUMS.sig` with the same keys as `SHA256SUMS.sig` and repeats step 2.
5. Upload exactly the four files of the assets folder, the ones the gate checked. Do not rebuild after signing: a rebuild changes nothing when the
   tree is the same, but the files you upload must be the files that were checked. After the upload, download the four files into a new empty
   folder and check that copy, never the assets folder. In the new folder, on the release host, run these three commands. `<repo>` is your own
   checkout of the release commit, and `<version>` and `<commit>` are the ones you gave in step 1.

   ```sh
   ssh-keygen -Y verify -f <repo>/packaging/release/allowed_signers -I snote-release -n snote-release -s ASSETS.SHA256SUMS.sig < ASSETS.SHA256SUMS &&
   head -n 1 ASSETS.SHA256SUMS | grep -xF 'snote-assets <version> <commit>' &&
   tail -n 2 ASSETS.SHA256SUMS | sha256sum --check --strict
   ```

   The first must print `Good "snote-release" signature`. The second must print `snote-assets <version> <commit>`. A complete, validly signed
   set from an earlier release fails here, because its first line names that release. The third must print `snote-<version>.tar.gz: OK` and
   `snote-install: OK`. Any other output, or no output, means the files on GitHub are not the ones you signed for this release: stop and do not
   announce it.

The README installer command checks the tarball against `ASSETS.SHA256SUMS` only. That catches a broken or cut-off download. It does not catch a
tampered release, because the installer does not check the signature. The release gate checks the signature before the upload.
