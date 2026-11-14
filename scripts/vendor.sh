#!/usr/bin/env bash
# Sync vendored Simplenote source from Automattic/simplenote-electron at a pinned commit.
#   scripts/vendor.sh            # copy FILES at UPSTREAM_COMMIT into vendor/simplenote (overwrites!); STUBS are hashed, not copied
#   scripts/vendor.sh --diff     # show what changed upstream (trunk) vs the pinned commit for our file list
#   scripts/vendor.sh --hashes <clone>      # only rewrite vendor/simplenote/UPSTREAM_SHA256.json from the UPSTREAM_COMMIT files of an upstream clone made by git clone (a copied or downloaded .git is not checked); needs git 2.44 or later, as an older git ignores GIT_NO_LAZY_FETCH, so it is refused and nothing is written (#854)
# Every copy run also rewrites UPSTREAM_SHA256.json (path -> sha256 of the upstream file of each FILES and STUBS path, #615);
# STUBS are snote's own stubs of upstream modules, hashed only. test/structure/vendor-upstream-hash.test.ts checks them all.
# Vendored files are GPLv2 (NOTICE) and snote as a whole is GPL-2.0-only (LICENSE). Keep local edits minimal and marked with
# `// OMARCHY:` comments so upstream diffs stay easy to port.
set -euo pipefail
UPSTREAM_REPO=https://github.com/Automattic/simplenote-electron
UPSTREAM_COMMIT=9fddf71c196fa286da614e73075aae906db94b6b   # trunk on 2026-09-08
FILES=(
  lib/types.ts
  lib/search/index.ts
  lib/utils/note-utils.ts lib/utils/note-utils.test.ts
  lib/utils/filter-notes.ts lib/utils/filter-at-most.ts
  lib/utils/tag-hash.ts lib/utils/is-email-tag.ts
  lib/utils/get-note-references.ts lib/utils/task-transform.ts
  lib/state/action-types.ts lib/state/actions.ts lib/state/selectors.ts
  lib/state/data/actions.ts lib/state/data/middleware.ts lib/state/data/reducer.ts
  lib/state/settings/actions.ts lib/state/settings/reducer.ts
  lib/state/ui/actions.ts lib/state/ui/reducer.ts
  lib/state/simperium/reducer.ts lib/state/simperium/middleware.ts
  lib/state/simperium/functions/bucket-queue.ts lib/state/simperium/functions/bucket-queue.test.ts
  lib/state/simperium/functions/in-memory-bucket.ts lib/state/simperium/functions/in-memory-ghost.ts
  lib/state/simperium/functions/note-bucket.ts lib/state/simperium/functions/tag-bucket.ts
  lib/state/simperium/functions/preferences-bucket.ts lib/state/simperium/functions/redux-ghost.ts
  lib/state/simperium/functions/unconfirmed-changes.ts lib/state/simperium/functions/username-monitor.ts
  lib/state/simperium/functions/connection-monitor.ts
)
STUBS=(lib/state/index.ts lib/state/persistence.ts lib/state/analytics/actions.ts lib/state/electron/actions.ts
  lib/state/simperium/actions.ts lib/state/simperium/functions/change-announcer.ts
  lib/state/simperium/functions/tab-close-confirmation.ts lib/utils/platform.ts)
