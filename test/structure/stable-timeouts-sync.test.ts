import { describe, it, expect } from 'vitest';
import * as fs from 'node:fs';

const files = [
  'test/fake-simperium/server-create.test.ts',
  'test/fake-simperium/server-channels.test.ts',
  'test/integration/sync.test.ts',
  'test/integration/persistence.test.ts',
];

describe('stable-timeouts-sync', () => {
  it('1: WHEN each of the 4 files is read THEN each contains the line `vi.setConfig({ testTimeout: 15000 });` exactly 1 time, after the last line starting with `import `.', async () => {
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

  it('2: WHEN each of the 4 files is read THEN the line containing `from \'vitest\'` contains `vi`.', async () => {
    for (const f of files) {
      const content = fs.readFileSync(f, 'utf8');
      const line = content.split('\n').find((l) =>
        l.includes("from 'vitest'")
      );
      expect(line).toBeDefined();
      expect(line!.includes('vi')).toBe(true);
    }
  });

  it('3: WHEN the lines containing `expect(` are counted THEN `server-create.test.ts` has at least `7`, `server-channels.test.ts` at least `8`, `sync.test.ts` at least `11` and `persistence.test.ts` at least `3`.', async () => {
    const expected = {
      'test/fake-simperium/server-create.test.ts': 7,
      'test/fake-simperium/server-channels.test.ts': 8,
      'test/integration/sync.test.ts': 11,
      'test/integration/persistence.test.ts': 3,
    };
    for (const [f, min] of Object.entries(expected)) {
      const content = fs.readFileSync(f, 'utf8');
      const count = (content.match(/expect\(/g) || []).length;
      expect(count).toBeGreaterThanOrEqual(min);
    }
  });

  it('4: WHEN the `it(` cases are counted (lines matching `/^\\s*it\\(/`) THEN the four files have exactly `3`, `3`, `5` and `2` in that order.', async () => {
    const expected = {
      'test/fake-simperium/server-create.test.ts': 3,
      'test/fake-simperium/server-channels.test.ts': 3,
      'test/integration/sync.test.ts': 5,
      'test/integration/persistence.test.ts': 2,
    };
    for (const [f, count] of Object.entries(expected)) {
      const content = fs.readFileSync(f, 'utf8');
      const actual = content.split('\n').filter((l) => /^[\s]*it\(/.test(l)).length;
      expect(actual).toBe(count);
    }
  });
});
