# Signing a release

From 0.2.9, every release is signed by hand by the release owner, on a hardware key, never in CI and never by an automated tool. The signed
file is `SHA256SUMS`: line 1 is `snote <version> <source commit>` and every other line is the sha256 and path of one file of the
release tree. The signature is `SHA256SUMS.sig`. The keys that may sign are listed in `packaging/release/allowed_signers`. What the
signature covers, and what snote checks today, is described in SECURITY.md.

## One time: create the two keys

The two keys for 0.2.9 already exist and are pinned in `packaging/release/allowed_signers`. Use this section only to replace a key
or add one. Do it for the main YubiKey, then for the backup YubiKey (kept offline). On macOS the system `ssh-keygen` cannot make
hardware keys: install OpenSSH and `ykman` with Homebrew and run `/opt/homebrew/bin/ssh-keygen` for the key commands.

1. Run `ykman info`. The firmware must be 5.2.3 or later (ed25519-sk needs it). On an older key, stop: a different key type is then needed.
2. Set a FIDO2 PIN on the key if it has none (`ykman fido access change-pin`).
3. Create the key, touching it when it blinks and typing the PIN when asked:

   ```
   ssh-keygen -t ed25519-sk -O resident -O verify-required -O application=ssh:snote-release -C snote-release-main -f ~/.ssh/snote-release-main
   ```

   For the backup key use the same command with `-C snote-release-backup -f ~/.ssh/snote-release-backup`.
   Never add `-O no-touch-required`. `verify-required` makes the key ask for the PIN on every signature; the key locks after 8
   wrong PINs. `resident` lets `ssh-keygen -K` rebuild the key file from the YubiKey and its PIN.
4. Before pinning a key, sign a test file with it and verify the signature:

   ```
   echo test > /tmp/signing-test
   ssh-keygen -Y sign -f ~/.ssh/snote-release-main -n snote-release /tmp/signing-test
   printf 'snote-release namespaces="snote-release" %s\n' "$(cut -d' ' -f1,2 ~/.ssh/snote-release-main.pub)" > /tmp/test-signers
   ssh-keygen -Y verify -f /tmp/test-signers -I snote-release -n snote-release -s /tmp/signing-test.sig < /tmp/signing-test
   ```

   Do the same for the backup key. The verify command must print `Good "snote-release" signature`.
5. Record both fingerprints in your own notes, not in the repository: `ssh-keygen -lf ~/.ssh/snote-release-main.pub -E sha256`,
   and the same for the backup key. The first signed release needs you to type them (step 7 below).
6. Add two lines to `packaging/release/allowed_signers`, main first and backup second. Each line is
   `snote-release namespaces="snote-release" ` followed by the whole content of the key's `.pub` file (key type, key, comment).
   Check the file with `node scripts/check-allowed-signers.mjs packaging/release/allowed_signers --min 2` and open a pull request.

## Each release

1. Build the public tree in its own folder: `scripts/publish-export.sh --out /tmp/snote-export`. The release gate runs inside it
   with the signature check off, because the tree does not exist yet. If one of our open `[Verify]` requests on the Omarchy plugin
   marketplace names another commit, the script stops and prints the `--supersede <number>` form; it never posts the comment itself.
   `git -C /tmp/snote-export status --porcelain --ignored` must print nothing (clean it as step 2 says if it does). The public
   repository has history, so the release is one new commit on top of its main, never the export commit itself (pushing that
   would replace the history): `git clone https://github.com/donnishcomau/snote /tmp/snote-public`, then
   `rsync -a --delete --exclude=/.git /tmp/snote-export/ /tmp/snote-public/`, then `git -C /tmp/snote-public add -A .`, then
   `git -C /tmp/snote-public -c commit.gpgsign=false commit -q -m "snote <version>"` with `GIT_AUTHOR_NAME`, `GIT_AUTHOR_EMAIL`,
   `GIT_COMMITTER_NAME` and `GIT_COMMITTER_EMAIL` set to the public identity of step 6. Then
   `git -C /tmp/snote-public rev-parse 'HEAD^{tree}'` must print the same id as `git -C /tmp/snote-export rev-parse 'HEAD^{tree}'`;
   if it does not, stop.
2. Check that the tree is clean: `git -C /tmp/snote-public status --porcelain --ignored` must print nothing. The checks that
   `publish-export.sh` runs in the tree can leave files behind (build output, a `node_modules` folder). The manifest lists every file
   in the tree and the gate refuses a tree with uncommitted changes. If the command prints anything, run
   `git -C /tmp/snote-public checkout -- .` and `git -C /tmp/snote-public clean -fdx`, then run the check again: it must print nothing.
