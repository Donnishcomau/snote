/**
 * T173: the bundle loads `simperium` lazily (only when the client is first
 * created) and imports one lodash function instead of all of lodash.
 */
import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { bundle } from '../../scripts/build.mjs';
import noteTitleAndPreview from '@vendor/utils/note-utils';

const ENTRY = 'src/cli/index.ts';

let outfile: string;
let bundled = '';
let size = 0;
const dirs: string[] = [];

describe('T173 lazy simperium and slim lodash', () => {
  beforeAll(async () => {
    const dir = mkdtempSync(join(tmpdir(), 'bundle-lazy-'));
    dirs.push(dir);
    outfile = join(dir, 'cli.js');
    await bundle({ entry: ENTRY, outfile });
    bundled = readFileSync(outfile, 'utf8');
    size = Buffer.byteLength(bundled, 'utf8');
  }, 20000);

  afterAll(() => {
    for (const dir of dirs) {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('1: WHEN the bundle of src/cli/index.ts is read THEN it contains `function simperium_default(` and does not match /^var \\w+ = require_simperium\\(\\);$/m', () => {
    expect(bundled).toContain('function simperium_default(');
    expect(bundled).not.toMatch(/^var \w+ = require_simperium\(\);$/m);
  });

  it('2: WHEN the bundle is read THEN it contains `lodash/escapeRegExp` and does not contain `lodash/lodash.js`', () => {
    expect(bundled).toContain('lodash/escapeRegExp');
    expect(bundled).not.toContain('lodash/lodash.js');
  });

  it('3: WHEN the size of the bundle is read THEN it is above `1000000` and below `1600000` bytes', () => {
    expect(size).toBeGreaterThan(1000000);
    expect(size).toBeLessThan(1600000);
  });

  it('4: WHEN the bundle is run with spawnSync(process.execPath, [outfile, \'--help\'], { encoding: \'utf8\' }) THEN the exit status is `0` and stdout contains `usage: snote`', () => {
    const result = spawnSync(process.execPath, [outfile, '--help'], {
      encoding: 'utf8',
    });
    expect(result.status).toBe(0);
    expect(result.stdout).toContain('usage: snote');
  });

  it("5: WHEN vendor/simplenote/utils/note-utils.ts is read THEN line 3 contains `lodash/escapeRegExp` and `// OMARCHY:`, and the file does not contain `from 'lodash'`", () => {
    const source = readFileSync('vendor/simplenote/utils/note-utils.ts', 'utf8');
    const line3 = source.split('\n')[2]; // OMARCHY: line 1 is now the GPLv2 change-notice header (T269)
    expect(line3).toContain('lodash/escapeRegExp');
    expect(line3).toContain('// OMARCHY:');
    expect(source).not.toContain("from 'lodash'");
  });

  it("6: WHEN noteTitleAndPreview({ content: 'Title\\nthe price is 3.50 c++( today', systemTags: [] } as never, 'c++(') is called THEN it returns title `Title` and preview `the price is 3.50 c++( today`", () => {
    const result = noteTitleAndPreview(
      { content: 'Title\nthe price is 3.50 c++( today', systemTags: [] } as never,
      'c++('
    );
    expect(result.title).toBe('Title');
    expect(result.preview).toBe('the price is 3.50 c++( today');
  });
});
