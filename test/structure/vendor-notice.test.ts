/**
 * GPLv2 section 2(a) change notices. Every vendored file we modified
 * carries the exact header line as its new first line; the unmodified ones
 * are byte-identical to upstream and must not carry it.
 */
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

// #615: the notice line; its date is the day the notice was added to that file (pinned per file in test/docs/licence-id.test.ts)
const HEADER =
  /^\/\/ OMARCHY: modified for snote from Automattic's simplenote-electron \(GPLv2\); see NOTICE \(\d{4}-\d{2}-\d{2}\)\.$/;

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

describe('GPLv2 change notices on modified vendored files', () => {
  it('1: WHEN every file under `vendor/simplenote/` is listed THEN there are exactly `46` files and exactly `24` of them contain `// OMARCHY:` somewhere in their content.', () => {
    expect(allFiles.length).toBe(46);
    expect(modified.length).toBe(24);
  });

  it("2: WHEN each of the files that contains `// OMARCHY:` is read THEN its first line is exactly `// OMARCHY: modified for snote from Automattic's simplenote-electron (GPLv2); see NOTICE (<date>).`", () => {
    for (const file of modified) {
      expect(read(file).split('\n')[0]).toMatch(HEADER);
    }
  });

  it("3: WHEN each of the files that does NOT contain `// OMARCHY:` is read THEN its first line is NOT `// OMARCHY: modified for snote from Automattic's simplenote-electron (GPLv2); see NOTICE (<date>).`", () => {
    expect(untouched.length).toBe(22);
    for (const file of untouched) {
      expect(read(file).split('\n')[0]).not.toMatch(HEADER);
    }
  });

  it('4: WHEN `vendor/simplenote/state/simperium/middleware.ts` (a modified file) is read THEN its first line is the header from line 2 above AND it still contains `onClient` (the header did not replace or damage the file\'s own content).', () => {
    const source = read('vendor/simplenote/state/simperium/middleware.ts');
    expect(source.split('\n')[0]).toMatch(HEADER);
    expect(source).toContain('onClient');
  });

  it('5: WHEN `vendor/simplenote/state/simperium/functions/in-memory-ghost.ts` (an unmodified file, not in the 24) is read THEN it does not contain `// OMARCHY:` anywhere and its first line is not the header from line 2 above.', () => {
    const source = read('vendor/simplenote/state/simperium/functions/in-memory-ghost.ts');
    expect(source).not.toContain('// OMARCHY:');
    expect(source.split('\n')[0]).not.toMatch(HEADER);
  });
});
