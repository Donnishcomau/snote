import { existsSync, globSync, readFileSync } from 'node:fs';
import { join, relative } from 'node:path';
import { pathToFileURL } from 'node:url';
import { ESLint } from 'eslint';
import { describe, expect, it } from 'vitest';

type Entry = { file: string; expr: string; source: string; proof: string };

const RULE = 'snote-text/child';
const FILES = ['src/**/*.{ts,tsx}'];
const eslint = new ESLint({ cwd: process.cwd() });
const emptyAllowlist = new ESLint({ cwd: process.cwd(), overrideConfig: [{ files: FILES, rules: { [RULE]: ['error', { allowlist: [] }] } }] });
const srcFiles = () => (globSync('src/**/*.{ts,tsx}') as string[]).sort();
async function count(code: string, file = 'src/tui/zz-scratch.tsx'): Promise<number> {
  const [res] = await eslint.lintText(code, { filePath: join(process.cwd(), file) });
  return res.messages.filter((m) => m.ruleId === RULE).length;
}
const HEAD = "import { Text } from 'ink';\nimport { sanitizeForTerminal } from '../core/sanitize';\nimport { standInText } from './standin';\n";
const wrap = (jsx: string) => `${HEAD}export const A = (x: string, c: boolean) => ${jsx};\n`;
// the operands of an entry's expression: identifiers that are not a member name or an object key, minus a few globals
const OPERAND_IGNORE = new Set(['Array', 'Math', 'undefined', 'length', 'null', 'true', 'false', 'from', 'max']);
function operands(expr: string): string[] {
  const bare = expr.replace(/'(?:[^'\\]|\\.)*'|"(?:[^"\\]|\\.)*"|`(?:[^`\\]|\\.)*`/g, "''");
  return [...new Set([...bare.matchAll(/(?<![.\w$])[A-Za-z_$][\w$]*(?![\w$])(?!\s*:)/g)].map((m) => m[0]))].filter((w) => !OPERAND_IGNORE.has(w));
}

