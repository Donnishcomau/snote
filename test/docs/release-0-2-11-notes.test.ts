import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';

// Collapse line wrapping so a sentence can be matched across the CHANGELOG's wrapped lines.
const flat = (text: string): string => text.replace(/\s+/g, ' ');
const notes = readFileSync('docs/release-notes-0.2.11.md', 'utf8');
const changelog = readFileSync('CHANGELOG.md', 'utf8');
const entry = changelog.slice(changelog.indexOf('## 0.2.11\n'), changelog.indexOf('\n## 0.2.10\n'));

describe('0.2.11 release notes and CHANGELOG entry', () => {
  it('1: WHEN docs/release-notes-0.2.11.md is read THEN it starts with `# snote 0.2.11` and holds the reinstall section `## If you installed 0.2.10 or older: reinstall once` with the remove and add commands in order and the line `Not touched:`', () => {
    expect(notes.startsWith('# snote 0.2.11\n')).toBe(true);
    const at = notes.indexOf('\n## If you installed 0.2.10 or older: reinstall once\n');
    expect(at).toBeGreaterThan(0);
    const rm = notes.indexOf('1. Run `omarchy plugin remove io.github.donnishcomau.snote-simplenote`.', at);
    const add = notes.indexOf('2. Run `omarchy plugin add https://github.com/donnishcomau/snote --enable`.', at);
    expect(rm).toBeGreaterThan(at);
    expect(add).toBeGreaterThan(rm);
    expect(notes).toContain('Not touched: `omarchy plugin remove` deletes only the plugin folder.');
  });

  it('2: WHEN CHANGELOG.md is read THEN its first two `## ` headings are `## 0.2.11` then `## 0.2.10`, and the 0.2.11 entry holds the one-time reinstall bullet and the sections Added, Changed, Fixed and Known issues', () => {
    expect(changelog.match(/^## .*$/gm)?.slice(0, 2)).toEqual(['## 0.2.11', '## 0.2.10']);
    expect(flat(entry)).toContain('- Installs from 0.2.0 to 0.2.10 need a one-time reinstall (`omarchy plugin remove`, then `omarchy plugin add`, then one click on the bar button) because the public history was rewritten; notes, account and unsent changes are kept. See the release notes.');
    for (const h of ['### Added', '### Changed', '### Fixed', '### Known issues']) expect(entry).toContain(`\n${h}\n`);
  });

  it('3: WHEN the 0.2.11 notes and CHANGELOG entry are read THEN neither holds an issue or PR number (`#` then a digit) or an em dash', () => {
    for (const text of [notes, entry]) {
      expect(text).not.toMatch(/#\d/);
      expect(text).not.toContain('—');
    }
  });
});
