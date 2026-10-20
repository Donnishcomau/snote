// 0.2.7 — release 0.2.7: the version number everywhere it is pinned, the changelog and the notes.
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { main } from '../../src/cli/main';

const read = (...parts: string[]) =>
  readFileSync(join(process.cwd(), ...parts), 'utf8');

describe('release 0.2.7', () => {
  it("1: WHEN package.json, manifest.json and package-lock.json are parsed THEN `version` (and `packages[''].version`) all equal `0.2.7`.", () => {
    const pkg = JSON.parse(read('package.json')) as { version: string };
    const manifest = JSON.parse(read('manifest.json')) as { version: string };
    const lock = JSON.parse(read('package-lock.json')) as {
      version: string;
      packages: Record<string, { version?: string }>;
    };
    expect(pkg.version).toBe('0.2.7');
    expect(manifest.version).toBe('0.2.7');
    expect(lock.version).toBe('0.2.7');
    expect(lock.packages[''].version).toBe('0.2.7');
  });

  it('2: WHEN packaging/aur/PKGBUILD is read THEN it contains `pkgver=0.2.7` and `pkgrel=1` and not `pkgver=0.2.6`.', () => {
    const pkgbuild = read('packaging', 'aur', 'PKGBUILD');
    expect(pkgbuild).toContain('pkgver=0.2.7');
    expect(pkgbuild).toContain('pkgrel=1');
    expect(pkgbuild).not.toContain('pkgver=0.2.6');
  });

  it("3: WHEN main(['--version'], io) runs THEN it resolves `0` and logged is exactly `['snote 0.2.7']`.", async () => {
    const logged: string[] = [];
    const io = { log: (text: string) => logged.push(text) };
    const code = await main(['--version'], io);
    expect(code).toBe(0);
    expect(logged).toEqual(['snote 0.2.7']);
  });

  it('4: WHEN CHANGELOG.md is read THEN `## 0.2.7` comes before `## 0.2.6`, it contains no `## Unreleased`, and the text between them contains `### Fixed` and `source-map-js`.', () => {
    const changelog = read('CHANGELOG.md');
    const at027 = changelog.indexOf('## 0.2.7');
    const at026 = changelog.indexOf('## 0.2.6');
    expect(at027).toBeGreaterThanOrEqual(0);
    expect(at026).toBeGreaterThanOrEqual(0);
    expect(at027).toBeLessThan(at026);
    expect(changelog).not.toContain('## Unreleased');
    const between = changelog.slice(at027, at026);
    expect(between).toContain('### Fixed');
    expect(between).toContain('source-map-js');
  });

  it("5: WHEN docs/release-notes-0.2.7.md is read THEN it starts with `# snote 0.2.7 release notes` and contains `## What's new`, `## Upgrading`, `## Thanks` and `omarchy-restart-shell`.", () => {
    const notes = read('docs', 'release-notes-0.2.7.md');
    expect(notes.startsWith('# snote 0.2.7 release notes')).toBe(true);
    expect(notes).toContain("## What's new");
    expect(notes).toContain('## Upgrading');
    expect(notes).toContain('## Thanks');
    expect(notes).toContain('omarchy-restart-shell');
  });
  it('6: WHEN docs/release-notes-0.2.7.md is read THEN its Known issues contain `the `y` can answer the question` and `the note can occasionally`.', () => {
    const known = read('docs', 'release-notes-0.2.7.md').split('## Known issues')[1] ?? '';
    expect(known).toContain('the `y` can answer the question');
    expect(known).toContain('the note can occasionally');
  });
});
