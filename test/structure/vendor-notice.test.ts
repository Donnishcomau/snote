/**
 * T269: GPLv2 section 2(a) change notices. Every vendored file we modified
 * carries the exact header line as its new first line; the unmodified ones
 * are byte-identical to upstream and must not carry it.
 */
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const HEADER =
  "// OMARCHY: modified for snote from Automattic's simplenote-electron (GPLv2); see NOTICE (2026-09-23).";

const read = (p: string) => readFileSync(resolve(process.cwd(), p), 'utf8');

const allFiles: string[] = [];
function walk(dir: string): void {
  for (const entry of readdirSync(resolve(process.cwd(), dir))) {
    const full = dir + '/' + entry;
    if (statSync(resolve(process.cwd(), full)).isDirectory()) {
      walk(full);
    } else {
      allFiles.push(full);
    }
  }
}
walk('vendor/simplenote');

const modified = allFiles.filter((f) => read(f).includes('// OMARCHY:'));
const untouched = allFiles.filter((f) => !read(f).includes('// OMARCHY:'));

describe('T269 GPLv2 change notices on modified vendored files', () => {
  it('1: WHEN every file under `vendor/simplenote/` is listed THEN there are exactly `45` files and exactly `17` of them contain `// OMARCHY:` somewhere in their content.', () => {
    expect(allFiles.length).toBe(45);
    expect(modified.length).toBe(17);
  });

  it("2: WHEN each of the files that contains `// OMARCHY:` is read THEN its first line is exactly `// OMARCHY: modified for snote from Automattic's simplenote-electron (GPLv2); see NOTICE (2026-09-23).`", () => {
    for (const file of modified) {
      expect(read(file).split('\n')[0]).toBe(HEADER);
    }
  });

  it("3: WHEN each of the files that does NOT contain `// OMARCHY:` is read THEN its first line is NOT `// OMARCHY: modified for snote from Automattic's simplenote-electron (GPLv2); see NOTICE (2026-09-23).`", () => {
    expect(untouched.length).toBe(28);
    for (const file of untouched) {
      expect(read(file).split('\n')[0]).not.toBe(HEADER);
    }
  });

  it('4: WHEN `vendor/simplenote/state/simperium/middleware.ts` (a modified file) is read THEN its first line is the header from line 2 above AND it still contains `onClient` (the header did not replace or damage the file\'s own content).', () => {
    const source = read('vendor/simplenote/state/simperium/middleware.ts');
    expect(source.split('\n')[0]).toBe(HEADER);
    expect(source).toContain('onClient');
  });

  it('5: WHEN `vendor/simplenote/state/simperium/functions/in-memory-ghost.ts` (an unmodified file, not in the 17) is read THEN it does not contain `// OMARCHY:` anywhere and its first line is not the header from line 2 above.', () => {
    const source = read('vendor/simplenote/state/simperium/functions/in-memory-ghost.ts');
    expect(source).not.toContain('// OMARCHY:');
    expect(source.split('\n')[0]).not.toBe(HEADER);
  });
});
