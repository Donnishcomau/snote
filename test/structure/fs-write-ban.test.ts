/**
 * #194: every raw filesystem write, rename, mkdir, chmod and
 * write-mode open in src/ and vendor/ lives in src/core/secure-fs.ts. The rule is
 * a pure ban (eslint.fs-write.mjs, built by the shared scopeBlocks with
 * noInlineConfig): one allowed file, no per-file or per-call exception list.
 *
 * Threat model (2026-10-22): a tripwire against ACCIDENTAL
 * regressions, not a sandbox. In scope here: every import, require, dynamic
 * import, re-export, string-literal import name and alias form; the write family;
 * every extension the build accepts; src/ and vendor/; and a later config block
 * that switches the rule off (the effective config is read per file).
 * Residual, NOT tested and named in eslint.fs-write.mjs: new Function, eval,
 * process.binding, process.getBuiltinModule, createRequire used to dodge the
 * guard, Reflect.get on globalThis, and calls that are not on the list (utimes).
 */
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { pathToFileURL } from 'node:url';
import { ESLint } from 'eslint';
import { describe, expect, it } from 'vitest';

type Case = { name: string; file?: string; appendTo?: string; code: string; expect: 'error' | 'clean' };
const cases = JSON.parse(readFileSync(join(process.cwd(), 'test/fixtures/fs-write-ban-cases.json'), 'utf8')) as Case[];

type Guard = {
  FS_WRITE_ALLOWED_FILE: string;
  FS_WRITE_EXTENSIONS: string[];
  fsWriteBlocks: { name?: string; ignores?: string[]; linterOptions?: { noInlineConfig?: boolean } }[];
  [key: string]: unknown;
};
const guard = (): Promise<Guard> => import(pathToFileURL(join(process.cwd(), 'eslint.fs-write.mjs')).href);

const isGuardRule = (m: { ruleId: string | null }): boolean =>
  m.ruleId === 'no-restricted-syntax' || m.ruleId === 'no-restricted-imports';

const EXTENSIONS = ['ts', 'tsx', 'js', 'jsx', 'mjs', 'cjs', 'mts', 'cts'];
const SCOPES = ['src/core', 'src/tui', 'src/cli', 'vendor/simplenote/utils'];

/** Plain JavaScript that is also valid TypeScript, so one snippet can be linted under every extension. */
const MATRIX = [
  "import * as fs from 'node:fs';\nexport const f = (p) => fs.writeFileSync(p, 'x');\n",
  "import { writeFileSync as w } from 'node:fs';\nexport const f = (p) => w(p, 'x');\n",
  "import { 'writeFileSync' as w } from 'node:fs';\nexport const f = (p) => w(p, 'x');\n",
  "export { writeFileSync as put } from 'node:fs';\n",
  "export * from 'node:fs';\n",
  "export * as nfs from 'node:fs';\n",
  "const fs = require('node:fs');\nexport const f = (p) => fs.writeFileSync(p, 'x');\n",
  "export const f = async (p) => { const { writeFileSync: w } = await import('node:fs'); w(p, 'x'); };\n",
  "import * as fs from 'node:fs';\nexport const f = (a, b) => fs.renameSync(a, b);\n",
  "import * as fs from 'node:fs';\nexport const f = (fd) => fs.writevSync(fd, []);\n",
  "import { link } from 'node:fs/promises';\nexport const f = (a, b) => link(a, b);\n",
  "import * as fs from 'node:fs';\nexport const f = (p) => fs.symlinkSync(p, p);\n",
  "import * as fs from 'node:fs';\nexport const f = (p) => fs.mkdirSync(p);\n",
  "const { writeFileSync: w } = require('node:fs');\nexport const f = (p) => w(p, 'x');\n",
];
/** TypeScript syntax: only for the TypeScript extensions. */
const TS_ONLY = "import * as fs from 'node:fs';\nexport const f = (p: string): void => { fs.writeFileSync(p, 'x'); };\n";
/** Every source file of the build under src/ and vendor/ (declaration files are not built). */
function sourceFiles(): string[] {
  const out: string[] = [];
  const walk = (dir: string): void => {
    for (const name of readdirSync(dir)) {
      const p = join(dir, name);
      if (statSync(p).isDirectory()) walk(p);
      else if (/\.(ts|tsx|js|jsx|mjs|cjs|mts|cts)$/.test(name) && !name.endsWith('.d.ts')) {
        out.push(relative(process.cwd(), p).split('\\').join('/'));
      }
    }
  };
  walk(join(process.cwd(), 'src'));
  walk(join(process.cwd(), 'vendor'));
  return out;
}

