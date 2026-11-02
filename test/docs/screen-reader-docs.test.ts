import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const readme = readFileSync('README.md', 'utf8');

describe('#17 screen-reader docs', () => {
  it('2: WHEN README.md is read THEN `## Screen-reader mode` occurs once, before `## Keys`, its section names `--screen-reader`, `SNOTE_SCREEN_READER=1`, `--no-screen-reader`, `one linear column, no colour`, `Help and the editor hand-off work` and `INK_SCREEN_READER`, and the file has at most `199` entries from split on a newline', () => {
    expect(readme.split('## Screen-reader mode').length - 1).toBe(1);
    const start = readme.indexOf('## Screen-reader mode');
    expect(start).toBeLessThan(readme.indexOf('## Keys'));
    const section = readme.slice(start, readme.indexOf('## ', start + 4));
    for (const word of ['--screen-reader', 'SNOTE_SCREEN_READER=1', '--no-screen-reader', 'one linear column, no colour', 'Help and the editor hand-off work', 'INK_SCREEN_READER']) {
      expect(section).toContain(word);
    }
    expect(readme.split('\n').length).toBeLessThanOrEqual(199);
  });
});
