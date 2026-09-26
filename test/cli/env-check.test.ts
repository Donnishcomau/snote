import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { findOnPath, envReport } from '../../src/cli/env-check';
import { main } from '../../src/cli/main';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';

function only(...files: string[]): (file: string) => boolean {
  const set = new Set(files);
  return (f: string) => set.has(f);
}

describe('env-check', () => {
  let originalPath: string | undefined;

  beforeEach(() => {
    originalPath = process.env.PATH;
  });

  afterEach(() => {
    if (originalPath === undefined) {
      delete process.env.PATH;
    } else {
      process.env.PATH = originalPath;
    }
  });

  it('1: WHEN findOnPath(\'wl-copy\', \'/a:/b\', only(\'/b/wl-copy\')) is called THEN it returns /b/wl-copy; WHEN both /a/wl-copy and /b/wl-copy exist THEN it returns /a/wl-copy (first match wins)', () => {
    const a = findOnPath('wl-copy', '/a:/b', only('/b/wl-copy'));
    expect(a).toBe('/b/wl-copy');

    const b = findOnPath('wl-copy', '/a:/b', only('/a/wl-copy', '/b/wl-copy'));
    expect(b).toBe('/a/wl-copy');
  });

  it('2: WHEN findOnPath(\'wl-copy\', \'/a\', only(\'/b/wl-copy\')) and findOnPath(\'wl-copy\', undefined, only(\'/b/wl-copy\')) are called THEN each returns null; WHEN the path is \':\'/b\' THEN it returns /b/wl-copy', () => {
    expect(findOnPath('wl-copy', '/a', only('/b/wl-copy'))).toBeNull();
    expect(findOnPath('wl-copy', undefined, only('/b/wl-copy'))).toBeNull();
    expect(findOnPath('wl-copy', ':/b', only('/b/wl-copy'))).toBe('/b/wl-copy');
  });

  it('3: WHEN findOnPath(\'/opt/x/editor\', \'/a\', only(\'/opt/x/editor\')) is called THEN it returns /opt/x/editor; WHEN findOnPath(\'/opt/x/gone\', \'/a\', only(\'/a/opt/x/gone\')) is called THEN it returns null', () => {
    expect(findOnPath('/opt/x/editor', '/a', only('/opt/x/editor'))).toBe(
      '/opt/x/editor'
    );
    expect(findOnPath('/opt/x/gone', '/a', only('/a/opt/x/gone'))).toBeNull();
  });

  it('4: WHEN envReport({ EDITOR: \'code -w\', PATH: \'/a\' }, only(\'/a/code\')) is called THEN it returns exactly `ok       code: /a/code\\nmissing  wl-copy\\nmissing  omarchy-launch-tui`', () => {
    const result = envReport({ EDITOR: 'code -w', PATH: '/a' }, only('/a/code'));
    expect(result).toBe(
      'ok       code: /a/code\nmissing  wl-copy\nmissing  omarchy-launch-tui'
    );
  });

  it('5: WHEN envReport({ PATH: \'/a\' }, only(\'/a/nvim\', \'/a/wl-copy\')) is called, and again with EDITOR: \'   \' THEN each returns 3 lines, the first `ok       nvim: /a/nvim`, the second `ok       wl-copy: /a/wl-copy`, the third `missing  omarchy-launch-tui`', () => {
    const r1 = envReport({ PATH: '/a' }, only('/a/nvim', '/a/wl-copy'));
    expect(r1).toContain('ok       nvim: /a/nvim');
    expect(r1).toContain('ok       wl-copy: /a/wl-copy');
    expect(r1).toContain('missing  omarchy-launch-tui');
    expect(r1.split('\n')).toHaveLength(3);

    const r2 = envReport({ EDITOR: '   ', PATH: '/a' }, only('/a/nvim', '/a/wl-copy'));
    expect(r2).toContain('ok       wl-copy: /a/wl-copy');
    expect(r2.split('\n')).toHaveLength(3);
  });

  it("6: WHEN process.env.PATH is /nonexistent-snote and main(['--check', '--data-dir', dir], io) runs THEN it resolves 0 and the logged text contains `missing  wl-copy` and `missing  omarchy-launch-tui`, both after the `terminal: ` line", async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'snote-t60-'));
    try {
      process.env.PATH = '/nonexistent-snote';
      const logged: string[] = [];
      const io = { log: (text: string) => logged.push(text) };
      const code = await main(['--check', '--data-dir', dir], io);

      expect(code).toBe(0);
      const out = logged.join('\n');
      const terminalIdx = out.lastIndexOf('terminal: ');
      expect(terminalIdx).toBeGreaterThanOrEqual(0);
      const afterTerminal = out.substring(terminalIdx);
      expect(afterTerminal).toContain('missing  wl-copy');
      expect(afterTerminal).toContain('missing  omarchy-launch-tui');
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });
});
