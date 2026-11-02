/**
 * #191 / #195 (marketplace review #12334): every network
 * request in src/ and vendor/ goes through src/core/bounded-request.ts, which
 * owns the whole-exchange timeout and the body size cap. ESLint scope rules
 * (NETWORK_GUARD in eslint.config.mjs, built by eslint.scope.mjs) forbid `fetch`
 * (called, aliased, passed on, or reached through globalThis) and the raw http
 * clients everywhere else, and no inline `eslint-disable` can switch them off.
 * This file proves the rules fire on a corpus of bypass forms, that the tree is
 * clean, and that every temporary exception is still needed.
 *
 * Accepted residual: `Reflect.get(globalThis, 'fetch')` and other computed
 * lookups are not caught by a scope rule.
 */
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join, relative } from 'node:path';
import { pathToFileURL } from 'node:url';
import tsParser from '@typescript-eslint/parser';
import { ESLint } from 'eslint';
import { describe, expect, it } from 'vitest';

const RULES = ['no-restricted-globals', 'no-restricted-properties', 'no-restricted-imports'];

interface Guard {
  rules: Record<string, unknown>;
  exceptions: { path: string; rules: string[]; reason: string; issue: number }[];
}

async function loadGuard(): Promise<Guard> {
  const mod = (await import(pathToFileURL(join(process.cwd(), 'eslint.config.mjs')).href)) as { NETWORK_GUARD: Guard };
  return mod.NETWORK_GUARD;
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

/** Errors of the three rules for `code` linted as a file under src/ with the repo's config. */
async function errors(eslint: ESLint, code: string): Promise<number> {
  const [result] = await eslint.lintText(code, { filePath: 'src/core/x.ts' });
  return result.messages.filter((m) => RULES.includes(m.ruleId ?? '')).length;
}

describe('#191 every request goes through bounded-request', () => {
  it("5: WHEN `src` and `vendor` are linted with the repo config THEN no file has an error of the three network rules, the guard sets `noInlineConfig`, and the only exception left is `src/core/websocket-provider.ts` (#196), with a reason, an existing path and a hit for its rules, and where `scripts/publish-export.sh` exists its INCLUDE list holds `eslint.config.mjs` and `eslint.scope.mjs`", async () => {
    const guard = await loadGuard();
    const repo = new ESLint({ cwd: process.cwd() });
    const results = await repo.lintFiles(['src', 'vendor']);
    const hits = results.flatMap((r) =>
      r.messages
        .filter((m) => RULES.includes(m.ruleId ?? ''))
        .map((m) => `${relative(process.cwd(), r.filePath)}:${m.line} ${m.ruleId}`),
    );
    expect(hits).toEqual([]);
    const effective = (await repo.calculateConfigForFile('src/core/x.ts')) as { linterOptions?: { noInlineConfig?: boolean } };
    expect(effective.linterOptions?.noInlineConfig).toBe(true);
    expect(guard.exceptions.map((e) => e.path).sort()).toEqual(['src/core/websocket-provider.ts']);
    for (const e of guard.exceptions) {
      expect(e.reason.length, e.path).toBeGreaterThan(0);
      expect(Number.isInteger(e.issue), e.path).toBe(true);
      expect(existsSync(join(process.cwd(), e.path)), `${e.path} exists`).toBe(true);
      // stale check: with the exception removed, the file still triggers the rules it turns off
      const strict = new ESLint({
        cwd: process.cwd(),
        overrideConfigFile: true,
        overrideConfig: [
          {
            files: ['**/*.{ts,tsx}'],
            languageOptions: { parser: tsParser, parserOptions: { ecmaFeatures: { jsx: true } } },
            rules: Object.fromEntries(e.rules.map((r) => [r, guard.rules[r]])) as never,
          },
        ],
      });
      const [r] = await strict.lintFiles([e.path]);
      expect(r.messages.filter((m) => e.rules.includes(m.ruleId ?? '')).length, e.path).toBeGreaterThan(0);
    }
    // the public export copies a fixed INCLUDE list: the config and every file it imports must be in it,
    // or public lint stops with ERR_MODULE_NOT_FOUND (the export script is not itself exported)
    const exportScript = join(process.cwd(), 'scripts/publish-export.sh');
    if (existsSync(exportScript)) {
      // #275: one entry file per INCLUDE path under scripts/export.d/include; line 1 is the path
      const dir = join(process.cwd(), 'scripts/export.d/include');
      const include = readdirSync(dir).map((f) => readFileSync(join(dir, f), 'utf8').split('\n')[0] ?? '');
      expect(relativeImports('eslint.config.mjs')).toContain('eslint.scope.mjs');
      for (const f of ['eslint.config.mjs', ...relativeImports('eslint.config.mjs')]) {
        expect(include, `${f} is in INCLUDE of scripts/publish-export.sh`).toContain(f);
      }
    }
  }, 30000);

  it("6: WHEN the lines `const f = fetch`, `fetch?.(u)`, `fetch.call(null, u)`, `const { fetch: f } = globalThis`, `globalThis['fetch'](u)` and `import { request } from 'undici'`, and every snippet of test/fixtures/network-bypass-cases.json (among them four `eslint-disable` directive forms), are linted as a file under src/ THEN each has an error, and `o.fetch(u)`, `type F = typeof fetch` and `// fetch(u)` have none", async () => {
    const repo = new ESLint({ cwd: process.cwd() });
    const corpus = JSON.parse(readFileSync(join(process.cwd(), 'test/fixtures/network-bypass-cases.json'), 'utf8')) as string[];
    expect(corpus.length).toBeGreaterThanOrEqual(26);
    expect(corpus.filter((c) => c.includes('eslint-disable') || c.includes('eslint no-restricted')).length).toBeGreaterThanOrEqual(4);
    const inline = [
      'const f = fetch',
      'fetch?.(u)',
      'fetch.call(null, u)',
      'const { fetch: f } = globalThis',
      "globalThis['fetch'](u)",
      "import { request } from 'undici'",
    ];
    const missed: string[] = [];
    for (const code of [...inline, ...corpus]) {
      if ((await errors(repo, code)) === 0) missed.push(code);
    }
    expect(missed).toEqual([]);
    for (const clean of ['const r = o.fetch(u);', 'type F = typeof fetch;', '// fetch(u)', 'const s = "git fetch";']) {
      expect(await errors(repo, clean), clean).toBe(0);
    }
  }, 30000);
});
