// Issues #416, #417, #421 (guard class 5): the listing text, SECURITY.md and setup's opening comment
// say what the code does. Every fact is read from the code at test time; a missing anchor fails by name.
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const read = (p: string): string => readFileSync(join(process.cwd(), p), 'utf8');
const flat = (s: string): string => s.replace(/\s+/g, ' ');

/** The first capture group of `re` in `text`, or a failure naming the missing anchor. */
function anchor(text: string, re: RegExp, name: string): string {
  const m = re.exec(text);
  if (!m) throw new Error(`anchor missing: ${name}`);
  return m[1] ?? '';
}

/** A markdown section from its heading to the next `## ` heading. */
function section(md: string, heading: string): string {
  const start = md.indexOf(`## ${heading}`);
  if (start === -1) throw new Error(`anchor missing: section ${heading}`);
  const next = md.indexOf('\n## ', start + 1);
  return next === -1 ? md.slice(start) : md.slice(start, next);
}

/** One top-level bullet (a line starting `- ` and its indented lines) that starts with `start`. */
function bullet(md: string, start: string, name: string): string {
  const lines = md.split('\n');
  const i = lines.findIndex((l) => l.startsWith(`- ${start}`));
  if (i === -1) throw new Error(`anchor missing: ${name}`);
  let j = i + 1;
  while (j < lines.length && /^\s+\S/.test(lines[j]!)) j++;
  return flat(lines.slice(i, j).join('\n'));
}

