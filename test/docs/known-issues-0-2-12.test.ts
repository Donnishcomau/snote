/**
 * #638 #639 #640: the Known issues that stay open in 0.2.12 are written down in plain words, each its own
 * sentence, in README.md (`## Known issues`) and in the CHANGELOG.md entry for the release being prepared
 * (`## 0.2.12`): the kill within about 150 ms of `:w` (#638), the editor that hands the file to
 * an open window (#639) and the restart bullet (#640): an edit can appear twice, and the two rare cases that can
 * lose a change, which README.md keeps. Removing one sentence fails a test here.
 * Wrapped CHANGELOG lines are joined with one space before matching.
 */
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const flat = (text: string): string => text.replace(/\s+/g, ' ');
const readme = flat(readFileSync('README.md', 'utf8'));
const changelog = readFileSync('CHANGELOG.md', 'utf8');
const known = readme.slice(readme.indexOf(' ## Known issues '), readme.indexOf(' ## Known limitations and ideas for improvement '));
const entry = /^## 0\.2\.12\n[\s\S]*?(?=\n## )/m.exec(changelog)?.[0] ?? '';
const notes = flat(entry.slice(entry.indexOf('### Known issues')));

const KILL =
  'If snote is killed (not quit) within about 150 ms of saving with `:w` while the editor is open, the note can appear twice at the next start. Both copies keep your text; nothing is lost. A normal quit is not affected.';
const EDITOR =
  'An editor that passes the file to a window that is already open is not watched for `:w`, and snote saves nothing from it. Set `SNOTE_EDITOR` to a command that waits: `code --wait`, `codium --wait`, `subl -w` or `gvim -f`.';
const RESTART =
  'Rare restart cases can still double or lose a change. After a restart that downloads every note again, an edit can appear twice: the text is doubled, not lost. In rare timing cases, an edit made around a restart can be lost. In an unusual case, an untouched line can still be dropped when another device moved a line that you deleted offline. After a restart, check recent edits in History (`h`).';

describe('Known issues in README.md and the CHANGELOG.md entry being prepared', () => {
  it('1: WHEN README.md `## Known issues` is read THEN it holds the kill sentence, the already-open-window editor sentence with the four wait commands, and the whole restart bullet: an edit can appear twice after a restart that downloads every note again, an edit made around a restart can be lost, and an untouched line can be dropped', () => {
    expect(known).not.toBe('');
    expect(known).toContain(KILL);
    expect(known).toContain(EDITOR);
    expect(known).toContain(RESTART);
  });

  it('2: WHEN the CHANGELOG.md `## 0.2.12` entry is read THEN its `### Known issues` holds the same three texts, each in its own bullet, the restart bullet with both loss sentences and the History hint', () => {
    expect(notes).not.toBe('');
    for (const s of [KILL, EDITOR, RESTART]) {
      expect(notes).toContain(s);
      expect(notes.split(' - ').filter((b) => b.includes(s))).toHaveLength(1);
    }
    expect(notes).toContain('After a restart, check recent edits in History (`h`).');
  });

  it('3: WHEN the CHANGELOG.md entry is read THEN it holds no issue or PR number (`#` then a digit) and no em dash', () => {
    expect(entry).not.toMatch(/#\d/);
    expect(entry).not.toContain('—');
  });
});
