/**
 * #219 (security build rule R1): the `websocket` package is imported in src/core/websocket-provider.ts only,
 * node:child_process in update-check.ts, clipboard.ts and editor.ts only, and every process those files start
 * has a time limit and an output cap (the editor is interactive by design). The three rules live in
 * eslint.process-scope.mjs, built by the shared scopeBlocks with noInlineConfig.
 *
 * Threat model (2026-10-22): a tripwire against ACCIDENTAL regressions, not a sandbox. In scope
 * here: every import, re-export, require, dynamic import and alias form of both modules, every extension the
 * build accepts, src/ and vendor/, and an inline directive. Residual (named in eslint.process-scope.mjs):
 * eval, createRequire, process.binding, a module name built at run time, other ways to start a process.
 */
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { pathToFileURL } from 'node:url';
import tsParser from '@typescript-eslint/parser';
import { ESLint } from 'eslint';
import { describe, expect, it } from 'vitest';

type Exception = { path: string; reason: string; issue: number };
type Scope = {
  R1_PLUGIN_NAME: string;
  R1_PLUGIN: object;
  R1_RULES: Record<string, unknown[]>;
  R1_EXTENSIONS: string[];
  CHILD_PROCESS_ALLOWED: Exception[];
  WEBSOCKET_ALLOWED: Exception[];
  SPAWN_LIMITS_EXEMPT: Exception[];
};
const scope = (): Promise<Scope> => import(pathToFileURL(join(process.cwd(), 'eslint.process-scope.mjs')).href);

const RULE_IDS = ['snote-r1/child-process-import', 'snote-r1/websocket-import', 'snote-r1/spawn-limits'];
const EXTENSIONS = ['ts', 'tsx', 'js', 'jsx', 'mjs', 'cjs', 'mts', 'cts'];
const hits = (messages: { ruleId: string | null }[], id?: string): number =>
  messages.filter((m) => (id ? m.ruleId === id : RULE_IDS.includes(m.ruleId ?? ''))).length;

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

/** The relative files `file` imports (`from './x.mjs'`), and theirs, as repo-root paths. */
function relativeImports(file: string, seen = new Set<string>()): string[] {
  const text = readFileSync(join(process.cwd(), file), 'utf8');
  for (const m of text.matchAll(/from\s+'\.\/([^']+)'/g)) {
    const dep = m[1] as string;
    if (!seen.has(dep)) {
      seen.add(dep);
      relativeImports(dep, seen);
    }
  }
  return [...seen];
}

/** Plain JavaScript that is also valid TypeScript; `MOD` is the module name. */
const FORMS = [
  "import { spawn } from 'MOD';\nexport const f = () => spawn;\n",
  "import cp from 'MOD';\nexport default cp;\n",
  "import * as cp from 'MOD';\nexport const f = cp;\n",
  "import 'MOD';\n",
  "import { spawn as s } from 'MOD';\nexport const f = s;\n",
  "import { 'spawn' as s } from 'MOD';\nexport const f = s;\n",
  "export { spawn } from 'MOD';\n",
  "export * from 'MOD';\n",
  "export * as cp from 'MOD';\n",
  "const cp = require('MOD');\nexport const f = cp;\n",
  "const { execFileSync: e } = require('MOD');\nexport const f = e;\n",
  "export const f = async () => (await import('MOD')).spawn;\n",
  "export const f = () => import('MOD');\n",
];
/** TypeScript syntax: only for the TypeScript extensions. */
const TS_FORMS = [
  "import cp = require('MOD');\nexport const f = cp;\n",
  "import type { SpawnOptions } from 'MOD';\nexport type T = SpawnOptions;\n",
  "export type T = typeof import('MOD');\n",
];
const MODULES: [string, string][] = [
  ['node:child_process', 'snote-r1/child-process-import'],
  ['child_process', 'snote-r1/child-process-import'],
  ['websocket', 'snote-r1/websocket-import'],
  ['websocket/lib/W3CWebSocket', 'snote-r1/websocket-import'],
];
const CLEAN = [
  "import { readFileSync } from 'node:fs';\nexport const f = (p) => readFileSync(p);\n",
  "export const note = { websocket: 1 };\nexport const s = 'child_process';\n",
  "// require('websocket') and import('node:child_process') in a comment\nexport const x = 1;\n",
  "import { w } from './websocket-helper';\nexport const f = w;\n",
  "export const f = (o) => o.spawn('x', { timeout: 1 });\n",
];

