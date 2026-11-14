/**
 * #638 #639 #640 #722 (0.2.12 lane L11): README.md has a Known issues section that lists each known case as its own
 * item (the kill within about 150 ms of :w, an editor that hands the file to an open window, and the rare restart cases
 * the 0.2.11 CHANGELOG lists, each its own sentence, no kernel lock, the garbled note and a pointer to CHANGELOG.md), and the Editor section says how to turn on the inline new-note editor for a terminal start and
 * for a start from the bar button, the app menu or a key binding.
 */
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const readme = readFileSync('README.md', 'utf8');
/** The text of one `## ` section, up to the next `## ` heading. */
const section = (title: string): string => {
  const start = readme.indexOf(`\n## ${title}\n`);
  if (start < 0) return '';
  const next = readme.indexOf('\n## ', start + 1);
  return readme.slice(start, next < 0 ? undefined : next);
};
/** Each `- ` item of a section, its wrapped lines joined with one space. */
const items = (text: string): string[] =>
  text
    .split('\n- ')
    .slice(1)
    .map((i) => i.split('\n\n')[0].replace(/\n +/g, ' ').trim());

describe('README Known issues and the inline new-note editor setting', () => {
  it('1: WHEN README.md is read THEN `## Known issues` comes right before `## Known limitations and ideas for improvement` and lists exactly 6 items: the kill within `about 150 ms` of `:w`, the editor that passes the file to an open window with the wait commands, the rare restart cases that remain after 0.2.9 (each its own sentence, as the 0.2.11 CHANGELOG lists them), no kernel lock, the garbled note, and the pointer to `CHANGELOG.md`, and README.md has at most `199` lines', () => {
    const known = section('Known issues');
    expect(known).not.toBe('');
    expect(readme.split('\n').length).toBeLessThanOrEqual(199);
    expect(readme.indexOf('\n## Known issues\n')).toBeLessThan(readme.indexOf('\n## Known limitations and ideas for improvement\n'));
    expect(readme.slice(readme.indexOf('\n## Known issues\n') + 1).indexOf('\n## ')).toBe(
      readme.slice(readme.indexOf('\n## Known issues\n') + 1).indexOf('\n## Known limitations and ideas for improvement\n')
    );
    expect(items(known)).toEqual([
      'If snote is killed (not quit) within about 150 ms of saving with `:w` while the editor is open, the note can appear twice at the next start. Both copies keep your text; nothing is lost. A normal quit is not affected.',
      'An editor that passes the file to a window that is already open is not watched for `:w`, and snote saves nothing from it. Set `SNOTE_EDITOR` to a command that waits: `code --wait`, `codium --wait`, `subl -w` or `gvim -f`.',
      'Rare restart cases can still double or lose a change. After a restart that downloads every note again, an edit can appear twice: the text is doubled, not lost. In rare timing cases, an edit made around a restart can be lost. In an unusual case, an untouched line can still be dropped when another device moved a line that you deleted offline. After a restart, check recent edits in History (`h`).',
      "With no kernel lock (macOS without Homebrew's `flock`, a Linux without util-linux, or a data folder on a network drive), two copies of snote started at the same moment can both run. Run one snote at a time on a data folder.",
      'Two devices adding text to one note within about a second once produced a garbled note on the real service. It has not been seen again.',
      "Each release's known issues, and what it fixed, are listed in `CHANGELOG.md`.",
    ]);
  });

  it('2: WHEN the Editor section is read THEN it says to add `export SNOTE_NEW_NOTE_EDITOR=inline` to `~/.bashrc` for a terminal start, `hl.env("SNOTE_NEW_NOTE_EDITOR", "inline")` to `~/.config/hypr/hyprland.lua` (or `env = SNOTE_NEW_NOTE_EDITOR,inline` in `hyprland.conf`) for the bar button, app menu and key binding, to log out and back in, and that the middle-click new note follows the running snote', () => {
    const editor = section('Editor').replace(/\n/g, ' ');
    expect(editor).toContain('When you type `snote` in a terminal, add `export SNOTE_NEW_NOTE_EDITOR=inline` to `~/.bashrc`, below the line that says to add your own exports.');
    expect(editor).toContain('When you start snote from the bar button, the app menu or a key binding, it takes the desktop session\'s settings: add `hl.env("SNOTE_NEW_NOTE_EDITOR", "inline")` to `~/.config/hypr/hyprland.lua`');
    expect(editor).toContain('add `env = SNOTE_NEW_NOTE_EDITOR,inline` there), then log out and back in.');
    expect(editor).toContain("A new note from the bar's middle-click opens in the snote that is already running, if there is one, so that snote's setting applies.");
  });
});
