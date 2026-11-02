/**
 * #97 (Linux only): in a real pseudo-terminal, a terminal editor gets every
 * key typed while it is open. Ink's suspend removes its listener but the
 * stream keeps reading; editInEditor pauses stdin before the child starts, so
 * snote's reader takes none of the keys. The probe (test/helpers/pty-stdin-probe.mjs)
 * runs the real src/core/editor.ts, bundled with esbuild, on a pty driven by
 * test/helpers/pty-stdin-drive.py.
 */
import { describe, it, expect, afterAll } from 'vitest';
import { build } from 'esbuild';
import { spawnSync } from 'node:child_process';
import { chmodSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const python = spawnSync('python3', ['-I', '-c', 'import pty'], { stdio: 'ignore' }).status === 0;
const enabled = process.platform === 'linux' && python;
const dir = mkdtempSync(join(tmpdir(), 'editor-pty-'));
afterAll(() => rmSync(dir, { recursive: true, force: true }));

describe.skipIf(!enabled)('#97 a terminal editor on a real pty keeps its keys', () => {
  it('1: WHEN 40 keys are typed on a pty while the editor `vi` reads them THEN the editor receives all 40 in order and snote\'s own reader receives none', async () => {
    const bundle = join(dir, 'editor.mjs');
    await build({
      entryPoints: [join(process.cwd(), 'src/core/editor.ts')],
      outfile: bundle,
      bundle: true,
      platform: 'node',
      format: 'esm',
      logLevel: 'silent',
      alias: { '@vendor': join(process.cwd(), 'vendor/simplenote') },
    });
    const bin = join(dir, 'bin');
    rmSync(bin, { recursive: true, force: true });
    spawnSync('mkdir', [bin]);
    const editor = join(bin, 'vi');
    writeFileSync(editor, '#!/bin/sh\nstty raw -echo\necho READY >&2\ndd bs=1 count=40 2>/dev/null | od -An -c >&2\nstty sane\nexit 0\n');
    chmodSync(editor, 0o755);
    const home = join(dir, 'home');
    const r = spawnSync(
      'python3',
      ['-I', join(process.cwd(), 'test/helpers/pty-stdin-drive.py'), process.execPath, join(process.cwd(), 'test/helpers/pty-stdin-probe.mjs'), bundle, editor],
      { encoding: 'utf8', timeout: 25000, env: { ...process.env, XDG_DATA_HOME: home, XDG_STATE_HOME: home, HOME: home } },
    );
    const shown = r.stdout.replace(/\s+/g, '');
    expect(shown).not.toContain('[snotegot');
    expect(shown).toContain('abcdefghijklmnopqrstuvwxyz0123456789ABCD');
  }, 40000);
});
