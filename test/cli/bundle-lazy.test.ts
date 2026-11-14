/**
 * the bundle loads `simperium` lazily (only when the client is first
 * created) and imports one lodash function instead of all of lodash.
 * #68diet: note-utils escapes the search term with its own one-line function, so no lodash file ships.
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

describe('lazy simperium and slim lodash', () => {
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

  it('2: WHEN the bundle is read THEN it does not contain `node_modules/lodash/`', () => {
    expect(bundled).not.toContain('node_modules/lodash/');
  });

  it('3: WHEN the size of the bundle is read THEN it is above `1000000` and below `1598700` bytes', () => {
    expect(size).toBeGreaterThan(1000000);
    expect(size).toBeLessThan(1598700);
  });

  it('4: WHEN the bundle is run with spawnSync(process.execPath, [outfile, \'--help\'], { encoding: \'utf8\' }) THEN the exit status is `0` and stdout contains `usage: snote`', () => {
    const result = spawnSync(process.execPath, [outfile, '--help'], {
      encoding: 'utf8',
    });
    expect(result.status).toBe(0);
    expect(result.stdout).toContain('usage: snote');
  });

  it("5: WHEN vendor/simplenote/utils/note-utils.ts is read THEN line 3 contains `const escapeRegExp = ` and `// OMARCHY:`, and the file does not contain `lodash/` or `from 'lodash'`", () => {
    const source = readFileSync('vendor/simplenote/utils/note-utils.ts', 'utf8');
    const line3 = source.split('\n')[2]; // OMARCHY: line 1 is now the GPLv2 change-notice header
    expect(line3).toContain('const escapeRegExp = ');
    expect(line3).toContain('// OMARCHY:');
    expect(source).not.toContain('lodash/');
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

  it("7: WHEN noteTitleAndPreview({ content: 'Title\\naxb one\\nlater a.b two', systemTags: [] } as never, 'a.b') is called THEN the preview is `later a.b two` (the dot is matched as a dot)", () => {
    const result = noteTitleAndPreview({ content: 'Title\naxb one\nlater a.b two', systemTags: [] } as never, 'a.b');
    expect(result.preview).toBe('later a.b two');
  });

  it("8: WHEN noteTitleAndPreview({ content: 'Title\\nfoo a] one\\nlater a\\\\b] two', systemTags: [] } as never, 'a\\\\b]') is called THEN nothing throws and the preview is `later a\\b] two` (the backslash and `]` are matched as text)", () => {
    let result: ReturnType<typeof noteTitleAndPreview> | undefined;
    expect(() => {
      result = noteTitleAndPreview({ content: 'Title\nfoo a] one\nlater a\\b] two', systemTags: [] } as never, 'a\\b]');
    }).not.toThrow();
    expect(result?.preview).toBe('later a\\b] two');
  });
});
