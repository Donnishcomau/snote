import { describe, it, expect } from 'vitest';
import * as fs from 'node:fs';

const files = [
  'test/cli/login-calls.test.ts',
  'test/cli/build.test.ts',
  'test/integration/sync-wire.test.ts',
  'test/fake-simperium/server-resume.test.ts',
];

describe('stable-timeouts', () => {
  it('1: WHEN each of the 4 files is read THEN each contains the line `vi.setConfig({ testTimeout: 15000 });` exactly 1 time, and that line comes after the last line starting with `import `.', async () => {
    for (const f of files) {
      const content = fs.readFileSync(f, 'utf8');
      const lines = content.split('\n');
      const configLines = lines.filter((l) =>
        l.trim() === 'vi.setConfig({ testTimeout: 15000 });'
      );
      expect(configLines.length).toBe(1);

      const lastImportIndex = lines.reduce(
        (idx, l, i) => (l.trim().startsWith('import ') ? i : idx),
        -1
      );
      const configIndex = lines.findIndex((l) =>
        l.trim() === 'vi.setConfig({ testTimeout: 15000 });'
      );
      expect(configIndex > lastImportIndex).toBe(true);
    }
  });

  it('2: WHEN each of the 4 files is read THEN its vitest import (the line containing `from \'vitest\'`) contains `vi`.', async () => {
    for (const f of files) {
      const content = fs.readFileSync(f, 'utf8');
      const line = content.split('\n').find((l) =>
        l.includes("from 'vitest'")
      );
      expect(line).toBeDefined();
      expect(line!.includes('vi')).toBe(true);
    }
  });

  it('3: WHEN `test/integration/sync-wire.test.ts` is read THEN it does not contain `setTimeout(r, 2000)` and it contains `!logoutCalled` and `expect(logoutCalled).toBe(true)`.', async () => {
    const content = fs.readFileSync(
      'test/integration/sync-wire.test.ts',
      'utf8'
    );
    expect(content.includes('setTimeout(r, 2000)')).toBe(false);
    expect(content.includes('!logoutCalled')).toBe(true);
    expect(content.includes('expect(logoutCalled).toBe(true)')).toBe(true);
  });

  it('4: WHEN the lines containing `expect(` are counted THEN `test/cli/login-calls.test.ts` has at least 13, `test/cli/build.test.ts` at least 18, `test/integration/sync-wire.test.ts` at least 11 and `test/fake-simperium/server-resume.test.ts` at least 19 (today\'s counts: nothing was removed).', async () => {
    const expected = {
      'test/cli/login-calls.test.ts': 13,
      'test/cli/build.test.ts': 18,
      'test/integration/sync-wire.test.ts': 11,
      'test/fake-simperium/server-resume.test.ts': 19,
    };
    for (const [f, min] of Object.entries(expected)) {
      const content = fs.readFileSync(f, 'utf8');
      const count = (content.match(/expect\(/g) || []).length;
      expect(count).toBeGreaterThanOrEqual(min);
    }
  });
});
