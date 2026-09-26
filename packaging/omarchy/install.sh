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
    cp "$src" "$dest"
    echo "installed $dest"
    ;;
  *)
    echo "usage: install.sh [--dry-run|--remove]" >&2
    exit 2
    ;;
esac
