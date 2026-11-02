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
    # Write to a scratch file next to $dest and move it into place, rather
    # than `cp "$src" "$dest"` straight onto the destination path: `cp`
    # without -n/-i follows a destination symlink and overwrites whatever
    # it points to (the same class of problem as packaging/omarchy/setup's
    # old `rsync --delete` and `cat >` writes — see that script's own
    # comments). A symlink to a FILE is replaced by the real file and the
    # file behind it is left alone. A symlink to a DIRECTORY (one hop or a
    # chain) or a real directory at $dest is a layout snote did not make:
    # a plain `mv FILE DEST` would put the file inside that directory, so
    # install refuses it (exit 1, nothing written) and the move itself uses
    # `mv -T` where the system mv has it, so a link that appears after the
    # check still cannot take the file (#255, same rule as setup's mv_file).
    # proof: test/packaging/install-desktop-symlink-dir.test.ts
    mv_has_t=0
    if mv --help 2>&1 | grep -q -e ' -T'; then mv_has_t=1; fi
    mv_file() {
      if [ "$mv_has_t" = 1 ]; then mv -T -- "$1" "$2"; else mv -- "$1" "$2"; fi
    }
    if [ -d "$dest" ]; then
      if [ -L "$dest" ]; then
        echo "install.sh: $dest is a symlink to a directory; remove it and run again" >&2
      else
        echo "install.sh: $dest is a directory; remove it and run again" >&2
      fi
      exit 1
    fi
    tmp="$(mktemp "$(dirname "$dest")/.snote.desktop.XXXXXX")"
    cp "$src" "$tmp"
    if ! mv_file "$tmp" "$dest"; then
      rm -f "$tmp"
      echo "install.sh: could not install $dest" >&2
      exit 1
    fi
    echo "installed $dest"
    ;;
  *)
    echo "usage: install.sh [--dry-run|--remove]" >&2
    exit 2
    ;;
esac
