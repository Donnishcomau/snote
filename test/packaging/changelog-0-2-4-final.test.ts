// T492 — the final 0.2.4 changelog and release notes cover every fix made
// since the previous changelog round. Structural text tests over
// CHANGELOG.md and docs/release-notes-0.2.4.md; plain string contains and
// indexOf positions only (no regex lookaheads on this node).
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const CHANGELOG = join(process.cwd(), 'CHANGELOG.md');
const NOTES = join(process.cwd(), 'docs', 'release-notes-0.2.4.md');

// The `## 0.2.4` section: text between `## 0.2.4` and `## 0.2.3`, both
// matched at the start of their line; slice positions only.
function changelog024(changelog: string): string {
  const at024 = changelog.indexOf('\n## 0.2.4');
  const at023 = changelog.indexOf('\n## 0.2.3');
  expect(at024).toBeGreaterThanOrEqual(0);
  expect(at023).toBeGreaterThan(at024);
  return changelog.slice(at024, at023);
}

describe('final 0.2.4 changelog and release notes (T492)', () => {
  it('1: WHEN the section is read THEN its `### Added` part contains `https://app.simplenote.com/signup/`.', () => {
    const between = changelog024(readFileSync(CHANGELOG, 'utf8'));
    const addedAt = between.indexOf('### Added');
    const changedAt = between.indexOf('### Changed');
    expect(addedAt).toBeGreaterThanOrEqual(0);
    expect(changedAt).toBeGreaterThan(addedAt);
    const added = between.slice(addedAt, changedAt);
    expect(added).toContain('https://app.simplenote.com/signup/');
  });

  it("2: WHEN the section's `### Fixed` part (to `### Security`) is read THEN it contains `instance.lock`, `force sync`, `offline`, `delete`, `emoji selector`, `15 seconds`, `Paste ignored` and `namcap`, and has at least `16` lines starting with `- `.", () => {
    const between = changelog024(readFileSync(CHANGELOG, 'utf8'));
    const fixedAt = between.indexOf('### Fixed');
    const secAt = between.indexOf('### Security');
    expect(fixedAt).toBeGreaterThanOrEqual(0);
    expect(secAt).toBeGreaterThan(fixedAt);
    const fixed = between.slice(fixedAt, secAt);
    expect(fixed).toContain('instance.lock');
    expect(fixed).toContain('force sync');
    expect(fixed).toContain('offline');
    expect(fixed).toContain('delete');
    expect(fixed).toContain('emoji selector');
    expect(fixed).toContain('15 seconds');
    expect(fixed).toContain('Paste ignored');
    expect(fixed).toContain('namcap');
    const bullets = fixed.split('\n').filter((line) => line.startsWith('- '));
    expect(bullets.length).toBeGreaterThanOrEqual(16);
  });

  it("3: WHEN the section's `### Security` part (to `## 0.2.3`) is read THEN it contains `CAN`, `SUB`, `Buffer`, `username`, `<text>`, `logout`, `migration` and `hex`, and still contains `OSC 52`, `INK_SCREEN_READER` and `SHA`.", () => {
    const between = changelog024(readFileSync(CHANGELOG, 'utf8'));
    const secAt = between.indexOf('### Security');
    expect(secAt).toBeGreaterThanOrEqual(0);
    const security = between.slice(secAt);
    expect(security).toContain('CAN');
    expect(security).toContain('SUB');
    expect(security).toContain('Buffer');
    expect(security).toContain('username');
    expect(security).toContain('<text>');
    expect(security).toContain('logout');
    expect(security).toContain('migration');
    expect(security).toContain('hex');
    expect(security).toContain('OSC 52');
    expect(security).toContain('INK_SCREEN_READER');
    expect(security).toContain('SHA');
  });

  it("4: WHEN docs/release-notes-0.2.4.md is read THEN it contains `**Safer with your data.**`, `https://app.simplenote.com/signup/` and `**Security.**`, `**Security.**` comes before `## Upgrading`, and it ends the Security paragraph with `Your saved notes are not changed.`.", () => {
    const notes = readFileSync(NOTES, 'utf8');
    expect(notes).toContain('**Safer with your data.**');
    expect(notes).toContain('https://app.simplenote.com/signup/');
    expect(notes).toContain('**Security.**');
    expect(notes.indexOf('**Security.**')).toBeLessThan(
      notes.indexOf('## Upgrading'),
    );
    // The Security paragraph runs from `**Security.**` to the next blank
    // line; it must end on the pinned sentence.
    const secAt = notes.indexOf('**Security.**');
    const rest = notes.slice(secAt);
    const blank = rest.indexOf('\n\n');
    expect(blank).toBeGreaterThan(0);
    const securityParagraph = rest.slice(0, blank);
    expect(securityParagraph.endsWith('Your saved notes are not changed.')).toBe(
      true,
    );
  });

  it("5: WHEN the section and docs/release-notes-0.2.4.md are read THEN neither contains `Skryf`, `@`, `/home/`, nor a task id matching `/\\bT4\\d\\d\\b/`.", () => {
    const between = changelog024(readFileSync(CHANGELOG, 'utf8'));
    const notes = readFileSync(NOTES, 'utf8');
    expect(between.includes('Skryf')).toBe(false);
    expect(between.includes('@')).toBe(false);
    expect(between.includes('/home/')).toBe(false);
    expect(/\bT4\d\d\b/.test(between)).toBe(false);
    expect(notes.includes('Skryf')).toBe(false);
    expect(notes.includes('@')).toBe(false);
    expect(notes.includes('/home/')).toBe(false);
    expect(/\bT4\d\d\b/.test(notes)).toBe(false);
  });

  it("6: WHEN the section is read THEN it does not contain `Deferred`, `0.2.5`, `minimum size`, `needs at least 20x7` or `one-column`.", () => {
    const between = changelog024(readFileSync(CHANGELOG, 'utf8'));
    expect(between.includes('Deferred')).toBe(false);
    expect(between.includes('0.2.5')).toBe(false);
    expect(between.includes('minimum size')).toBe(false);
    expect(between.includes('needs at least 20x7')).toBe(false);
    expect(between.includes('one-column')).toBe(false);
  });
});
