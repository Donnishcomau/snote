// T404 — the 0.2.4 changelog and release notes describe the terminal-output security fix.
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const read = (...parts: string[]) =>
  readFileSync(join(process.cwd(), ...parts), 'utf8');

describe('security fix in the 0.2.4 release docs', () => {
  it("1: WHEN CHANGELOG.md is read THEN the text between `## 0.2.4` and `## 0.2.3` contains `### Security`, `OSC 52` and `INK_SCREEN_READER`, and `### Security` comes after `### Fixed`.", () => {
    const changelog = read('CHANGELOG.md');
    const at024 = changelog.indexOf('## 0.2.4');
    const at023 = changelog.indexOf('## 0.2.3');
    expect(at024).toBeGreaterThanOrEqual(0);
    expect(at023).toBeGreaterThanOrEqual(0);
    expect(at024).toBeLessThan(at023);
    const between = changelog.slice(at024, at023);
    expect(between).toContain('### Security');
    expect(between).toContain('OSC 52');
    expect(between).toContain('INK_SCREEN_READER');
    expect(between.indexOf('### Security')).toBeGreaterThan(
      between.indexOf('### Fixed'),
    );
  });

  it("2: WHEN docs/release-notes-0.2.4.md is read THEN it contains `**Security.**` and `OSC 52`, and `**Security.**` comes before `## Upgrading`.", () => {
    const notes = read('docs', 'release-notes-0.2.4.md');
    expect(notes).toContain('**Security.**');
    expect(notes).toContain('OSC 52');
    expect(notes.indexOf('**Security.**')).toBeLessThan(
      notes.indexOf('## Upgrading'),
    );
  });
});
