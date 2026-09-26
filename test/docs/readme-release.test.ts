import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';

const readme = readFileSync('README.md', 'utf8');

function section(md: string, heading: string): string {
  const start = md.indexOf('## ' + heading);
  expect(start).toBeGreaterThan(-1);
  const next = md.indexOf('\n## ', start);
  return next === -1 ? md.slice(start) : md.slice(start, next);
}

describe('README — public release content (T307)', () => {
  it("1: WHEN README.md is read THEN it contains none of `TASKS.md`, `.loop/task-`, `scripts/run-loop.sh`.", () => {
    expect(readme).not.toContain('TASKS.md');
    expect(readme).not.toContain('.loop/task-');
    expect(readme).not.toContain('scripts/run-loop.sh');
  });

  it('2: WHEN the `## Known limitations and ideas for improvement` section is read THEN it contains `150 ms` and `ZWJ`, and contains no three-digit millisecond figure other than `150`.', () => {
    const s = section(readme, 'Known limitations and ideas for improvement');
    expect(s).toContain('150 ms');
    expect(s).toContain('ZWJ');
    for (const m of s.matchAll(/\d+(\d|,)*\s*ms/g)) {
      const digits = m[0].replace(/[^0-9]/g, '');
      if (digits.length === 3) {
        expect(digits).toBe('150');
      }
    }
  });

  it('3: WHEN README.md is read THEN it contains `docs/screenshots/main.png` and `docs/screenshots/help.png`.', () => {
    expect(readme).toContain('docs/screenshots/main.png');
    expect(readme).toContain('docs/screenshots/help.png');
  });

  it('4: WHEN README.md is read THEN it contains `SECURITY.md`.', () => {
    expect(readme).toContain('SECURITY.md');
  });

  it('5: WHEN the `## Keys` section is read THEN it contains a row for `w` with `Export note to .md`.', () => {
    const s = section(readme, 'Keys');
    expect(s).toContain('| `w` | Export note to .md |');
  });

  it("6: WHEN README.md is read THEN it contains no `@` character and no `qteamdon`.", () => {
    expect(readme).not.toContain('@');
    expect(readme).not.toContain('qteamdon');
  });
});