3. Write the manifest: `bash scripts/release-manifest.sh /tmp/snote-public <version> $(git rev-parse HEAD)`.
4. Sign it, touching the key and typing the PIN:
   `cd /tmp/snote-public && ssh-keygen -Y sign -f ~/.ssh/snote-release-main -n snote-release SHA256SUMS`.
   On macOS use `/opt/homebrew/bin/ssh-keygen`. If the command hangs, an ssh agent is answering: run it again with `env -u SSH_AUTH_SOCK` in front.
5. Check the new signature at once, with the same call the gate uses, from the snote repository root:
   `ssh-keygen -Y verify -f packaging/release/allowed_signers -I snote-release -n snote-release -s /tmp/snote-public/SHA256SUMS.sig < /tmp/snote-public/SHA256SUMS`
   (use `env -u SSH_AUTH_SOCK` in front if it hangs). It must print `Good "snote-release" signature`. `ssh-keygen -Y sign` exits 0
   without writing anything when a `SHA256SUMS.sig` already exists, so a signature that is old, or missing, would otherwise pass
   unnoticed; the manifest script deletes the old signature, and the gate refuses a signature older than `SHA256SUMS`.
6. Put both files into the release commit:
   `git -C /tmp/snote-public add SHA256SUMS SHA256SUMS.sig`, then
   `git -C /tmp/snote-public -c commit.gpgsign=false commit --amend --no-edit`
   with the committer set to the public identity for that one command: `GIT_COMMITTER_NAME=qteamdon` and
   `GIT_COMMITTER_EMAIL=201689496+qteamdon@users.noreply.github.com`.
   The amend gives the release commit a new id. Read it with `git -C /tmp/snote-public rev-parse HEAD`: this amended commit, not the
   one you made in step 1, is the one you push, and the one the `[Verify]` request on the marketplace must name as its target commit.
   Retarget that request to the amended commit before you push.
7. Run the gate again, from the snote repository root, with the signature check on. For 0.2.9, the first signed release, type the two
   fingerprints you recorded at enrolment (main first, then backup, in the order of `packaging/release/allowed_signers`) in front:
   `SNOTE_RELEASE_BOOTSTRAP_FPS=SHA256:<main>,SHA256:<backup> env -u SNOTE_SIG_CHECK SNOTE_RELEASE_TREE=/tmp/snote-public scripts/release-gate.sh 0.2.9`.
   The first signed release has no previous signed tag, so the gate trusts the committed keys only when these fingerprints match;
   without them it refuses. A tag for this same release that you already pushed does not count as a previous tag, so the fingerprints
   are still required. If they do not match, the gate prints the fingerprints it found: compare them with your notes, never
   copy them from that line. For every later release leave the fingerprints out:
   `env -u SNOTE_SIG_CHECK SNOTE_RELEASE_TREE=/tmp/snote-public scripts/release-gate.sh <version>`.
   The gate fetches the release tags of the public repository (https://github.com/donnishcomau/snote, a constant in the script; it
   needs the network) and trusts the keys in `packaging/release/allowed_signers` as they were in the newest tag that points at a
   different commit, has a lower version than this release, and holds a `SHA256SUMS.sig` in its tree, not the file in the tree being
   released. It refuses a file with fewer than 2 keys, a key that is not a
   hardware-key type, and a tree that is not the signed export commit. This is the run that enforces the signature: run it
   right before tagging, exactly as written, and tag only if its output does NOT contain `signature check skipped`. A setting
   inherited from your shell can turn the signature check off; the gate then prints that line and still prints `release-gate: OK`,
   and `env -u SNOTE_SIG_CHECK` removes such a setting for this run. `scripts/publish-export.sh` runs
   the gate once on its own without the signature check, so it never enforces the signature by itself. The gate takes the newest
   tag that meets those conditions as the previous signed tag by the file being there, without verifying it: a wrong or hostile tag on
   the public repository can only make the gate refuse, never pass. A tag that points at the release commit or has no lower version,
   such as this release's own tag, is ignored, and the gate prints a line naming it and the reason.
   If the gate refuses and names the previous tag, look at the release tags on GitHub before you do anything else, and do not tag.
8. Tagging and pushing the tree are separate steps and are not part of this page.

## Notes

- If the main key is lost or broken, sign with the backup key: both are pinned.
- To change the pinned keys, put the new `allowed_signers` in a release signed by a key that is pinned now: the gate trusts the keys
  of the previous signed tag, not the file in the release being made.
- snote does not check the signature itself yet; see SECURITY.md.
