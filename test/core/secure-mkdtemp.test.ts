/**
 * #194: the one mkdtemp in src/ lives in secure-fs.ts (the lint ban lists
 * mkdtemp and mkdtempSync). It refuses a symlinked PARENT folder, where a new
 * folder would otherwise be created under the link's target.
 */
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { describe, it, expect } from 'vitest';

import { secureMkdtemp } from '../../src/core/secure-fs';

describe('#194 secureMkdtemp', () => {
  it('1: WHEN the parent folder is a symlink THEN secureMkdtemp throws and the link target gets no new folder, and WHEN the parent is a real folder THEN it returns a new folder under it with mode `0700`', () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'snote-mkdtemp-'));
    try {
      const target = path.join(root, 'target');
      fs.mkdirSync(target);
      const link = path.join(root, 'link');
      fs.symlinkSync(target, link);
      expect(() => secureMkdtemp(path.join(link, 'snote-'))).toThrow(/symlink/);
      expect(fs.readdirSync(target)).toEqual([]);
      const real = path.join(root, 'real');
      fs.mkdirSync(real);
      const made = secureMkdtemp(path.join(real, 'snote-'));
      expect(path.dirname(made)).toBe(real);
      expect(path.basename(made).startsWith('snote-')).toBe(true);
      expect(fs.statSync(made).mode & 0o777).toBe(0o700);
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });
});
