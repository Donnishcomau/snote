#!/usr/bin/env bash
# Write the signed-release manifest for a release tree (issue #68, interface I2).
#   bash scripts/release-manifest.sh <tree> <version> <source-commit>            writes <tree>/SHA256SUMS
#   bash scripts/release-manifest.sh --check <tree> <version> <source-commit>    exit 0 only when <tree>/SHA256SUMS is exactly that
# Line 1 is "snote <version> <source-commit>". Then "<sha256>  <path>" for every file of the tree except SHA256SUMS,
# SHA256SUMS.sig and the .git folder, sorted by path (byte order). Symlinks, special files and paths with a control character
# (newline included, and the C1 controls U+0080-U+009F), a bidi character (U+202A-U+202E, U+2066-U+2069), a backslash or a leading
# slash are refused, and nothing is written. A file that cannot be hashed (sha256sum fails or prints no 64-hex hash) is refused the same way.
# Writing deletes SHA256SUMS.sig FIRST, before anything can fail: ssh-keygen -Y sign leaves an existing .sig in place and exits 0.
set -euo pipefail
export LC_ALL=C
die() { echo "release-manifest: $*" >&2; exit 1; }
mode=write; if [[ ${1:-} == --check ]]; then mode=check; shift; fi
[[ $# -eq 3 ]] || die "usage: release-manifest.sh [--check] <tree> <version> <source-commit>"
tree=$1; ver=$2; sha=$3
[[ -d $tree ]] || die "no such folder: $tree"
[[ $ver =~ ^[0-9]{1,6}(\.[0-9]{1,6}){2,3}$ ]] || die "not a version: $ver"
[[ $sha =~ ^[0-9a-f]{40}$ ]] || die "not a full commit sha: $sha"
cd "$tree"
if [[ $mode == write ]]; then rm -f SHA256SUMS.sig; fi
odd=$(find . -path ./.git -prune -o ! -type f ! -type d -print -quit)
[[ -z $odd ]] || die "not a plain file or folder: $odd"
out=$(mktemp); trap 'rm -f "$out"' EXIT
printf 'snote %s %s\n' "$ver" "$sha" > "$out"
find . -path ./.git -prune -o -type f ! -path ./SHA256SUMS ! -path ./SHA256SUMS.sig -print0 | sort -z |
  while IFS= read -r -d '' f; do
    rel=${f#./}
    [[ $rel != *[[:cntrl:]]* && $rel != *\\* && $rel != /* ]] || die "a path holds a control character, a backslash or starts with a slash: $rel"
    rc=0; printf '%s' "$rel" | grep -qaP '\xc2[\x80-\x9f]|\xe2\x80[\xaa-\xae]|\xe2\x81[\xa6-\xa9]' || rc=$?
    [[ $rc -ne 0 ]] || die "a path holds a C1 control or a bidi character: $rel"
    [[ $rc -eq 1 ]] || die "cannot check the path characters (grep -P exit $rc): $rel"
    h=$(sha256sum < "$f") || die "cannot hash $rel"
    h=${h%% *}
    [[ $h =~ ^[0-9a-f]{64}$ ]] || die "no sha256 for $rel"
    printf '%s  %s\n' "$h" "$rel"
  done >> "$out"
if [[ $mode == check ]]; then cmp -s "$out" SHA256SUMS; exit $?; fi
cat "$out" > SHA256SUMS
echo "release-manifest: wrote $tree/SHA256SUMS ($(wc -l < SHA256SUMS) lines); sign it next"
