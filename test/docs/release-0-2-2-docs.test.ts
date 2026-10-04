import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';

function section(md: string, heading: string): string {
  const start = md.indexOf('## ' + heading);
  expect(start).toBeGreaterThan(-1);
  const next = md.indexOf('\n## ', start);
  return next === -1 ? md.slice(start) : md.slice(start, next);
}

describe('docs for 0.2.2 (T366)', () => {
  it('1: WHEN the README `## Keys` section is read THEN it contains `| `←` / `→` | Move between the tags, notes and preview panes |` and `Next pane (with the tags pane open: tags and notes)`.', () => {
    const readme = readFileSync('README.md', 'utf8');
    const s = section(readme, 'Keys');
    expect(s).toContain('| `←` / `→` | Move between the tags, notes and preview panes |');
    expect(s).toContain('Next pane (with the tags pane open: tags and notes)');
  });

  it('2: WHEN README.md is read THEN it does not contain `is planned for 0.2`, and it has at most `200` lines.', () => {
    const readme = readFileSync('README.md', 'utf8');
    expect(readme).not.toContain('is planned for 0.2');
    const lines = readme.split('\n').length;
    expect(lines).toBeLessThanOrEqual(200);
  });

  it('3: WHEN CHANGELOG.md is read THEN `## 0.2.2` comes before `## 0.2.1`, and the text between them contains `### Added`, `### Changed`, `--new`, `Tab Tags`, `Click to install` and `theme`.', () => {
    const changelog = readFileSync('CHANGELOG.md', 'utf8');
    const at22 = changelog.indexOf('## 0.2.2');
    const at21 = changelog.indexOf('## 0.2.1');
    expect(at22).toBeGreaterThan(-1);
    expect(at21).toBeGreaterThan(-1);
    expect(at22).toBeLessThan(at21);
    const between = changelog.slice(at22, at21);
    expect(between).toContain('### Added');
    expect(between).toContain('### Changed');
    expect(between).toContain('--new');
    expect(between).toContain('Tab Tags');
    expect(between).toContain('Click to install');
    expect(between).toContain('theme');
  });

  it("4: WHEN docs/release-notes-0.2.2.md is read THEN it starts with `# snote 0.2.2 release notes` and contains `## What's new`, `## Upgrading`, `## Thanks` and `middle-click`.", () => {
    const notes = readFileSync('docs/release-notes-0.2.2.md', 'utf8');
    expect(notes.startsWith('# snote 0.2.2 release notes')).toBe(true);
    expect(notes).toContain("## What's new");
    expect(notes).toContain('## Upgrading');
    expect(notes).toContain('## Thanks');
    expect(notes).toContain('middle-click');
  });
});