describe('#419 Text children: fails on any raw expression child of <Text> under src', () => {
  it('1: WHEN every .ts and .tsx file under `src` is linted with the repo config THEN no file has an error of `snote-text/child`, and the effective config of every one of them has noInlineConfig `true` and `snote-text/child` at `error`', async () => {
    const files = srcFiles();
    expect(files.length).toBeGreaterThan(50);
    expect(files.some((f) => f.startsWith('src/cli/'))).toBe(true);
    const results = await eslint.lintFiles(files);
    const found = results.flatMap((r) => r.messages.filter((m) => m.ruleId === RULE).map((m) => `${relative(process.cwd(), r.filePath)}:${m.line}`));
    expect(found).toEqual([]);
    for (const f of files) {
      const cfg = (await eslint.calculateConfigForFile(f)) as { rules: Record<string, unknown[]>; linterOptions?: { noInlineConfig?: boolean } };
      expect(cfg.linterOptions?.noInlineConfig, f).toBe(true);
      expect(cfg.rules[RULE]?.[0], f).toBe(2);
    }
  }, 120000);

  it('2: WHEN every .ts and .tsx file under `src` is linted with the rule and an EMPTY allowlist THEN the set of reported (file, expression source text) pairs equals the set of allowlist entries exactly, it has at least `1` and at most `45` members, and every entry has a non-empty `source` and a `proof` that names a test file that exists and holds an it() title starting with the number the entry names', async () => {
    const { TEXT_CHILD_ALLOWLIST } = (await import(pathToFileURL(join(process.cwd(), 'eslint.text-child.mjs')).href)) as { TEXT_CHILD_ALLOWLIST: Entry[] };
    const results = await emptyAllowlist.lintFiles(srcFiles());
    const reported = new Set(results.flatMap((r) => r.messages.filter((m) => m.ruleId === RULE).map((m) => `${relative(process.cwd(), r.filePath)}\u0000${JSON.parse(m.message.slice(m.message.indexOf(': "') + 2)) as string}`)));
    const listed = new Set(TEXT_CHILD_ALLOWLIST.map((e) => `${e.file}\u0000${e.expr}`));
    expect([...reported].sort()).toEqual([...listed].sort());
    expect(TEXT_CHILD_ALLOWLIST.length).toBe(listed.size);
    expect(listed.size).toBeGreaterThanOrEqual(1);
    expect(listed.size).toBeLessThanOrEqual(45);
    for (const e of TEXT_CHILD_ALLOWLIST) {
      expect(Object.keys(e).sort(), e.expr).toEqual(['expr', 'file', 'proof', 'source']);
      expect(e.source.trim().length).toBeGreaterThan(0);
      const m = /^(\S+) (\d+)$/.exec(e.proof);
      expect(m, e.proof).not.toBeNull();
      expect(existsSync(m![1]), e.proof).toBe(true);
      expect(new RegExp(`\\bit\\(\\s*['"\`]${m![2]}:`).test(readFileSync(m![1], 'utf8')), e.proof).toBe(true);
      // C4: an expression holding `+`, a call or a computed member names every operand it uses in `source`
      if (/\+|\(|\[/.test(e.expr)) for (const w of operands(e.expr)) expect(new RegExp(`(^|[^\\w$])${w.replace(/\$/g, '\\$')}([^\\w$]|$)`).test(e.source), `${e.expr}: source must name ${w}`).toBe(true);
    }
  }, 120000);

  it('3: WHEN `<Text>{note.title}</Text>` is linted as text with filePath `src/tui/zz-scratch.tsx`, alone and again with `// eslint-disable-next-line snote-text/child` on the line above THEN each run reports exactly `1` `snote-text/child` error', async () => {
    const body = 'export const A = (note: { title: string }) => <Text>{note.title}</Text>;\n';
    expect(await count(HEAD + body)).toBe(1);
    expect(await count(`${HEAD}// eslint-disable-next-line snote-text/child\n${body}`)).toBe(1);
  }, 60000);

  it('4 (pass-on-old): WHEN literals, a sanitiser call, a stand-in call and a const literal are the children THEN each reports `0` errors', async () => {
    for (const c of ["<Text>{'a'}</Text>", '<Text>{7}</Text>', '<Text>{sanitizeForTerminal(x)}</Text>', '<Text>{standInText(x)}</Text>', "<Text>{c ? 'a' : sanitizeForTerminal(x)}</Text>", "<Text>{c && 'a'}</Text>", "<Text>{'a' ?? 'b'}</Text>", '<Text>{/* note */}</Text>']) expect(await count(wrap(c)), c).toBe(0);
    expect(await count(`${HEAD}const HINT = 'Esc close';\nexport const A = () => <Text>{HINT}</Text>;\n`)).toBe(0);
    expect(await count("import fs = require('node:fs');\nconst { a } = fs;\nexport const A = [fs, a];\n")).toBe(0);
  }, 60000);

  it('5: WHEN raw forms are the children THEN each reports exactly `1` error', async () => {
    const cases = [
      wrap('<Text>{sanitizeForTerminal(x) + x}</Text>'),
      wrap('<Text>{({ title: x }).title}</Text>'),
      `${HEAD}declare function fn(x: string): string;\nexport const A = (x: string) => <Text>{fn(x)}</Text>;\n`,
      wrap('<Text>{`a ${x}`}</Text>'),
      `${HEAD}let HINT = 'a';\nexport const A = () => <Text>{HINT}</Text>;\n`,
      "import { Text } from 'ink';\nconst sanitizeForTerminal = (s: string) => s;\nexport const A = (x: string) => <Text>{sanitizeForTerminal(x)}</Text>;\n",
      "import { Text as T } from 'ink';\nexport const A = (x: { title: string }) => <T>{x.title}</T>;\n",
    ];
    for (const c of cases) expect(await count(c), c).toBe(1);
  }, 60000);

  it('6: WHEN a `children=` attribute or a spread object holding `children` is set on a <Text> THEN each reports exactly `1` error', async () => {
    for (const c of ['<Text children={x} />', '<Text {...{ children: x }} />', "<Text children='a' />", '<Text {...{ [x]: 1 }} />', '<Text {...{ ...{ children: x } }} />']) expect(await count(wrap(c)), c).toBe(1);
  }, 60000);

  it('7: WHEN a raw expression child sits inside a fragment, an element or a ?: && || branch lexically inside a <Text> THEN each reports exactly `1` error', async () => {
    const cases = ['<Text><>{x}</></Text>', '<Text><Foo>{x}</Foo></Text>', '<Text>{c ? <>{x}</> : null}</Text>', '<Text>{c && <Foo>{x}</Foo>}</Text>', "<Text>{'a' || <Foo>{x}</Foo>}</Text>", '<Text>{c ? null : <Foo><Bar>{x}</Bar></Foo>}</Text>', '<Text><Foo children={x} /></Text>'];
    for (const c of cases) expect(await count(wrap(c)), c).toBe(1);
    expect(await count(wrap("<Text><Foo>{'a'}</Foo>{c && <>{sanitizeForTerminal(x)}</>}</Text>"))).toBe(0);
  }, 60000);

  it('8: WHEN ink is imported by default or as a namespace, re-exported, or `Text` is copied to another name THEN each reports exactly `1` error', async () => {
    const cases = [
      "import Ink from 'ink';\nexport const A = Ink;\n",
      "import * as I from 'ink';\nexport const A = I;\n",
      "export { Text } from 'ink';\n",
      "export * from 'ink';\n",
      "import { Text } from 'ink';\nconst T = Text;\nexport const A = T;\n",
      "import { Text } from 'ink';\nlet T: unknown;\nT = Text;\nexport const A = T;\n",
      "import { Text } from 'ink';\nexport { Text };\n",
    ];
    for (const c of cases) expect(await count(c), c).toBe(1);
  }, 60000);

  it('9: WHEN `<Text>{x.title}</Text>` is linted as text with filePath `src/cli/zz-scratch.tsx` THEN it reports exactly `1` error, and the stand-in import is not accepted from another directory', async () => {
    expect(await count("import { Text } from 'ink';\nexport const A = (x: { title: string }) => <Text>{x.title}</Text>;\n", 'src/cli/zz-scratch.tsx')).toBe(1);
    expect(await count(HEAD + 'export const A = (x: string) => <Text>{standInText(x)}</Text>;\n', 'src/cli/zz-scratch.tsx')).toBe(1);
  }, 60000);
});
