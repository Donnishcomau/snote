// T429 — the 0.2.4 changelog and release notes: clearer wording and every
// review 4 fix in the Security section. Structural text tests over
// CHANGELOG.md and docs/release-notes-0.2.4.md; plain string contains and
// indexOf positions only (no regex lookaheads on this node).
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const CHANGELOG = join(process.cwd(), 'CHANGELOG.md');
const NOTES = join(process.cwd(), 'docs', 'release-notes-0.2.4.md');

// The text between `## 0.2.4` and `## 0.2.3`, both matched at the start
// of their line (`## 0.2.3` also occurs inside `## 0.2.3`-pinned text),
// slice positions only.
function changelog024(changelog: string): string {
  const at024 = changelog.indexOf('\n## 0.2.4');
  const at023 = changelog.indexOf('\n## 0.2.3');
  expect(at024).toBeGreaterThanOrEqual(0);
  expect(at023).toBeGreaterThan(at024);
  return changelog.slice(at024, at023);
}

describe('0.2.4 changelog and release notes for review 4 (T429)', () => {
  it('1: WHEN the text between `## 0.2.4` and `## 0.2.3` in CHANGELOG.md is read THEN it contains `at most once every 24 hours`, `Pane headings`, `1 note` and `yellow`, and does not contain `everything it writes`.', () => {
    const between = changelog024(readFileSync(CHANGELOG, 'utf8'));
    expect(between).toContain('at most once every 24 hours');
    expect(between).toContain('Pane headings');
    expect(between).toContain('1 note');
    expect(between).toContain('yellow');
    expect(between.includes('everything it writes')).toBe(false);
  });

  it("2: WHEN that text's `### Security` part (to `## 0.2.3`) is read THEN it contains `OSC 52`, `INK_SCREEN_READER`, `stderr`, `bidi`, `publish link`, `crash`, `inline editor`, `git`, `https` and `SHA`.", () => {
    const between = changelog024(readFileSync(CHANGELOG, 'utf8'));
    const secAt = between.indexOf('### Security');
    expect(secAt).toBeGreaterThanOrEqual(0);
    const security = between.slice(secAt);
    expect(security).toContain('OSC 52');
    expect(security).toContain('INK_SCREEN_READER');
    expect(security).toContain('stderr');
    expect(security).toContain('bidi');
    expect(security).toContain('publish link');
    expect(security).toContain('crash');
    expect(security).toContain('inline editor');
    expect(security).toContain('git');
    expect(security).toContain('https');
    expect(security).toContain('SHA');
  });

  it('3: WHEN that text`s `### Fixed` part (to `### Security`) is read THEN it has at least `7` lines starting with `- `.', () => {
    const between = changelog024(readFileSync(CHANGELOG, 'utf8'));
    const fixedAt = between.indexOf('### Fixed');
    const secAt = between.indexOf('### Security');
    expect(fixedAt).toBeGreaterThanOrEqual(0);
    expect(secAt).toBeGreaterThan(fixedAt);
    const fixed = between.slice(fixedAt, secAt);
    const bullets = fixed.split('\n').filter((line) => line.startsWith('- '));
    expect(bullets.length).toBeGreaterThanOrEqual(7);
  });

  it('4: WHEN docs/release-notes-0.2.4.md is read THEN it contains `at most once every 24 hours` and `**Security.**`, does not contain `everything it writes`, and `**Security.**` comes before `## Upgrading`.', () => {
    const notes = readFileSync(NOTES, 'utf8');
    expect(notes).toContain('at most once every 24 hours');
    expect(notes).toContain('**Security.**');
    expect(notes.includes('everything it writes')).toBe(false);
    expect(notes.indexOf('**Security.**')).toBeLessThan(
      notes.indexOf('## Upgrading'),
    );
  });
});
