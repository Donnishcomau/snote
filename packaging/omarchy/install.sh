#!/bin/sh
set -eu

src="$(dirname "$0")/snote.desktop"
dest="${XDG_DATA_HOME:-$HOME/.local/share}/applications/snote.desktop"

case "${1:-}" in
  --dry-run)
    echo "would install $dest"
    ;;
  --remove)
    rm -f "$dest"
    echo "removed $dest"
    ;;
  "")
    mkdir -p "$(dirname "$dest")"
    # Write to a scratch file next to $dest and mv it into place, rather
    # than `cp "$src" "$dest"` straight onto the destination path: `cp`
    # without -n/-i follows a destination symlink and overwrites whatever
    # it points to (the same class of problem as packaging/omarchy/setup's
    # old `rsync --delete` and `cat >` writes — see that script's own
    # comments). `mv` replaces the destination directory entry directly
    # instead of following it, so this can't write through a symlink.
    tmp="$(mktemp "$(dirname "$dest")/.snote.desktop.XXXXXX")"
    cp "$src" "$tmp"
    mv "$tmp" "$dest"
    echo "installed $dest"
    ;;
  *)
    echo "usage: install.sh [--dry-run|--remove]" >&2
    exit 2
    ;;
esac
