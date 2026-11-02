/**
 * #221 (security build rule R4): every byte snote puts on the terminal passes the output guard
 * (src/core/output-guard.ts) or is a constant. Outside that file, `console.*`, `process.stdout.write` and
 * `process.stderr.write` are ESLint errors (three rules in eslint.terminal-sink.mjs, built by the shared
 * scopeBlocks with noInlineConfig), except the listed files, each with the reason its writes are safe and the
 * test that proves it.
 *
 * Threat model (2026-10-22): a tripwire against ACCIDENTAL regressions, not a sandbox. In scope
 * here: console as a call, a reference and an alias; write, end, writev and the underscore forms on both streams
 * by dot, string key, process, node:process, globalThis.process or a TypeScript cast; an alias or destructuring
 * of either stream; pipe; the fd; node:console; every extension the build accepts; src/ and vendor/; an inline
 * directive. Residual (named in eslint.terminal-sink.mjs): eval, createRequire, process.binding, a stream
 * handed to a library, `stdio: 'inherit'`, writes made by a child process.
 */
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { pathToFileURL } from 'node:url';
import tsParser from '@typescript-eslint/parser';
import { ESLint } from 'eslint';
import { describe, expect, it } from 'vitest';

type Exception = { path: string; rules: string[]; reason: string; issue: number };
type Scope = {
  R4_PLUGIN_NAME: string;
  R4_PLUGIN: object;
  R4_RULES: Record<string, unknown[]>;
  R4_EXTENSIONS: string[];
  OUTPUT_GUARD_FILE: string;
  TERMINAL_EXCEPTIONS: Exception[];
};
const scope = (): Promise<Scope> => import(pathToFileURL(join(process.cwd(), 'eslint.terminal-sink.mjs')).href);

const RULE_IDS = ['snote-r4/console', 'snote-r4/stdout-write', 'snote-r4/stderr-write'];
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

/** Plain JavaScript that is also valid TypeScript; `S` is stdout or stderr. */
const STREAM_FORMS = [
  "process.S.write('x');\n",
  "process?.S?.write('x');\n",
  "process.S['write']('x');\n",
  "process['S'].write('x');\n",
  "const w = process.S.write.bind(process.S);\nw('x');\n",
  "const o = process.S;\no.write('x');\n",
  "let o;\no = process.S;\no.write('x');\n",
  "const { write } = process.S;\nwrite('x');\n",
  "const { S } = process;\nS.write('x');\n",
  "let o;\n({ S: o } = process);\no.write('x');\n",
  "import { S } from 'node:process';\nS.write('x');\n",
  "import { S as o } from 'process';\no.write('x');\n",
  "import { 'S' as o } from 'process';\no.write('x');\n",
  "import p from 'node:process';\np.S.write('x');\n",
  "import * as p from 'node:process';\np.S.write('x');\n",
  "globalThis.process.S.write('x');\n",
  "process.S.end('x');\n",
  "process.S._write('x', 'utf8', () => {});\n",
  "process.S.writev([]);\n",
  "x.pipe(process.S);\n",
  "const fd = process.S.fd;\n",
  "process.S[k]('x');\n",
];
const STREAM_TS_FORMS = [
  "(process.S as any).write('x');\n",
  "process.S!.write('x');\n",
  "const o = process.S as NodeJS.WriteStream;\no.write('x');\n",
  "(process.S satisfies NodeJS.WriteStream).write('x');\n",
];
const CONSOLE_FORMS = [
  "console.log('x');\n",
  "console.error(x);\n",
  "console.warn(x);\n",
  "console['log']('x');\n",
  "const c = console;\nc.log('x');\n",
  "const { log } = console;\nlog('x');\n",
  "const f = console.log;\nf('x');\n",
  "const rawLog = io?.log ?? console.log;\n",
  "g(console);\n",
  "globalThis.console.log('x');\n",
  "global.console.log('x');\n",
  "window.console.log('x');\n",
  "globalThis['console'].log('x');\n",
  "[console].forEach((c) => c.log('x'));\n",
  "import { Console } from 'node:console';\nnew Console(process);\n",
  "import c from 'console';\nc.log('x');\n",
  "export * from 'node:console';\n",
  "export { Console } from 'console';\n",
  "export const f = () => import('node:console');\n",
  "const c = require('console');\nc.log('x');\n",
];
const CLEAN = [
  "guardOutputStream(process.stdout);\nguardOutputStream(process.stderr);\n",
  "export const w = process.stdout.columns ?? 80;\nexport const h = process.stdout.rows ?? 24;\nexport const t = process.stdout.isTTY;\n",
  "process.stderr.on('error', h);\nprocess.stdout.on('resize', h);\n",
  "render(el, { stdout: process.stdout });\n",
  "const { stdout } = useStdout();\nstdout.on('resize', r);\nstdout.write('x');\n",
  "child.stdout.on('data', d);\nchild.stderr.on('data', d);\n",
  "child.stdout.pipe(sink);\n",
  "export const x = { console: 1 };\no.console = 2;\n",
  "// console.log('x') and process.stdout.write('x') in a comment\nexport const y = 1;\n",
  "export const s = 'console.log process.stdout.write';\n",
  "export type C = Console;\n",
];

