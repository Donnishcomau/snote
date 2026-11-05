// Acceptance tests for after the switch to a pre-built payload
//, the bar widget no longer promises a build. Its user-visible
// texts describe an install that copies files, nothing in the widget
// names npm, node@22 or a build, and the check-then-setup flow that
// shows the missing-Node fix command in the visible terminal is intact.
import { describe, it, expect } from 'vitest';
import { cpSync, existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { sharedTier } from '../helpers/omarchy-pin';

const QML = join(process.cwd(), 'BarWidget.qml');
const MANIFEST = join(process.cwd(), 'manifest.json');

// #461: test 4 runs the PINNED `omarchy plugin validate` (test/fixtures/omarchy-pin.json) on every Linux host.
// A missing pin or jq throws from the helper; nothing here skips.

describe('BarWidget.qml + manifest.json: pre-built install wording', () => {
  it('1: WHEN BarWidget.qml is read as text THEN it contains `Click to install snote (copies the pre-built app, no build)` and contains none of `npm`, `node@22` and `rsync`', () => {
    const text = readFileSync(QML, 'utf8');
    expect(text).toContain('Click to install snote (copies the pre-built app, no build)');
    expect(text).not.toContain('npm');
    expect(text).not.toContain('node@22');
    expect(text).not.toContain('rsync');
  });

  it('2: WHEN manifest.json is parsed THEN its description contains `no build step` and is at most `500` characters long', () => {
    const manifest = JSON.parse(readFileSync(MANIFEST, 'utf8')) as { description: string };
    expect(manifest.description).toContain('no build step');
    expect(manifest.description.length).toBeLessThanOrEqual(500);
  });

  it('3: WHEN BarWidget.qml is read as text THEN it still contains `setup` and `--check`', () => {
    const text = readFileSync(QML, 'utf8');
    expect(text).toContain('setup');
    expect(text).toContain('--check');
  });

  it.skipIf(process.platform !== 'linux')('4: WHEN the pinned `omarchy plugin validate` runs THEN it exits 0 on this plugin directory', () => {
    // Validate a clean copy of the plugin files only: the repo root holds
    // node_modules/.bin symlinks, which the validator rejects.
    const dir = mkdtempSync(join(tmpdir(), 'snote-plugin-'));
    try {
      const files = [
        'manifest.json', 'BarWidget.qml', 'preview.png', 'snote-icon.png',
        'README.md', 'LICENSE', 'packaging/omarchy', 'plugin-dist',
      ];
      for (const f of files) {
        const src = join(process.cwd(), f);
        if (existsSync(src)) cpSync(src, join(dir, f), { recursive: true });
      }
      const tier = sharedTier();
      const result = spawnSync('omarchy', ['plugin', 'validate', dir], {
        encoding: 'utf8',
        env: tier.env(process.env.HOME ?? dir),
        timeout: 2500,
        killSignal: 'SIGKILL',
      });
      expect(result.status).toBe(0);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
