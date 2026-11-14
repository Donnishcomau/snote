import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { MIN_DAYS, MIN_LAUNCHES } from '../../src/core/star-prompt';

// Collapse line wrapping so a sentence can be matched across the CHANGELOG's wrapped lines.
const flat = (text: string): string => text.replace(/\s+/g, ' ');
const notes = readFileSync('docs/release-notes-0.2.12.md', 'utf8');
const changelog = readFileSync('CHANGELOG.md', 'utf8');
const entry = changelog.slice(changelog.indexOf('## 0.2.12\n'), changelog.indexOf('\n## 0.2.11\n'));
const trust = 'A first install trusts the release it downloads.';

const KILL =
  'If snote is killed (not quit) within about 150 ms of saving with `:w` while the editor is open, the note can appear twice at the next start. Both copies keep your text; nothing is lost. A normal quit is not affected.';
const EDITOR =
  'An editor that passes the file to a window that is already open is not watched for `:w`, and snote saves nothing from it. Set `SNOTE_EDITOR` to a command that waits: `code --wait`, `codium --wait`, `subl -w` or `gvim -f`.';
const RESTART =
  'Rare restart cases can still double or lose a change. After a restart that downloads every note again, an edit can appear twice: the text is doubled, not lost. In rare timing cases, an edit made around a restart can be lost. In an unusual case, an untouched line can still be dropped when another device moved a line that you deleted offline. After a restart, check recent edits in History (`h`).';
const LOCK =
  'With no kernel lock (a Mac without Homebrew\'s flock, a Linux without util-linux, or a data folder on a network drive), two copies started at the same moment can both run. Run one snote at a time on that folder.';
const STAR =
  'A one-time prompt asks once, after real use (8 launches and 7 days, never at first start), whether you would star snote on GitHub. Press `s` to star or `n` for no thanks. With the GitHub CLI (`gh`) installed in a standard location (/usr/bin, /usr/local/bin or Homebrew), `s` runs `gh auth status`, which has `gh` check your sign-in with GitHub, then asks `[y/N]`; only on `y` does snote star the repo through your own `gh`. Otherwise `s` opens https://github.com/Donnishcomau/snote in your browser. snote never reads or stores a GitHub token. Turn the prompt off with `--no-star-prompt` or `SNOTE_STAR_PROMPT=off`.';

describe('0.2.12 release notes and CHANGELOG entry', () => {
  it('1: WHEN docs/release-notes-0.2.12.md is read THEN it starts with `# snote 0.2.12` and holds `A first install trusts the release it downloads.` and `a leftover lock file names a process ID`', () => {
    expect(notes.startsWith('# snote 0.2.12\n')).toBe(true);
    expect(notes).toContain(trust);
    expect(notes).toContain('a leftover lock file names a process ID');
  });

  it('2: WHEN notes and CHANGELOG are read THEN the first `## ` heading is `## 0.2.12`, the next is `## 0.2.11`, both hold `A first install trusts the release it downloads.`, and both lists hold KILL, EDITOR, RESTART and LOCK', () => {
    expect(changelog.match(/^## .*$/gm)?.slice(0, 2)).toEqual(['## 0.2.12', '## 0.2.11']);
    expect(flat(entry)).toContain(trust);
    expect(notes).toContain(trust);
    const knownAt = entry.indexOf('### Known issues');
    const knownNext = entry.indexOf('\n## ', knownAt);
    const known = flat(entry.slice(knownAt, knownNext === -1 ? undefined : knownNext));
    const still = flat(notes.slice(notes.indexOf('## Still open')));
    for (const section of [known, still]) {
      const bullets = section.split(' - ').slice(1);
      expect(bullets).toHaveLength(4);
      for (const sentence of [KILL, EDITOR, RESTART, LOCK]) {
        expect(bullets.filter((bullet) => bullet.includes(sentence))).toHaveLength(1);
      }
    }
  });

  it('3: WHEN the 0.2.12 notes and the 0.2.12 CHANGELOG entry are read THEN neither holds `#` followed by a digit or an em dash, the notes contain exactly one of `makepkg -Csi` and `makepkg -Cfsi`, the word Homebrew appears in the notes only together with `brew install donnishcomau/snote/snote`, each holds the heading line `Homebrew, on macOS (Apple silicon) and on Linux:` and the opening sentence `snote can now be installed with Homebrew, on macOS (Apple silicon) and on Linux.`, and neither holds `on macOS and on Linux`', () => {
    const heading = 'Homebrew, on macOS (Apple silicon) and on Linux:';
    const opening = 'snote can now be installed with Homebrew, on macOS (Apple silicon) and on Linux.';
    for (const text of [notes, entry]) {
      expect(text).not.toMatch(/#\d/);
      expect(text).not.toContain('—');
      expect(text.split('\n')).toContain(heading);
      expect(text).not.toContain('on macOS and on Linux');
    }
    const flags = ['makepkg -Csi', 'makepkg -Cfsi'].filter((flag) => notes.includes(flag));
    expect(flags).toEqual(['makepkg -Cfsi']);
    expect(notes.includes('Homebrew')).toBe(notes.includes('brew install donnishcomau/snote/snote'));
    for (const text of [notes, flat(entry)]) {
      expect(text).toContain('macOS (Apple silicon)');
      expect(text).toContain('brew install donnishcomau/snote/snote');
      expect(text).not.toContain('brew tap');
      expect(text).toContain(opening);
    }
  });

  it('4: WHEN the 0.2.12 notes and CHANGELOG entry are read THEN the last Fixes bullet of each is the star-prompt bullet, and its numbers are MIN_LAUNCHES and MIN_DAYS', () => {
    const notesFixes = notes.slice(notes.indexOf('\n## Fixes\n'), notes.indexOf('\n## Notes for PKGBUILD clone users'));
    const noteBullets = notesFixes.split('\n').filter((line) => line.startsWith('- '));
    expect(noteBullets[noteBullets.length - 1]).toBe(`- ${STAR}`);
    const logFixes = entry.slice(entry.indexOf('\n### Fixes\n'), entry.indexOf('\n### Notes for PKGBUILD clone users'));
    const logParts = logFixes.split('\n- ');
    expect(flat(logParts[logParts.length - 1]).trim()).toBe(STAR);
    expect(STAR).toContain(`${MIN_LAUNCHES} launches and ${MIN_DAYS} days`);
  });
});
