# snote 0.2.12

snote can now be installed with Homebrew, on macOS (Apple silicon) and on Linux. On a direct install and on the Omarchy plugin, one key applies an update after snote has checked it. Your notes, in the app and on the server, are not changed by the upgrade.

## Install and update

Homebrew, on macOS (Apple silicon) and on Linux:

```
brew install donnishcomau/snote/snote
```

Homebrew supplies Node. On a Mac it also supplies flock. A Homebrew install does not check for updates, and `U` does not start one. Update with `brew upgrade snote`.

Omarchy plugin: when snote shows an update, press `U` and answer `y`. snote quits and opens the same update as the bar button. That window asks `Update snote now? [y/N]` before it fetches anything. You can still run `omarchy plugin update io.github.donnishcomau.snote-simplenote`, click the bar button once, then run `omarchy-restart-shell`.

Direct install (`snote-install`): press `U` and answer `y`. snote saves your changes, downloads the newer release and checks it with the keys already on this machine. The update helper installs it after snote has quit. If a check fails, the old build stays.

A first install trusts the release it downloads. A snote older than 0.2.12 does not run this check, so the update that brings you to 0.2.12 is not verified. The check runs from 0.2.12 on.

## Security fixes

- Before a plugin update moves the plugin folder, snote checks the release signature and checks each file against the signed list. A failed check refuses the update.
- A direct-install update uses the same check. A failed check leaves the old build in place.
- If a plugin update check fails, the next start does not install the copy that failed.
- If a direct install is stopped during its start check, that unchecked build is not left as the one that runs.
- A setup error no longer prints a raw path from inside the installer.

## Fixes

- On macOS, after a crash or reboot, snote no longer refuses to start because a leftover lock file names a process ID that now belongs to another program, or to snote itself. When snote cannot check, the refusal names the lock file to remove.
- A waiting autosave no longer writes after you log out.
- A save made in an editor that stayed open across a restart is kept.
- On macOS, a temporary directory in the data folder no longer stops start or logout.
- Markdown headings in the preview and in the inline editor are coloured by level.
- The inline editor shows the time of the last autosave.
- In nvim, the top line says when the note was last saved. If the note stays unsaved, that line uses your theme's warning colour, then its error colour.
- The shortcut line under the notes list includes `j` and `k`.
- On the login screen, the sign-up address is a link when the terminal supports it, and a plain URL otherwise: `https://app.simplenote.com/signup/`.
- The blog token prompt says where to register a Skryf account.
- If start-up cannot read saved data, snote says it kept the file as `state.json.corrupt` and that your offline notes were kept.
- With `CI=true` set in the environment, snote still draws in a real terminal.
- On macOS, copying a public link uses the system clipboard.
- A Homebrew install on a Mac takes a kernel lock through Homebrew's flock, so two copies started together do not both run.
- Note saves still wait until they are on disk. Other writes no longer wait on a flush, so a slow disk does not stall every write.
- A one-time prompt asks once, after real use (8 launches and 7 days, never at first start), whether you would star snote on GitHub. Press `s` to star or `n` for no thanks. With the GitHub CLI (`gh`) installed in a standard location (/usr/bin, /usr/local/bin or Homebrew), `s` runs `gh auth status`, which has `gh` check your sign-in with GitHub, then asks `[y/N]`; only on `y` does snote star the repo through your own `gh`. Otherwise `s` opens https://github.com/Donnishcomau/snote in your browser. snote never reads or stores a GitHub token. Turn the prompt off with `--no-star-prompt` or `SNOTE_STAR_PROMPT=off`.

## Notes for PKGBUILD clone users

This is for a git clone you build with `packaging/aur/PKGBUILD`. The build packages the clone you already have. It does not download a second copy of snote.

```
git pull
cd packaging/aur && makepkg -Cfsi
```

`makepkg -si` stops when `src/snote-<version>` is left from an earlier build. Nothing is installed and nothing of yours is removed. `makepkg -Cfsi` clears that folder and builds. The build also stops if the clone's version and the version in the PKGBUILD differ.

## Still open

- If snote is killed (not quit) within about 150 ms of saving with `:w` while the editor is open, the note can appear twice at the next start. Both copies keep your text; nothing is lost. A normal quit is not affected.
- An editor that passes the file to a window that is already open is not watched for `:w`, and snote saves nothing from it. Set `SNOTE_EDITOR` to a command that waits: `code --wait`, `codium --wait`, `subl -w` or `gvim -f`.
- Rare restart cases can still double or lose a change. After a restart that downloads every note again, an edit can appear twice: the text is doubled, not lost. In rare timing cases, an edit made around a restart can be lost. In an unusual case, an untouched line can still be dropped when another device moved a line that you deleted offline. After a restart, check recent edits in History (`h`).
- With no kernel lock (a Mac without Homebrew's flock, a Linux without util-linux, or a data folder on a network drive), two copies started at the same moment can both run. Run one snote at a time on that folder.
