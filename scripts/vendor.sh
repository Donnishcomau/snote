#!/usr/bin/env bash
# Sync vendored Simplenote source from Automattic/simplenote-electron at a pinned commit.
#   scripts/vendor.sh            # copy files at UPSTREAM_COMMIT into vendor/simplenote (overwrites!)
#   scripts/vendor.sh --diff     # show what changed upstream (trunk) vs the pinned commit for our file list
# Vendored files are GPL-2.0 (same as this project). Keep local edits minimal and marked with
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
ROOT=$(cd "$(dirname "$0")/.." && pwd)
WORK=$(mktemp -d)
git clone -q "$UPSTREAM_REPO" "$WORK/up"
if [[ ${1:-} == --diff ]]; then
  for f in "${FILES[@]}"; do
    git -C "$WORK/up" diff --stat "$UPSTREAM_COMMIT" trunk -- "$f" | tail -1
  done
  git -C "$WORK/up" diff "$UPSTREAM_COMMIT" trunk -- "${FILES[@]}" > "$ROOT/.loop/upstream.diff" || true
  echo "Full diff written to .loop/upstream.diff"; rm -rf "$WORK"; exit 0
fi
git -C "$WORK/up" checkout -q "$UPSTREAM_COMMIT"
for f in "${FILES[@]}"; do
  dest="$ROOT/vendor/simplenote/${f#lib/}"; mkdir -p "$(dirname "$dest")"; cp "$WORK/up/$f" "$dest"
done
echo "$UPSTREAM_COMMIT" > "$ROOT/vendor/simplenote/UPSTREAM_COMMIT"
rm -rf "$WORK"; echo "Vendored ${#FILES[@]} files at $UPSTREAM_COMMIT"
