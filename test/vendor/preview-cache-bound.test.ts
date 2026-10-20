/**
 * T535: the list preview cache keeps an entry only while its note is alive,
 * and a note whose text or markdown tag changed shows its newest title.
 */
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { setFlagsFromString } from 'node:v8';
import { runInNewContext } from 'node:vm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import type * as T from '@vendor/types';
import noteTitleAndPreview from '@vendor/utils/note-utils';

import { bundle } from '../../scripts/build.mjs';
import { BUNDLE_CAP, bundleSize } from '../helpers/bundle-size';

setFlagsFromString('--expose-gc');
const gc = runInNewContext('gc') as () => void;

const mk = (content: string, systemTags: string[] = []): T.Note =>
  ({
    content,
    systemTags,
    tags: [],
    deleted: false,
    creationDate: 0,
    modificationDate: 0,
  }) as unknown as T.Note;

const dirs: string[] = [];

describe('T535 preview cache is bounded', () => {
  it('1: WHEN 10,000 new note objects, each a 10 KB text `Shared v<n>\\n` plus 1,500 repeats of `shared `, pass through noteTitleAndPreview and are dropped THEN the last title is `Shared v9999` and heapUsed after a forced gc grew by less than `10` MB', () => {
    const body = 'shared '.repeat(1500);
    gc();
    const before = process.memoryUsage().heapUsed;
    let last = '';
    for (let n = 0; n < 10000; n++) {
      last = noteTitleAndPreview(mk(`Shared v${n}\n${body}`)).title;
    }
    gc();
    const grewMb = (process.memoryUsage().heapUsed - before) / 1048576;
    expect(last).toBe('Shared v9999');
    expect(grewMb).toBeLessThan(10);
  });

  it('2: WHEN one note object content is `Old title\\nbody` and is then set to `New title\\nbody` on the same object THEN noteTitleAndPreview returns title `Old title`, then `New title`', () => {
    const note = mk('Old title\nbody');
    expect(noteTitleAndPreview(note).title).toBe('Old title');
    (note as { content: string }).content = 'New title\nbody';
    expect(noteTitleAndPreview(note).title).toBe('New title');
  });

  it('3: WHEN noteTitleAndPreview is called twice on each of 10,000 unchanged note objects, every third with system tag `markdown` THEN for all `10000` the second call returns the same object as the first', () => {
    let same = 0;
    for (let n = 0; n < 10000; n++) {
      const note = mk(`# Note ${n}\nbody ${n}`, n % 3 === 0 ? ['markdown'] : []);
      const first = noteTitleAndPreview(note);
      const second = noteTitleAndPreview(note);
      expect(second).toBe(first);
      same++;
    }
    expect(same).toBe(10000);
  });

  describe('bundle', () => {
    let text = '';
    let size = 0;
    beforeAll(async () => {
      const dir = mkdtempSync(join(tmpdir(), 'preview-cache-'));
      dirs.push(dir);
      const outfile = join(dir, 'cli.js');
      await bundle({ entry: 'src/cli/index.ts', outfile });
      text = readFileSync(outfile, 'utf8');
      size = bundleSize(text);
    }, 20000);
    afterAll(() => {
      for (const dir of dirs) rmSync(dir, { recursive: true, force: true });
    });

    it('4: WHEN the bundle is built into a temp outfile with `bundle` from scripts/build.mjs THEN the line containing `var previewCache` contains `WeakMap`, the file does not contain `previewCache.set(note.content`, and its `bundleSize` is below `BUNDLE_CAP`', () => {
      const line = text.split('\n').find((l) => l.includes('var previewCache')) ?? '';
      expect(line).toContain('WeakMap');
      expect(text).not.toContain('previewCache.set(note.content');
      expect(size).toBeLessThan(BUNDLE_CAP);
    });
  });

  it('5: WHEN one note object `# Heading\\nbody` is read, then its systemTags become `markdown` on the same object THEN the titles are `# Heading`, then `Heading`', () => {
    const note = mk('# Heading\nbody');
    expect(noteTitleAndPreview(note).title).toBe('# Heading');
    (note as { systemTags: string[] }).systemTags = ['markdown'];
    expect(noteTitleAndPreview(note).title).toBe('Heading');
  });
});
