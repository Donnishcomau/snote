/**
 * #220 (R2, follow-up to #194): the fs write ban also holds every delete. unlink, rm and rmdir
 * (sync and promise forms) live in src/core/secure-fs.ts only; every other file calls secureUnlink,
 * secureRmdir or secureRemoveTree. A symlink is removed as a link and its target is never touched.
 */
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { ESLint } from 'eslint';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { secureRemoveTree, secureRmdir, secureUnlink } from '../../src/core/secure-fs';

const isGuardRule = (m: { ruleId: string | null }): boolean =>
  m.ruleId === 'no-restricted-syntax' || m.ruleId === 'no-restricted-imports';

const DELETE_FORMS = [
  "import { unlinkSync } from 'node:fs';\nexport const f = (p: string) => unlinkSync(p);\n",
  "import { rmSync as r } from 'node:fs';\nexport const f = (p: string) => r(p, { force: true });\n",
  "import { rmdirSync } from 'node:fs';\nexport const f = (p: string) => rmdirSync(p);\n",
  "import * as fs from 'node:fs';\nexport const f = (p: string) => fs.unlinkSync(p);\n",
  "import * as fs from 'node:fs';\nexport const f = (p: string) => fs.rmSync(p, { recursive: true });\n",
  "import * as fs from 'node:fs';\nexport const f = (p: string) => fs.rmdirSync(p);\n",
  "import * as fs from 'node:fs';\nexport const f = (p: string) => fs['unlinkSync'](p);\n",
  "import * as fs from 'node:fs';\nconst { rmSync: r } = fs;\nexport const f = (p: string) => r(p);\n",
  "import * as fs from 'node:fs';\nexport const f = (p: string) => fs.promises.unlink(p);\n",
  "import { unlink } from 'node:fs/promises';\nexport const f = (p: string) => unlink(p);\n",
  "import { rm } from 'node:fs/promises';\nexport const f = (p: string) => rm(p, { recursive: true });\n",
  "import { rmdir } from 'node:fs';\nexport const f = (p: string) => rmdir(p, () => {});\n",
  "import * as fs from 'node:fs';\nexport const f = (p: string) => fs.unlink(p, () => {});\n",
  "import * as fs from 'node:fs';\nexport const f = (p: string) => fs.rm(p, () => {});\n",
  "export const f = async (p: string) => (await import('node:fs')).rmSync(p);\n",
  "import * as fs from 'node:fs';\nexport const f = (a: string, b: string) => fs.renameSync(a, b);\n",
  "import { writeFile } from 'node:fs/promises';\nexport const f = (p: string) => writeFile(p, 'x');\n",
];
const CLEAN_FORMS = [
  "import { secureUnlink } from './secure-fs';\nexport const f = (p: string) => secureUnlink(p);\n",
  "import { secureRemoveTree, secureRmdir } from './secure-fs';\nexport const f = (p: string) => { secureRemoveTree(p); secureRmdir(p); };\n",
  "import { readFileSync } from 'node:fs';\nexport const f = (p: string) => readFileSync(p, 'utf8');\n",
  "export const f = (m: Map<string, number>) => m.delete('rm');\n",
];