describe('#219 R1: websocket and child_process are scoped, every spawn is limited', () => {
  it('1: WHEN `src` and `vendor` are linted with the repo config THEN no file has an error of `snote-r1/child-process-import`, `snote-r1/websocket-import` or `snote-r1/spawn-limits`, the effective config of every source file has noInlineConfig on and each rule on except for the pinned exceptions, and where `scripts/publish-export.sh` exists its INCLUDE list holds `eslint.process-scope.mjs`', async () => {
    const g = await scope();
    const eslint = new ESLint({ cwd: process.cwd() });
    const results = await eslint.lintFiles(['src', 'vendor']);
    const found = results.flatMap((r) =>
      r.messages.filter((m) => RULE_IDS.includes(m.ruleId ?? '')).map((m) => `${relative(process.cwd(), r.filePath)}:${m.line} ${m.ruleId}`),
    );
    expect(found).toEqual([]);
    expect(g.R1_EXTENSIONS).toEqual(EXTENSIONS);
    expect(g.CHILD_PROCESS_ALLOWED.map((e) => e.path).sort()).toEqual(['src/core/clipboard.ts', 'src/core/editor.ts', 'src/core/instance-lock.ts', 'src/core/release-verify.ts', 'src/core/update-check.ts']);
    expect(g.WEBSOCKET_ALLOWED.map((e) => e.path)).toEqual(['src/core/websocket-provider.ts']);
    expect(g.SPAWN_LIMITS_EXEMPT.map((e) => e.path)).toEqual(['src/core/editor.ts']);
    const off: Record<string, string[]> = {
      'snote-r1/child-process-import': g.CHILD_PROCESS_ALLOWED.map((e) => e.path),
      'snote-r1/websocket-import': g.WEBSOCKET_ALLOWED.map((e) => e.path),
      'snote-r1/spawn-limits': g.SPAWN_LIMITS_EXEMPT.map((e) => e.path),
    };
    const wrong: string[] = [];
    for (const file of sourceFiles()) {
      if (await eslint.isPathIgnored(file)) {
        wrong.push(`ignored ${file}`);
        continue;
      }
      const cfg = (await eslint.calculateConfigForFile(file)) as { rules: Record<string, unknown[]>; linterOptions?: { noInlineConfig?: boolean } };
      if (cfg.linterOptions?.noInlineConfig !== true) wrong.push(`inline config allowed in ${file}`);
      for (const id of RULE_IDS) {
        const severity = cfg.rules[id]?.[0];
        const want = off[id].includes(file) ? 0 : 2;
        if (severity !== want) wrong.push(`${file} ${id} is ${String(severity)}, want ${want}`);
      }
    }
    expect(wrong).toEqual([]);
    for (const ext of EXTENSIONS) {
      const cfg = (await eslint.calculateConfigForFile(`src/core/zz-sample.${ext}`)) as { rules: Record<string, unknown[]> };
      expect(RULE_IDS.map((id) => cfg.rules[id]?.[0]), ext).toEqual([2, 2, 2]);
    }
    // the public export copies a fixed INCLUDE list: the config and every file it imports must be in it
    if (existsSync(join(process.cwd(), 'scripts/publish-export.sh'))) {
      const dir = join(process.cwd(), 'scripts/export.d/include');
      const include = readdirSync(dir).map((f) => readFileSync(join(dir, f), 'utf8').split('\n')[0] ?? '');
      expect(relativeImports('eslint.config.mjs')).toContain('eslint.process-scope.mjs');
      for (const f of ['eslint.config.mjs', ...relativeImports('eslint.config.mjs')]) {
        expect(include, `${f} is in INCLUDE of scripts/publish-export.sh`).toContain(f);
      }
    }
  }, 60000);

  it("2: WHEN every import, re-export, `require` and dynamic import form of `websocket` and `node:child_process` (and `child_process`), among them `require('websocket')`, `await import('websocket')` and `import * as cp from 'node:child_process'`, is linted as a file under src/ and vendor/ in every extension THEN each has an error of its rule, and the clean lookalikes have none", async () => {
    const eslint = new ESLint({ cwd: process.cwd() });
    const scratch = async (code: string, file = 'src/core/x.ts'): Promise<{ ruleId: string | null; fatal?: boolean }[]> => {
      const [res] = await eslint.lintText(code, { filePath: join(process.cwd(), file) });
      return res.messages;
    };
    expect(hits(await scratch("const w = require('websocket');\nexport default w;\n"), 'snote-r1/websocket-import')).toBeGreaterThan(0);
    expect(hits(await scratch("export const f = async () => await import('websocket');\n"), 'snote-r1/websocket-import')).toBeGreaterThan(0);
    expect(hits(await scratch("import * as cp from 'node:child_process';\nexport default cp;\n"), 'snote-r1/child-process-import')).toBeGreaterThan(0);
    const missed: string[] = [];
    let forms = 0;
    for (const dir of ['src/core', 'vendor/simplenote/utils']) {
      for (const ext of EXTENSIONS) {
        const typed = ['ts', 'tsx', 'mts', 'cts'].includes(ext);
        for (const [mod, id] of MODULES) {
          for (const [i, form] of [...FORMS, ...(typed ? TS_FORMS : [])].entries()) {
            forms += 1;
            const messages = await scratch(form.split('MOD').join(mod), `${dir}/zz-form.${ext}`);
            // ESM syntax in a CommonJS .cjs file is a parse error: blocked loudly, as in the #194 matrix
            const blocked = hits(messages, id) > 0 || (ext === 'cjs' && messages.some((m) => m.fatal === true));
            if (!blocked) missed.push(`${dir}/${ext} ${mod} #${i}`);
          }
        }
        for (const [i, clean] of CLEAN.entries()) {
          expect(hits(await scratch(clean, `${dir}/zz-clean.${ext}`)), `${dir}/${ext} clean #${i}`).toBe(0);
        }
      }
    }
    expect(missed).toEqual([]);
    expect(forms).toBeGreaterThan(900);
  }, 120000);

  it('3: WHEN a spawn call has no `timeout`, or an execFile, exec or spawnSync call has no `maxBuffer`, or sets `timeout: 0`, `maxBuffer: Infinity` or `maxBuffer: 2097152` THEN `snote-r1/spawn-limits` reports it, and a call with a literal `timeout` and a `maxBuffer` of `1048576` has no error', async () => {
    const eslint = new ESLint({ cwd: process.cwd() });
    const lint = async (call: string): Promise<number> => {
      const [res] = await eslint.lintText(`export const f = () => ${call};\n`, { filePath: join(process.cwd(), 'src/core/zz-spawn.ts') });
      return hits(res.messages, 'snote-r1/spawn-limits');
    };
    const bad = [
      "execFile('git', [], cb)",
      "execFile('git', [], { timeout: 1 }, cb)",
      "execFile('git', [], { maxBuffer: 1048576 }, cb)",
      "execFileSync('git', [], { timeout: 1 })",
      "execSync('git', { maxBuffer: 1048576 })",
      "exec('git', { timeout: 1 }, cb)",
      "spawnSync('git', [], { input: 'x' })",
      "spawnSync('git', [], { timeout: 1 })",
      "spawn('git', [], { stdio: 'inherit' })",
      "spawn('git')",
      "fork('child.js')",
      "cp.execFile('git', [], { timeout: 1 }, cb)",
      "cp.spawn('git', [], {})",
      "cp.exec('git', { timeout: 1 }, cb)",
      "execFile('git', [], { ...opts }, cb)",
      "spawnSync('git', [], { timeout: 0, maxBuffer: 1048576 })",
      "spawnSync('git', [], { timeout: 1, maxBuffer: Infinity })",
      "spawnSync('git', [], { timeout: 1, maxBuffer: 2097152 })",
    ];
    const good = [
      "execFile('git', [], { timeout: 1000, maxBuffer: 1048576 }, cb)",
      "execFileSync('git', [], { timeout, maxBuffer: 65536 })",
      "spawnSync('git', [], { timeout: T, maxBuffer: 1048576, input: 'x' })",
      "spawn('git', [], { timeout: 1000 })",
      "cp.execFile('git', [], { timeout: 1, maxBuffer: 1 }, cb)",
      "/a/.exec('abc')",
      "o.exec('abc')",
    ];
    const missed: string[] = [];
    for (const c of bad) if ((await lint(c)) === 0) missed.push(c);
    expect(missed).toEqual([]);
    const flagged: string[] = [];
    for (const c of good) if ((await lint(c)) > 0) flagged.push(c);
    expect(flagged).toEqual([]);
  }, 60000);

  it('4: WHEN an `eslint-disable-next-line`, `eslint-disable-line`, `eslint-disable` or `eslint snote-r1/websocket-import: off` directive sits by a websocket import in a file under src/ THEN the import is still reported', async () => {
    const eslint = new ESLint({ cwd: process.cwd() });
    const forms = [
      "// eslint-disable-next-line snote-r1/websocket-import\nimport { w3cwebsocket } from 'websocket';\nexport const w = w3cwebsocket;\n",
      "import { w3cwebsocket } from 'websocket'; // eslint-disable-line snote-r1/websocket-import\nexport const w = w3cwebsocket;\n",
      "/* eslint-disable */\nimport { w3cwebsocket } from 'websocket';\nexport const w = w3cwebsocket;\n",
      "/* eslint snote-r1/websocket-import: off */\nimport { w3cwebsocket } from 'websocket';\nexport const w = w3cwebsocket;\n",
    ];
    for (const [i, code] of forms.entries()) {
      const [res] = await eslint.lintText(code, { filePath: join(process.cwd(), 'src/core/zz-directive.ts') });
      expect(hits(res.messages, 'snote-r1/websocket-import'), `directive form ${i}`).toBeGreaterThan(0);
    }
  }, 30000);

  it('5: WHEN `src/core/editor.ts` spawns the user\'s editor THEN it is allowed without a timeout: `snote-r1/spawn-limits` is off for that one file, its exception says `interactive by design`, the config comment names `test/structure/network-process-lint.test.ts`, and every exception still needs its rule', async () => {
    const g = await scope();
    const eslint = new ESLint({ cwd: process.cwd() });
    const cfg = async (file: string): Promise<Record<string, unknown[]>> =>
      ((await eslint.calculateConfigForFile(file)) as { rules: Record<string, unknown[]> }).rules;
    expect((await cfg('src/core/editor.ts'))['snote-r1/spawn-limits']?.[0]).toBe(0);
    expect((await cfg('src/core/clipboard.ts'))['snote-r1/spawn-limits']?.[0]).toBe(2);
    expect((await cfg('src/core/update-check.ts'))['snote-r1/spawn-limits']?.[0]).toBe(2);
    expect((await cfg('src/core/websocket-provider.ts'))['snote-r1/websocket-import']?.[0]).toBe(0);
    expect(g.SPAWN_LIMITS_EXEMPT[0]?.reason).toContain('interactive by design');
    const text = readFileSync(join(process.cwd(), 'eslint.process-scope.mjs'), 'utf8');
    expect(text).toContain('Interactive by design');
    expect(text).toContain('test/structure/network-process-lint.test.ts');
    const groups: [string, Exception[]][] = [
      ['child-process-import', g.CHILD_PROCESS_ALLOWED],
      ['websocket-import', g.WEBSOCKET_ALLOWED],
      ['spawn-limits', g.SPAWN_LIMITS_EXEMPT],
    ];
    for (const [rule, list] of groups) {
      for (const e of list) {
        expect(e.reason.length, e.path).toBeGreaterThan(0);
        expect(Number.isInteger(e.issue), e.path).toBe(true);
        expect(existsSync(join(process.cwd(), e.path)), `${e.path} exists`).toBe(true);
        // stale check: with the exception removed, the file still triggers the rule it turns off
        const strict = new ESLint({
          cwd: process.cwd(),
          overrideConfigFile: true,
          overrideConfig: [
            {
              files: ['**/*.{ts,tsx}'],
              languageOptions: { parser: tsParser, parserOptions: { ecmaFeatures: { jsx: true } } },
              plugins: { [g.R1_PLUGIN_NAME]: g.R1_PLUGIN as never },
              rules: { [`${g.R1_PLUGIN_NAME}/${rule}`]: ['error', ...(g.R1_RULES[rule] as [])] } as never,
            },
          ],
        });
        const [r] = await strict.lintFiles([e.path]);
        expect(hits(r.messages, `snote-r1/${rule}`), `${e.path} ${rule}`).toBeGreaterThan(0);
      }
    }
  }, 60000);
});
