/**
 * #194: the one rename in src/ lives in secure-fs.ts (the lint ban lists
 * renameSync). It replaces what sits at the target and never writes through a link there.
 */
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { describe, it, expect } from 'vitest';

import { secureRename } from '../../src/core/secure-fs';

describe('#194 secureRename', () => {
  it('1: WHEN a symlink to a file sits at the target THEN secureRename replaces the link with the moved file and the link target keeps its text, and a missing source throws `ENOENT`', () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'snote-rename-'));
    try {
      const victim = path.join(root, 'victim.txt');
      fs.writeFileSync(victim, 'victim-original');
      const target = path.join(root, 'target.txt');
      fs.symlinkSync(victim, target);
      const from = path.join(root, 'from.txt');
      fs.writeFileSync(from, 'moved');
      secureRename(from, target);
      expect(fs.readFileSync(victim, 'utf8')).toBe('victim-original');
      expect(fs.lstatSync(target).isFile()).toBe(true);
      expect(fs.readFileSync(target, 'utf8')).toBe('moved');
      expect(fs.existsSync(from)).toBe(false);
      let code: string | undefined;
      try {
        secureRename(path.join(root, 'nope.txt'), path.join(root, 'x.txt'));
      } catch (e) {
        code = (e as NodeJS.ErrnoException).code;
      }
      expect(code).toBe('ENOENT');
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });
});
