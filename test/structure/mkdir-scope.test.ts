/**
 * #214: folders are created only through secureMkdir / ensureDir in
 * src/core/secure-fs.ts. The rule is the #194 scope block in
 * eslint.fs-write.mjs (mkdir and mkdirSync join its member list), and its
 * exceptions are per call: even in an excepted file a renamed mkdirSync fails.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { ESLint } from 'eslint';
import { describe, expect, it } from 'vitest';

const FORMS = [
  "import * as fs from 'node:fs';\nexport const f = (p: string) => fs.mkdirSync(p, { recursive: true });\n",
  "import { mkdirSync } from 'node:fs';\nexport const f = (p: string) => mkdirSync(p);\n",
  "import * as fs from 'node:fs';\nexport const f = (p: string) => fs['mkdirSync'](p);\n",
  "import * as fs from 'node:fs';\nexport const f = (p: string) => fs.promises.mkdir(p);\n",
  "import * as fs from 'node:fs';\nconst { mkdirSync: m } = fs;\nexport const f = (p: string) => m(p);\n",
  "import * as fs from 'node:fs';\n/* eslint-disable */\nexport const f = (p: string) => fs.mkdirSync(p);\n",
];
const CLEAN = "import { secureMkdir } from '../core/secure-fs';\nexport const f = (p: string) => secureMkdir(p);\n";
const guardRule = (m: { ruleId: string | null }): boolean =>
  m.ruleId === 'no-restricted-syntax' || m.ruleId === 'no-restricted-imports';

describe('#214 folder creation scope', () => {
  it('1: WHEN src/ is linted with the repo config THEN no file creates a folder with mkdir or mkdirSync except through src/core/secure-fs.ts, each of `6` mkdir forms linted as a file under src/ reports a guard error, secureMkdir(p) reports none, and a renamed mkdirSync appended to export-note.ts is an error while the file itself is clean', async () => {
    const eslint = new ESLint({ cwd: process.cwd() });
    const tree = await eslint.lintFiles(['src']);
    expect(tree.filter((r) => r.messages.some(guardRule)).map((r) => r.filePath)).toEqual([]);
    const missed: number[] = [];
    for (const [i, code] of FORMS.entries()) {
      const [res] = await eslint.lintText(code, { filePath: join(process.cwd(), 'src/core', `zz-mkdir-${i}.ts`) });
      if (!res.messages.some(guardRule)) missed.push(i);
    }
    expect(missed).toEqual([]);
    const [clean] = await eslint.lintText(CLEAN, { filePath: join(process.cwd(), 'src/cli', 'zz-clean.ts') });
    expect(clean.messages.filter(guardRule)).toEqual([]);
    const file = join(process.cwd(), 'src/core/export-note.ts');
    const original = readFileSync(file, 'utf8');
    const [ok] = await eslint.lintText(original, { filePath: file });
    expect(ok.messages.filter(guardRule)).toEqual([]);
    const [bad] = await eslint.lintText(`${original}\nimport { mkdirSync as mk } from 'node:fs';\nmk('/tmp/x');\n`, { filePath: file });
    expect(bad.messages.filter(guardRule).length).toBeGreaterThan(0);
  }, 60000);
});