/** Lint `code` as a file under src/ or vendor/ with the repo config. */
async function lintAs(eslint: ESLint, code: string, file: string): Promise<{ ruleId: string | null; fatal?: boolean }[]> {
  const [res] = await eslint.lintText(code, { filePath: join(process.cwd(), file) });
  return res.messages;
}

/** The one source line each exception entry may report: the only terminal writes outside the output guard. */
const SITES: Record<string, string[]> = {
  'src/cli/bench.tsx console': ['console.log(JSON.stringify(r));'],
  'src/cli/main.tsx console': ['const rawLog = io?.log ?? console.log;'],
  'src/cli/main.tsx stderr-write': ["process.stderr.write(report.message.replace('{path}', pathText) + '\\n');"],
  'src/tui/app-actions.ts stdout-write': ['process.stdout.write(`Editing in ${displayName} — ${editorFinishHint(cmd)}\\n`);'],
};

describe('#221 R4: no raw terminal write outside the output guard', () => {
  it('1: WHEN `src` and `vendor` are linted with the repo config THEN no file has an error of `snote-r4/console`, `snote-r4/stdout-write` or `snote-r4/stderr-write`, the effective config of every source file has noInlineConfig on and each rule on except `src/core/output-guard.ts` and the pinned exceptions, and where `scripts/publish-export.sh` exists its INCLUDE list holds `eslint.terminal-sink.mjs`', async () => {
    const g = await scope();
    const eslint = new ESLint({ cwd: process.cwd() });
    const results = await eslint.lintFiles(['src', 'vendor']);
    const found = results.flatMap((r) =>
      r.messages.filter((m) => RULE_IDS.includes(m.ruleId ?? '')).map((m) => `${relative(process.cwd(), r.filePath)}:${m.line} ${m.ruleId}`),
    );
    expect(found).toEqual([]);
    expect(g.R4_EXTENSIONS).toEqual(EXTENSIONS);
    expect(g.OUTPUT_GUARD_FILE).toBe('src/core/output-guard.ts');
    const wrong: string[] = [];
    for (const file of sourceFiles()) {
      if (await eslint.isPathIgnored(file)) {
        wrong.push(`ignored ${file}`);
        continue;
      }
      const cfg = (await eslint.calculateConfigForFile(file)) as { rules: Record<string, unknown[]>; linterOptions?: { noInlineConfig?: boolean } };
      if (cfg.linterOptions?.noInlineConfig !== true) wrong.push(`inline config allowed in ${file}`);
      for (const id of RULE_IDS) {
        const rule = id.slice('snote-r4/'.length);
        const exempt = file === g.OUTPUT_GUARD_FILE || g.TERMINAL_EXCEPTIONS.some((e) => e.path === file && e.rules.includes(rule));
        const severity = cfg.rules[id]?.[0];
        const ok = exempt ? severity === undefined || severity === 0 : severity === 2;
        if (!ok) wrong.push(`${file} ${id} is ${String(severity)}`);
      }
    }
    expect(wrong).toEqual([]);
    for (const ext of EXTENSIONS) {
      const cfg = (await eslint.calculateConfigForFile(`src/tui/zz-sample.${ext}`)) as { rules: Record<string, unknown[]> };
      expect(RULE_IDS.map((id) => cfg.rules[id]?.[0]), ext).toEqual([2, 2, 2]);
    }
    // the public export copies a fixed INCLUDE list: the config and every file it imports must be in it
    if (existsSync(join(process.cwd(), 'scripts/publish-export.sh'))) {
      const dir = join(process.cwd(), 'scripts/export.d/include');
      const include = readdirSync(dir).map((f) => readFileSync(join(dir, f), 'utf8').split('\n')[0] ?? '');
      expect(relativeImports('eslint.config.mjs')).toContain('eslint.terminal-sink.mjs');
      for (const f of ['eslint.config.mjs', ...relativeImports('eslint.config.mjs')]) {
        expect(include, `${f} is in INCLUDE of scripts/publish-export.sh`).toContain(f);
      }
    }
  }, 60000);

  it('2: WHEN a file is in the exception list THEN its reason says its writes run after `guardOutputStream` is installed, or print numbers only, and names a test that exists with that numbered `it`, the list is exactly `src/cli/bench.tsx`, `src/cli/main.tsx` (two rules) and `src/tui/app-actions.ts`, and each entry still needs its rule at exactly the pinned source line (the exceptions cover whole files, so a second call in them is an error of this test)', async () => {
    const g = await scope();
    expect(g.TERMINAL_EXCEPTIONS.map((e) => `${e.path} ${e.rules.join(',')}`).sort()).toEqual([
      'src/cli/bench.tsx console',
      'src/cli/main.tsx console',
      'src/cli/main.tsx stderr-write',
      'src/tui/app-actions.ts stdout-write',
    ]);
    for (const e of g.TERMINAL_EXCEPTIONS) {
      expect(Number.isInteger(e.issue), e.path).toBe(true);
      expect(existsSync(join(process.cwd(), e.path)), `${e.path} exists`).toBe(true);
      expect(e.reason, e.path).toMatch(/after guardOutputStream is installed|sanitizeForTerminal|five numbers/);
      const named = /(test\/[\w./-]+\.test\.tsx?) test (\d+)/.exec(e.reason);
      expect(named, `${e.path} names its test`).not.toBeNull();
      const testFile = join(process.cwd(), named?.[1] ?? 'missing');
      expect(existsSync(testFile), `${named?.[1]} exists`).toBe(true);
      expect(readFileSync(testFile, 'utf8'), `${named?.[1]} has test ${named?.[2]}`).toMatch(new RegExp(`it\\(\\s*["'\`]${named?.[2]}:`));
      for (const rule of e.rules) {
        // stale check: with the exception removed, the file still triggers the rule it turns off
        const strict = new ESLint({
          cwd: process.cwd(),
          overrideConfigFile: true,
          overrideConfig: [
            {
              files: ['**/*.{ts,tsx}'],
              languageOptions: { parser: tsParser, parserOptions: { ecmaFeatures: { jsx: true } } },
              plugins: { [g.R4_PLUGIN_NAME]: g.R4_PLUGIN as never },
              rules: { [`${g.R4_PLUGIN_NAME}/${rule}`]: ['error', ...(g.R4_RULES[rule] as [])] } as never,
            },
          ],
        });
        const [r] = await strict.lintFiles([e.path]);
        expect(hits(r.messages, `snote-r4/${rule}`), `${e.path} ${rule}`).toBeGreaterThan(0);
        // the exception covers the whole file: pin the exact sites (count and text), so a stray call passes no lint
        const lines = readFileSync(join(process.cwd(), e.path), 'utf8').split('\n');
        const sites = r.messages.filter((m) => m.ruleId === `snote-r4/${rule}`).map((m) => (lines[m.line - 1] ?? '').trim());
        expect(sites, `${e.path} ${rule} sites`).toEqual(SITES[`${e.path} ${rule}`]);
      }
    }
  }, 60000);

  it('3: WHEN `src/cli/main.tsx` is read THEN its one `process.stderr.write(` comes after `guardOutputStream(process.stdout)` and `guardOutputStream(process.stderr)`, and its only console reference outside comments is `const rawLog = io?.log ?? console.log;`', () => {
    const src = readFileSync(join(process.cwd(), 'src/cli/main.tsx'), 'utf8');
    const out = src.indexOf('guardOutputStream(process.stdout)');
    const err = src.indexOf('guardOutputStream(process.stderr)');
    expect(out).toBeGreaterThan(0);
    expect(err).toBeGreaterThan(0);
    expect(src.split('process.stderr.write(').length - 1).toBe(1);
    expect(src.indexOf('process.stderr.write(')).toBeGreaterThan(Math.max(out, err));
    const consoleLines = src.split('\n').filter((l) => /\bconsole\b/.test(l) && !/^\s*(\/\/|\*|\/\*)/.test(l));
    expect(consoleLines).toEqual(['  const rawLog = io?.log ?? console.log;']);
  });

  it("4: WHEN every `console`, `process.stdout` and `process.stderr` write, alias, destructuring, pipe and import form (`process.stdout.write('x')`, `const { stdout } = process`, `import { stderr } from 'node:process'`, `console.log('x')`, `const c = console`, among others) is linted as a file under src/ and vendor/ in every extension THEN each has an error of its rule, and the clean lookalikes have none", async () => {
    const eslint = new ESLint({ cwd: process.cwd() });
    const missed: string[] = [];
    let forms = 0;
    for (const dir of ['src/tui', 'vendor/simplenote/utils']) {
      for (const ext of EXTENSIONS) {
        const typed = ['ts', 'tsx', 'mts', 'cts'].includes(ext);
        const cases: [string, string, string][] = [];
        for (const stream of ['stdout', 'stderr']) {
          for (const f of [...STREAM_FORMS, ...(typed ? STREAM_TS_FORMS : [])]) cases.push([f.split('S').join(stream), `snote-r4/${stream}-write`, stream]);
        }
        for (const f of CONSOLE_FORMS) cases.push([f, 'snote-r4/console', 'console']);
        for (const [i, [code, id]] of cases.entries()) {
          forms += 1;
          const messages = await lintAs(eslint, code, `${dir}/zz-form.${ext}`);
          // ESM syntax in a CommonJS .cjs file is a parse error: blocked loudly, as in the #194 matrix
          const blocked = hits(messages, id) > 0 || (ext === 'cjs' && messages.some((m) => m.fatal === true));
          if (!blocked) missed.push(`${dir}/${ext} #${i} ${id} ${JSON.stringify(code)}`);
        }
        for (const [i, clean] of CLEAN.entries()) {
          expect(hits(await lintAs(eslint, clean, `${dir}/zz-clean.${ext}`)), `${dir}/${ext} clean #${i}`).toBe(0);
        }
      }
    }
    expect(missed).toEqual([]);
    expect(forms).toBeGreaterThan(1000);
  }, 180000);

  it('5: WHEN a scratch file adds `console.log(note.content)` under `src/tui/`, or an `eslint-disable-next-line`, `eslint-disable-line`, `eslint-disable` or `eslint snote-r4/console: off` directive sits by it THEN lint reports it, and the output guard file itself is not reported', async () => {
    const eslint = new ESLint({ cwd: process.cwd() });
    const body = 'export const f = (note: { content: string }) => {\n  console.log(note.content);\n};\n';
    expect(hits(await lintAs(eslint, body, 'src/tui/zz-scratch.ts'), 'snote-r4/console')).toBeGreaterThan(0);
    const directives = [
      'export const f = (note: { content: string }) => {\n  // eslint-disable-next-line snote-r4/console\n  console.log(note.content);\n};\n',
      body.replace('console.log(note.content);', 'console.log(note.content); // eslint-disable-line snote-r4/console'),
      `/* eslint-disable */\n${body}`,
      `/* eslint snote-r4/console: off */\n${body}`,
    ];
    for (const [i, code] of directives.entries()) {
      expect(hits(await lintAs(eslint, code, 'src/tui/zz-scratch.ts'), 'snote-r4/console'), `directive form ${i}`).toBeGreaterThan(0);
    }
    expect(hits(await lintAs(eslint, body, 'src/core/output-guard.ts'))).toBe(0);
  }, 30000);
});