describe('#220 fs delete ban', () => {
  let root: string;
  let victim: string;
  beforeEach(() => {
    root = fs.mkdtempSync(path.join(os.tmpdir(), 'snote-delete-'));
    victim = path.join(root, 'victim.txt');
    fs.writeFileSync(victim, 'victim-original');
    fs.chmodSync(victim, 0o644);
  });
  afterEach(() => {
    fs.rmSync(root, { recursive: true, force: true });
  });
  const victimIntact = (): boolean =>
    fs.readFileSync(victim, 'utf8') === 'victim-original' && (fs.statSync(victim).mode & 0o777) === 0o644;

  it('1: WHEN each raw delete form (unlink, rm and rmdir; sync, promise, aliased, computed, destructured and dynamic) and each raw write form is linted at a src/core path THEN each reports a guard error, and `secureUnlink`, `secureRemoveTree`, `secureRmdir`, `readFileSync` and a Map `delete` report none', async () => {
    const eslint = new ESLint({ cwd: process.cwd() });
    expect(DELETE_FORMS).toHaveLength(17);
    expect(CLEAN_FORMS).toHaveLength(4);
    const wrong: string[] = [];
    for (const [i, code] of DELETE_FORMS.entries()) {
      const [res] = await eslint.lintText(code, { filePath: path.join(process.cwd(), 'src/core', `zz-delete-${i}.ts`) });
      if (!res.messages.some(isGuardRule)) wrong.push(`bad ${i}`);
    }
    for (const [i, code] of CLEAN_FORMS.entries()) {
      const [res] = await eslint.lintText(code, { filePath: path.join(process.cwd(), 'src/core', `zz-clean-${i}.ts`) });
      if (res.messages.some(isGuardRule)) wrong.push(`clean ${i}`);
    }
    expect(wrong).toEqual([]);
  }, 60000);

  it('2: WHEN src and vendor are linted with the repo config THEN no file reports a guard error and the effective rule for src/core/token.ts names `unlinkSync`, `rmSync` and `rmdirSync`', async () => {
    const eslint = new ESLint({ cwd: process.cwd() });
    const results = await eslint.lintFiles(['src', 'vendor']);
    expect(results.filter((r) => r.messages.some(isGuardRule)).map((r) => r.filePath)).toEqual([]);
    const cfg = (await eslint.calculateConfigForFile('src/core/token.ts')) as { rules?: Record<string, unknown[]> };
    const rule = JSON.stringify(cfg.rules?.['no-restricted-syntax'] ?? null);
    for (const name of ['unlinkSync', 'rmSync', 'rmdirSync']) expect(rule).toContain(name);
  }, 60000);

  it('3: WHEN a symlink to a file sits at the path THEN secureUnlink removes the link and the victim file is byte-identical and mode-identical, and a missing path throws ENOENT', () => {
    const link = path.join(root, 'link.json');
    fs.symlinkSync(victim, link);
    secureUnlink(link);
    expect(fs.lstatSync(link, { throwIfNoEntry: false })).toBeUndefined();
    expect(victimIntact()).toBe(true);
    expect(() => secureUnlink(path.join(root, 'missing.json'))).toThrow(/ENOENT/);
  });

  it('4: WHEN a tree holds a symlink to a folder THEN secureRemoveTree removes the tree and the link and the linked folder keeps its file, and a missing path does not throw', () => {
    const outside = path.join(root, 'outside');
    fs.mkdirSync(outside);
    fs.writeFileSync(path.join(outside, 'keep.txt'), 'keep');
    const tree = path.join(root, 'tree');
    fs.mkdirSync(path.join(tree, 'sub'), { recursive: true });
    fs.writeFileSync(path.join(tree, 'sub', 'a.txt'), 'a');
    fs.symlinkSync(outside, path.join(tree, 'sub', 'to-outside'));
    secureRemoveTree(tree);
    expect(fs.existsSync(tree)).toBe(false);
    expect(fs.readFileSync(path.join(outside, 'keep.txt'), 'utf8')).toBe('keep');
    expect(() => secureRemoveTree(path.join(root, 'missing'))).not.toThrow();
  });

  it('5: WHEN secureRmdir gets an empty folder THEN it is removed, and a symlink to a folder or a folder with a file makes it throw and nothing is removed', () => {
    const empty = path.join(root, 'empty');
    fs.mkdirSync(empty);
    secureRmdir(empty);
    expect(fs.existsSync(empty)).toBe(false);
    const target = path.join(root, 'target');
    fs.mkdirSync(target);
    fs.writeFileSync(path.join(target, 'f.txt'), 'f');
    const link = path.join(root, 'folder-link');
    fs.symlinkSync(target, link);
    expect(() => secureRmdir(link)).toThrow();
    expect(() => secureRmdir(target)).toThrow();
    expect(fs.lstatSync(link).isSymbolicLink()).toBe(true);
    expect(fs.readFileSync(path.join(target, 'f.txt'), 'utf8')).toBe('f');
  });
});