ROOT=$(cd "$(dirname "$0")/.." && pwd)
# a symlinked destination would be written through: refuse before the clone, writing nothing (#412)
refuse_link() { if [[ -L $1 ]]; then echo "vendor.sh: $1 is a symlink; nothing written" >&2; exit 1; fi; }
for f in "${FILES[@]}"; do d="$ROOT/vendor/simplenote/${f#lib/}"; while [[ $d != "$ROOT" && $d != / ]]; do refuse_link "$d"; d=$(dirname "$d"); done; done
for d in "$ROOT/vendor/simplenote/UPSTREAM_COMMIT" "$ROOT/vendor/simplenote/UPSTREAM_SHA256.json" "$ROOT/dist" "$ROOT/dist/upstream.diff"; do refuse_link "$d"; done
# write UPSTREAM_SHA256.json (sorted keys, 2-space JSON), one entry per FILES and STUBS path, from the git objects of UPSTREAM_COMMIT in the clone $1 (its working tree is not read; git runs with no inherited GIT_* variable, no lazy fetch (GIT_NO_LAZY_FETCH needs git 2.44 or later: --hashes refuses an older git, and the copy run's own fresh clone is a full clone with nothing to fetch) and no replace refs; the clone must be one made by git clone, as a copied or downloaded .git is not checked); a path that commit lacks writes nothing
write_hashes() {
  node -e 'const fs = require("fs"), c = require("crypto"), run = require("child_process"); const [dir, pin, out, ...files] = process.argv.slice(1); const o = {}; const env = { ...Object.fromEntries(Object.entries(process.env).filter(([k]) => !k.startsWith("GIT_"))), GIT_NO_LAZY_FETCH: "1", GIT_NO_REPLACE_OBJECTS: "1", GIT_TERMINAL_PROMPT: "0" };
    for (const f of [...files].sort((a, b) => (a.slice(4) < b.slice(4) ? -1 : 1))) { let blob; try { blob = run.execFileSync("git", ["-C", dir, "cat-file", "blob", pin + ":" + f], { env, stdio: ["ignore", "pipe", "ignore"], maxBuffer: 1 << 26 }); } catch { console.error("vendor.sh: " + dir + " has no " + pin + ":" + f + "; nothing written"); process.exit(1); } o[f.slice(4)] = c.createHash("sha256").update(blob).digest("hex"); }
    fs.writeFileSync(out, JSON.stringify(o, null, 2) + "\n");' "$1" "$UPSTREAM_COMMIT" "$ROOT/vendor/simplenote/UPSTREAM_SHA256.json" "${FILES[@]}" "${STUBS[@]}"
}
if [[ ${1:-} == --hashes ]]; then
  [[ -d ${2:-} ]] || { echo "vendor.sh: --hashes needs an upstream checkout folder" >&2; exit 1; }; [[ $(git version) =~ ^git\ version\ ([0-9]+)\.([0-9]+) ]] && (( BASH_REMATCH[1] * 1000 + BASH_REMATCH[2] >= 2044 )) || { echo "vendor.sh: --hashes needs git 2.44 or later (GIT_NO_LAZY_FETCH); nothing written" >&2; exit 1; }
  write_hashes "$2"; echo "Wrote UPSTREAM_SHA256.json ($(( ${#FILES[@]} + ${#STUBS[@]} )) files) from $2"; exit 0
fi
WORK=$(mktemp -d)
git clone -q "$UPSTREAM_REPO" "$WORK/up"
if [[ ${1:-} == --diff ]]; then
  for f in "${FILES[@]}"; do
    git -C "$WORK/up" diff --stat "$UPSTREAM_COMMIT" trunk -- "$f" | tail -1
  done
  mkdir -p "$ROOT/dist"
  git -C "$WORK/up" diff "$UPSTREAM_COMMIT" trunk -- "${FILES[@]}" > "$ROOT/dist/upstream.diff" || true
  echo "Full diff written to dist/upstream.diff"; rm -rf "$WORK"; exit 0
fi
git -C "$WORK/up" checkout -q "$UPSTREAM_COMMIT"
for f in "${FILES[@]}"; do
  dest="$ROOT/vendor/simplenote/${f#lib/}"; mkdir -p "$(dirname "$dest")"; cp "$WORK/up/$f" "$dest"
done
echo "$UPSTREAM_COMMIT" > "$ROOT/vendor/simplenote/UPSTREAM_COMMIT"
write_hashes "$WORK/up"
rm -rf "$WORK"; echo "Vendored ${#FILES[@]} files at $UPSTREAM_COMMIT"
