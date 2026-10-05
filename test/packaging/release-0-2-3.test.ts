// T371 — release 0.2.3: changelog, release notes and the version number.
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const read = (...parts: string[]) =>
  readFileSync(join(process.cwd(), ...parts), 'utf8');

describe('release 0.2.3', () => {
  it("1: WHEN package.json, manifest.json and package-lock.json are parsed THEN `version` (and `packages[''].version`) all equal `0.2.3`, and PKGBUILD contains `pkgver=0.2.3`.", () => {
    const pkg = JSON.parse(read('package.json')) as { version: string };
    const manifest = JSON.parse(read('manifest.json')) as { version: string };
    const lock = JSON.parse(read('package-lock.json')) as {
      version: string;
      packages: Record<string, { version?: string }>;
    };
    const pkgbuild = read('packaging', 'aur', 'PKGBUILD');
    expect(pkg.version).toBe('0.2.3');
    expect(manifest.version).toBe('0.2.3');
    expect(lock.version).toBe('0.2.3');
    expect(lock.packages[''].version).toBe('0.2.3');
    expect(pkgbuild).toContain('pkgver=0.2.3');
  });

  it("2: WHEN CHANGELOG.md is read THEN `## 0.2.3` comes before `## 0.2.2`, and the text between them contains `omarchy-install-dev-env node`, `focus: preview` and `tooltip`.", () => {
    const changelog = read('CHANGELOG.md');
    const at023 = changelog.indexOf('## 0.2.3');
    const at022 = changelog.indexOf('## 0.2.2');
    expect(at023).toBeGreaterThanOrEqual(0);
    expect(at022).toBeGreaterThanOrEqual(0);
    expect(at023).toBeLessThan(at022);
    const between = changelog.slice(at023, at022);
    expect(between).toContain('omarchy-install-dev-env node');
    expect(between).toContain('focus: preview');
    expect(between).toContain('tooltip');
  });

  it("3: WHEN docs/release-notes-0.2.3.md is read THEN it starts with `# snote 0.2.3 release notes` and contains `## What's new`, `## Upgrading` and `Node.js`.", () => {
    const notes = read('docs', 'release-notes-0.2.3.md');
    expect(notes.startsWith('# snote 0.2.3 release notes')).toBe(true);
    expect(notes).toContain("## What's new");
    expect(notes).toContain('## Upgrading');
    expect(notes).toContain('Node.js');
  });
});
