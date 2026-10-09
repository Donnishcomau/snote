// T400 — release 0.2.4: changelog, release notes and the version number.
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const read = (...parts: string[]) =>
  readFileSync(join(process.cwd(), ...parts), 'utf8');

describe('release 0.2.4', () => {
  it("1: WHEN package.json, manifest.json and package-lock.json are parsed THEN `version` (and `packages[''].version`) all equal `0.2.5`, and PKGBUILD contains `pkgver=0.2.5`.", () => {
    const pkg = JSON.parse(read('package.json')) as { version: string };
    const manifest = JSON.parse(read('manifest.json')) as { version: string };
    const lock = JSON.parse(read('package-lock.json')) as {
      version: string;
      packages: Record<string, { version?: string }>;
    };
    const pkgbuild = read('packaging', 'aur', 'PKGBUILD');
    expect(pkg.version).toBe('0.2.5');
    expect(manifest.version).toBe('0.2.5');
    expect(lock.version).toBe('0.2.5');
    expect(lock.packages[''].version).toBe('0.2.5');
    expect(pkgbuild).toContain('pkgver=0.2.5');
  });

  it("2: WHEN CHANGELOG.md is read THEN `## 0.2.4` comes before `## 0.2.3`, it contains no `## Unreleased`, and the text between `## 0.2.4` and `## 0.2.3` contains `SNOTE_UPDATE_CHECK=off`, `omarchy-restart-shell`, `--notify-new`, `inline code` and `### Fixed`.", () => {
    const changelog = read('CHANGELOG.md');
    const at024 = changelog.indexOf('## 0.2.4');
    const at023 = changelog.indexOf('## 0.2.3');
    expect(at024).toBeGreaterThanOrEqual(0);
    expect(at023).toBeGreaterThanOrEqual(0);
    expect(at024).toBeLessThan(at023);
    expect(changelog).not.toContain('## Unreleased');
    const between = changelog.slice(at024, at023);
    expect(between).toContain('SNOTE_UPDATE_CHECK=off');
    expect(between).toContain('omarchy-restart-shell');
    expect(between).toContain('--notify-new');
    expect(between).toContain('inline code');
    expect(between).toContain('### Fixed');
  });

  it("3: WHEN docs/release-notes-0.2.4.md is read THEN it starts with `# snote 0.2.4 release notes` and contains `## What's new`, `## Upgrading`, `## Thanks` and `omarchy-restart-shell`.", () => {
    const notes = read('docs', 'release-notes-0.2.4.md');
    expect(notes.startsWith('# snote 0.2.4 release notes')).toBe(true);
    expect(notes).toContain("## What's new");
    expect(notes).toContain('## Upgrading');
    expect(notes).toContain('## Thanks');
    expect(notes).toContain('omarchy-restart-shell');
  });
});