describe('#416 #417 #421 claims from code: the listing text, SECURITY.md and setup\'s comment fail when they disagree with setup, the launcher or bar-update', () => {
  const setup = read('packaging/omarchy/setup');
  const build = read('scripts/build.mjs');
  const security = read('SECURITY.md');
  const installSection = section(security, 'Install, update and uninstall');

  const pluginName = (): string => anchor(setup, /^plugin_dir="\$data_home\/([^"]+)"/m, 'setup plugin_dir= line');
  const shimName = (): string => anchor(setup, /^shim="\$bin_dir\/([^"]+)"/m, 'setup shim= line');
  const cacheNames = (): [string, string] => {
    const m = /'\.cache'\), '([^']+)', '([^']+)'\)/.exec(build);
    if (!m) throw new Error("anchor missing: launcher '.cache'), '<a>', '<b>') join in scripts/build.mjs");
    return [m[1]!, m[2]!];
  };

  it('1: WHEN packaging/omarchy/setup is read with comment lines and quoted text removed THEN it holds none of `omarchy-install-dev-env`, `mise install`, `mise use`, `npm install` and `pacman`, and manifest.json\'s `description` has no match for "install", "installs" or "installing" followed by `Node` (case-insensitive) and contains `Node.js 22`', () => {
    const code = setup
      .split('\n')
      .filter((l) => !/^\s*#/.test(l))
      .join('\n')
      .replace(/"(?:[^"\\]|\\.)*"/g, '""')
      .replace(/'[^']*'/g, "''");
    expect(code.length).toBeGreaterThan(0);
    for (const banned of ['omarchy-install-dev-env', 'mise install', 'mise use', 'npm install', 'pacman']) {
      expect(code, `setup code line holds ${banned}`).not.toContain(banned);
    }
    const description = (JSON.parse(read('manifest.json')) as { description: string }).description;
    expect(description).not.toMatch(/install(s|ing)?\s+Node/i);
    expect(description).toContain('Node.js 22');
  });

  it('2: WHEN the plugin folder name is read from setup\'s `plugin_dir="$data_home/...` line, the shim name from its `shim="$bin_dir/...` line and the cache path from the launcher\'s `\'.cache\'), \'<a>\', \'<b>\')` join in scripts/build.mjs THEN SECURITY.md\'s `## Install, update and uninstall` section contains `~/.local/share/omarchy-snote-plugin`, `~/.local/bin/snote`, `~/.cache/snote/compile-cache`, `XDG_DATA_HOME` and `XDG_CACHE_HOME`, each built from the names read', () => {
    const [a, b] = cacheNames();
    const text = flat(installSection);
    const expected = [
      `~/.local/share/${pluginName()}`,
      `~/.local/bin/${shimName()}`,
      `~/.cache/${a}/${b}`,
      'XDG_DATA_HOME',
      'XDG_CACHE_HOME',
    ];
    expect(expected.length).toBe(5);
    for (const e of expected) expect(text, `SECURITY.md install section names ${e}`).toContain(e);
  });

  it('3: WHEN the Uninstall bullet of that section is read THEN it contains `~/.cache/snote` (the cache folder name read from scripts/build.mjs)', () => {
    const [a] = cacheNames();
    const uninstall = bullet(installSection, 'Uninstall', 'Uninstall bullet in the install section');
    expect(uninstall).toContain(`~/.cache/${a}`);
  });

  it('4: WHEN the arms of bar-update\'s `case "$url" in` are read (the catch-all `*` refusal left out) THEN they are exactly `/*` and `https://*`, each arm maps to a phrase (`/*` -> `local folder path`, `https://*` -> `github.com`), every phrase appears in SECURITY.md\'s "Bar update click." bullet, and an arm with no phrase fails the test with its name', () => {
    const barUpdate = read('packaging/omarchy/bar-update');
    const block = anchor(barUpdate, /case "\$url" in\n([\s\S]*?)\n\s*esac/, 'bar-update case "$url" in block');
    const arms = [...block.matchAll(/^\s*(\S+)\)/gm)].map((m) => m[1]!).filter((arm) => arm !== '*');
    const phrases: Record<string, string> = { '/*': 'local folder path', 'https://*': 'github.com' };
    expect(arms).toEqual(['/*', 'https://*']);
    const click = bullet(security, 'Bar update click.', 'Bar update click. bullet');
    for (const arm of arms) {
      const phrase = phrases[arm];
      if (phrase === undefined) throw new Error(`bar-update origin arm has no phrase: ${arm}`);
      expect(click, `SECURITY.md bar update bullet names the arm ${arm} as "${phrase}"`).toContain(phrase);
    }
  });

  it('5: WHEN the first 6 lines of packaging/omarchy/setup are read THEN they do not contain `nothing is written outside` and they contain `XDG_DATA_HOME`', () => {
    const head = setup.split('\n').slice(0, 6).join('\n');
    expect(head).not.toContain('nothing is written outside');
    expect(head).toContain('XDG_DATA_HOME');
  });

  it('6: WHEN every R12 row of test/packaging/omarchy-setup-scope.test.ts (`rel === \'<p>\'` and `rel.startsWith(\'<p>/\')` inside `const ALLOWED`) and the run folders built by `defaultDataDir` in src/core/token.ts and `stateDir` in src/cli/main.tsx (their `os.homedir(), \'<a>\', ...` join) are read THEN there are at least 2 R12 paths and 2 run folders, and SECURITY.md\'s `## Install, update and uninstall` section names each as `~/<path>`', () => {
    const scope = read('test/packaging/omarchy-setup-scope.test.ts');
    const rows = anchor(scope, /const ALLOWED[^\n]*\[\n([\s\S]*?)\n\];/, 'omarchy-setup-scope.test.ts const ALLOWED rows');
    const r12 = [...rows.matchAll(/rel === '([^']+)'|rel\.startsWith\('([^']+)\/'\)/g)].map((m) => m[1] ?? m[2]!);
    const homeJoin = (file: string, fn: string): string => {
      const text = read(file);
      const at = text.indexOf(`function ${fn}()`);
      if (at === -1) throw new Error(`anchor missing: function ${fn}() in ${file}`);
      const parts = anchor(text.slice(at), /os\.homedir\(\), ((?:'[^']+'(?:, )?)+)\)/, `${fn} os.homedir() join in ${file}`);
      return [...parts.matchAll(/'([^']+)'/g)].map((m) => m[1]!).join('/');
    };
    const runs = [homeJoin('src/core/token.ts', 'defaultDataDir'), homeJoin('src/cli/main.tsx', 'stateDir')];
    expect(new Set(r12).size).toBeGreaterThanOrEqual(2);
    expect(runs.filter((r) => /^\.local\/[a-z]+\/[a-z]+$/.test(r))).toHaveLength(2);
    const text = flat(installSection);
    for (const p of [...new Set(r12), ...runs]) expect(text, `SECURITY.md install section names ~/${p}`).toContain(`~/${p}`);
  });
});