const CLEAN = "import { readFileSync, readdirSync, statSync } from 'node:fs';\nexport const f = (p) => readFileSync(p);\n";

describe('#194 fs write ban', () => {
  it('1: WHEN src/ and vendor/ are linted with the repo config THEN no file except src/core/secure-fs.ts has a guarded fs write, rename, mkdir, chmod, write-mode open, alias, require or dynamic import, the ban allows exactly `src/core/secure-fs.ts` with no exception list and noInlineConfig on, and the effective config of a sample file under every scope and extension, and of EVERY real file, is not ignored and has the rule on', async () => {
    const g = await guard();
    const eslint = new ESLint({ cwd: process.cwd() });
    const results = await eslint.lintFiles(['src', 'vendor']);
    expect(results.filter((r) => r.messages.some(isGuardRule)).map((r) => r.filePath)).toEqual([]);
    expect(g.FS_WRITE_ALLOWED_FILE).toBe('src/core/secure-fs.ts');
    expect(Object.keys(g).filter((k) => /exception/i.test(k))).toEqual([]);
    const ban = g.fsWriteBlocks.filter((b) => b.name === 'fs-write-ban');
    expect(ban).toHaveLength(1);
    expect(ban[0].ignores).toEqual(['src/core/secure-fs.ts']);
    expect(ban[0].linterOptions?.noInlineConfig).toBe(true);
    expect(g.FS_WRITE_EXTENSIONS).toEqual(EXTENSIONS);
    const off: string[] = [];
    for (const scope of SCOPES) {
      for (const ext of EXTENSIONS) {
        const file = `${scope}/zz-sample.${ext}`;
        const cfg = (await eslint.calculateConfigForFile(file)) as { rules?: Record<string, unknown[]> } | undefined;
        const rule = cfg?.rules?.['no-restricted-syntax'];
        const text = JSON.stringify(rule ?? null);
        if (!(Array.isArray(rule) && rule[0] === 2 && text.includes('ExportAllDeclaration') && text.includes('renameSync'))) off.push(file);
      }
    }
    expect(off).toEqual([]);
    // every real file (not a sample): not ignored by a later block, and the rule on with the rename call listed
    const files = sourceFiles().filter((f) => f !== 'src/core/secure-fs.ts');
    expect(files.length).toBeGreaterThan(100);
    const offReal: string[] = [];
    for (const file of files) {
      if (await eslint.isPathIgnored(file)) {
        offReal.push(`ignored ${file}`);
        continue;
      }
      const cfg = (await eslint.calculateConfigForFile(file)) as { rules?: Record<string, unknown[]> } | undefined;
      const rule = cfg?.rules?.['no-restricted-syntax'];
      if (!(Array.isArray(rule) && rule[0] === 2 && JSON.stringify(rule).includes('renameSync'))) offReal.push(file);
    }
    expect(offReal).toEqual([]);
    const merged = (await eslint.calculateConfigForFile('src/core/x.ts')) as { rules: Record<string, unknown[]> };
    expect(JSON.stringify(merged.rules['no-restricted-globals'])).toContain('fetch');
    expect(JSON.stringify(merged.rules['no-restricted-imports'])).toContain('undici');
    const helper = (await eslint.calculateConfigForFile('src/core/secure-fs.ts')) as { rules: Record<string, unknown[]> };
    expect(JSON.stringify(helper.rules['no-restricted-syntax'] ?? null)).not.toContain('ImportSpecifier');
  }, 60000);

  it('2: WHEN each of the `24` bypass forms, `7` mkdir, chmod and open forms, `4` inline-directive forms, `45` import, re-export, alias, WriteStream, mkdtemp and write-family forms of the auditor and `12` raw writes appended to instance-lock.ts, export-note.ts, account-id.ts and editor-drafts.ts is linted at its path THEN each reports a guard error, and secureWriteFileSync(p, d), a comment and a readFileSync report none', async () => {
    const eslint = new ESLint({ cwd: process.cwd() });
    const bad = cases.filter((c) => c.expect === 'error');
    const good = cases.filter((c) => c.expect === 'clean');
    expect(bad.filter((c) => c.appendTo === undefined)).toHaveLength(80);
    expect(bad.filter((c) => c.appendTo !== undefined)).toHaveLength(12);
    expect(good).toHaveLength(3);
    const wrong: string[] = [];
    for (const c of [...bad, ...good]) {
      let filePath: string;
      let text = c.code;
      if (c.appendTo !== undefined) {
        filePath = join(process.cwd(), c.appendTo);
        text = `${readFileSync(filePath, 'utf8')}\n${c.code}`;
      } else {
        filePath = join(process.cwd(), 'src/core', `zz-fixture-${c.file}`);
      }
      const [res] = await eslint.lintText(text, { filePath });
      if (res.messages.some(isGuardRule) !== (c.expect === 'error')) wrong.push(c.name);
    }
    expect(wrong).toEqual([]);
    for (const f of ['instance-lock', 'export-note', 'account-id', 'editor-drafts']) {
      const path = join(process.cwd(), `src/core/${f}.ts`);
      const [clean] = await eslint.lintText(readFileSync(path, 'utf8'), { filePath: path });
      expect(clean.messages.filter(isGuardRule), f).toEqual([]);
    }
  }, 60000);

  it('3: WHEN each of `14` forms (named, renamed and string-literal imports, re-exports, require, a destructured require, dynamic import, rename, writev, link, symlink, mkdir), and a form with TypeScript types for the TypeScript extensions, is linted under src/ and vendor/ with every extension ts, tsx, js, jsx, mjs, cjs, mts and cts THEN each is blocked (a guard error, or a parse error for ESM syntax in a .cjs file), and a readFileSync import reports nothing', async () => {
    const eslint = new ESLint({ cwd: process.cwd() });
    expect(MATRIX).toHaveLength(14);
    const unblocked: string[] = [];
    const falsePositive: string[] = [];
    for (const dir of ['src/core', 'vendor/simplenote/utils']) {
      for (const ext of EXTENSIONS) {
        const filePath = join(process.cwd(), dir, `zz-matrix.${ext}`);
        const forms = ['ts', 'tsx', 'mts', 'cts'].includes(ext) ? [...MATRIX, TS_ONLY] : MATRIX;
        for (const [i, code] of forms.entries()) {
          const [res] = await eslint.lintText(code, { filePath });
          // ESM syntax in a CommonJS .cjs file is a parse error: blocked loudly. Nowhere else may a parse error pass.
          const blocked = res.messages.some((m) => isGuardRule(m) || (m.fatal === true && ext === 'cjs'));
          if (!blocked) unblocked.push(`${dir}/${ext}#${i}`);
        }
        const [clean] = await eslint.lintText(CLEAN, { filePath });
        if (clean.messages.some(isGuardRule)) falsePositive.push(`${dir}/${ext}`);
      }
    }
    expect(unblocked).toEqual([]);
    expect(falsePositive).toEqual([]);
    // a CommonJS file: require is blocked, not just ESM syntax
    const [cjs] = await eslint.lintText("const fs = require('node:fs');\nmodule.exports = (p) => fs.writeFileSync(p, 'x');\n", {
      filePath: join(process.cwd(), 'src/core/zz-matrix-cjs.cjs'),
    });
    expect(cjs.messages.some(isGuardRule)).toBe(true);
  }, 120000);
});
