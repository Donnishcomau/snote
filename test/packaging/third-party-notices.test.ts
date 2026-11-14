/**
 * #615 item 4: the built plugin-dist carries THIRD-PARTY-NOTICES, made from the build's own esbuild metafile:
 * every bundled node_modules package with its version, licence id and licence or NOTICE file text; a bundled
 * package with no licence file stops the build unless packaging/third-party holds its text.
 */
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { buildPluginDist } from '../../scripts/build-plugin-dist.mjs';
import { NOTICES_HEADER, bundledPackageDirs, thirdPartyNotices } from '../../scripts/third-party-notices.mjs';

const ENTRY = /^(\S+) (\S+) \((.+)\)$/;

const scratch: string[] = [];
afterAll(() => {
  for (const d of scratch) rmSync(d, { recursive: true, force: true });
});

describe('#615 THIRD-PARTY-NOTICES in the built plugin-dist', () => {
  let dist: string;

  beforeAll(async () => {
    dist = mkdtempSync(join(tmpdir(), 'notices-615-'));
    scratch.push(dist);
    await buildPluginDist(dist);
  }, 20000);

  it('1: WHEN buildPluginDist has built into a temp folder THEN THIRD-PARTY-NOTICES starts with the header and has no entry for `websocket`, `yaeti`, `typedarray-to-buffer` or `is-typedarray` and no `(Apache-2.0)` entry, and lists `simperium 1.1.4 (BSD-2-Clause)` with the text from packaging/third-party, `yoga-layout 3.2.1 (MIT)` with its Facebook copyright line and `ink 7.1.1 (MIT)`, each entry once and in name order, SHA256SUMS lists the file, and every packaging/third-party folder is a bundled package', () => {
    expect(existsSync(join(dist, 'THIRD-PARTY-NOTICES'))).toBe(true);
    const text = readFileSync(join(dist, 'THIRD-PARTY-NOTICES'), 'utf8');
    expect(text.startsWith(NOTICES_HEADER + '\n')).toBe(true);
    const entries = text.split('\n').filter((l) => ENTRY.test(l));
    expect(entries.filter((l) => ['websocket', 'yaeti', 'typedarray-to-buffer', 'is-typedarray'].includes(l.replace(ENTRY, '$1')) || l.endsWith(' (Apache-2.0)'))).toEqual([]);
    for (const e of ['simperium 1.1.4 (BSD-2-Clause)', 'yoga-layout 3.2.1 (MIT)', 'ink 7.1.1 (MIT)']) {
      expect([e, entries.filter((l) => l === e).length]).toEqual([e, 1]);
    }
    const keys = entries.map((l) => l.replace(ENTRY, '$1@$2'));
    expect(keys).toEqual([...new Set(keys)].sort());
    const block = (name: string) => text.slice(text.indexOf(`\n${name} `), text.indexOf('\n' + '='.repeat(72), text.indexOf(`\n${name} `) + 1));
    expect(block('simperium')).toContain('declares the BSD-2-Clause licence in its package.json');
    expect(block('yoga-layout')).toContain('Copyright (c) Facebook, Inc. and its affiliates.');
    expect(readFileSync(join(dist, 'SHA256SUMS'), 'utf8')).toMatch(/^[0-9a-f]{64} {2}THIRD-PARTY-NOTICES$/m);
    // no stale data: every packaging/third-party folder is a bundled package
    expect(readdirSync('packaging/third-party').filter((d) => !keys.includes(d.replace('+', '/')))).toEqual([]);
  });
});

describe('#615 thirdPartyNotices on scratch package folders', () => {
  /** A scratch root holding node_modules/<name> folders with a package.json and the given files. */
  function root(pkgs: Record<string, Record<string, string>>): string {
    const r = mkdtempSync(join(tmpdir(), 'notices-615-root-'));
    scratch.push(r);
    for (const [dir, files] of Object.entries(pkgs)) {
      mkdirSync(join(r, dir), { recursive: true });
      for (const [name, body] of Object.entries(files)) writeFileSync(join(r, dir, name), body);
    }
    return r;
  }

  it('2: WHEN a metafile names inputs under node_modules/a, node_modules/@s/b, node_modules/a/node_modules/c, src/ and a plugin namespace THEN the package folders are exactly `node_modules/@s/b`, `node_modules/a` and `node_modules/a/node_modules/c`', () => {
    const inputs = {
      'node_modules/a/index.js': {},
      'node_modules/a/lib/x.js': {},
      'node_modules/@s/b/lib/y.js': {},
      'node_modules/a/node_modules/c/i.js': {},
      'src/cli/index.ts': {},
      'websocket-client-only:websocket': {},
    };
    expect(bundledPackageDirs({ inputs })).toEqual(['node_modules/@s/b', 'node_modules/a', 'node_modules/a/node_modules/c']);
  });

  it('3: WHEN a bundled package has no licence file and packaging/third-party has no folder for it THEN thirdPartyNotices throws naming `nolic@1.0.0`, and still throws when its extra folder is empty; WHEN the extra folder holds its LICENSE THEN that text is used', () => {
    const r = root({ 'node_modules/nolic': { 'package.json': '{"name":"nolic","version":"1.0.0","license":"MIT"}', 'README.md': 'MIT' } });
    const meta = { inputs: { 'node_modules/nolic/index.js': {} } };
    expect(() => thirdPartyNotices(meta, r, join(r, 'extra'))).toThrow('no licence file for nolic@1.0.0');
    mkdirSync(join(r, 'extra', 'nolic@1.0.0'), { recursive: true });
    expect(() => thirdPartyNotices(meta, r, join(r, 'extra'))).toThrow('no licence file for nolic@1.0.0'); // an empty extra folder is no licence
    writeFileSync(join(r, 'extra', 'nolic@1.0.0', 'LICENSE'), 'extra text for nolic');
    expect(thirdPartyNotices(meta, r, join(r, 'extra'))).toContain('nolic 1.0.0 (MIT)\n\n--- LICENSE\n\nextra text for nolic\n');
  });

  it('4: WHEN a package ships LICENSE.md with CRLF line ends, a NOTICE and a README THEN its entry holds both files with LF line ends and not the README', () => {
    const r = root({
      'node_modules/p': { 'package.json': '{"name":"p","version":"2.0.0","license":"Apache-2.0"}', 'LICENSE.md': 'line one\r\nline two\r\n', NOTICE: 'notice text', 'README.md': 'readme text' },
    });
    const out = thirdPartyNotices({ inputs: { 'node_modules/p/i.js': {} } }, r, join(r, 'extra'));
    expect(out).toContain('p 2.0.0 (Apache-2.0)\n\n--- LICENSE.md\n\nline one\nline two\n\n--- NOTICE\n\nnotice text\n');
    expect(out).not.toContain('readme text');
    expect(out).not.toContain('\r');
  });
  it('5: WHEN a bundled package.json names `../x`, names another folder, or has the version `1.0.0/../../x` THEN thirdPartyNotices throws `bad package.json name or version` naming that folder', () => {
    const cases: [string, string][] = [
      ['{"name":"../x","version":"1.0.0"}', 'node_modules/p1'],
      ['{"name":"other","version":"1.0.0"}', 'node_modules/p1'],
      ['{"name":"p1","version":"1.0.0/../../x"}', 'node_modules/p1'],
    ];
    for (const [json, dir] of cases) {
      const r = root({ [dir]: { 'package.json': json, LICENSE: 'licence text' } });
      expect(() => thirdPartyNotices({ inputs: { [`${dir}/i.js`]: {} } }, r, join(r, 'extra'))).toThrow(`bad package.json name or version in ${dir}`);
    }
  });
});
