import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';

// #574: the 0.2.9 notes claim only what 0.2.9 fixes.
function flat(s: string): string {
  return s.replace(/\s+/g, ' ');
}
function changelog092(): string {
  const md = readFileSync('CHANGELOG.md', 'utf8');
  const start = md.indexOf('\n## 0.2.9\n');
  expect(start).toBeGreaterThan(-1);
  const next = md.indexOf('\n## 0.2.8\n', start);
  expect(next).toBeGreaterThan(start);
  return flat(md.slice(start, next));
}
const notes = (): string => flat(readFileSync('docs/release-notes-0.2.9.md', 'utf8'));

describe('0.2.9 notes scope (#574)', () => {
  it('1: WHEN the 0.2.9 section of CHANGELOG.md and docs/release-notes-0.2.9.md are read THEN neither contains `stays deleted`.', () => {
    expect(changelog092()).not.toContain('stays deleted');
    expect(notes()).not.toContain('stays deleted');
  });

  it('2: WHEN the 0.2.9 section of CHANGELOG.md is read THEN it contains `In the usual case an untouched line is no longer dropped` and `is no longer brought back by a restart that downloads every note again`, and does not contain `delete forever within seconds of a restart` (#578, is closed).', () => {
    const s = changelog092();
    expect(s).toContain('In the usual case an untouched line is no longer dropped');
    expect(s).toContain('is no longer brought back by a restart that downloads every note again');
    expect(s).not.toContain('delete forever within seconds of a restart');
  });

  it('3: WHEN docs/release-notes-0.2.9.md is read THEN it contains `in the usual case an untouched line is no longer dropped` and `is no longer brought back by a restart that downloads every note again`.', () => {
    const s = notes();
    expect(s).toContain('In the usual case, an untouched line is no longer dropped');
    expect(s).toContain('is no longer brought back by a restart that downloads every note again');
    expect(s).not.toContain('delete forever within seconds of a restart');
    // the qualifier comes before the delete-forever clause in the same bullet
    const q = s.indexOf('In the usual case, an untouched line');
    const d = s.indexOf('a note deleted forever is no longer brought back');
    expect(q).toBeGreaterThan(-1);
    expect(d).toBeGreaterThan(q);
  });
});
