/**
 * #447: copying on macOS runs `/usr/bin/pbcopy` with the text on its stdin, never through a shell; Linux keeps
 * `wl-copy`. `snote --check` on macOS looks up that same `/usr/bin/pbcopy`, not a pbcopy on PATH. The spawn is replaced in-process; process.platform is set per test.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';

import { copyCommand, copyToClipboard } from '../../src/core/clipboard';
import { envReport } from '../../src/cli/env-check';
import { restorePlatform, setPlatform } from '../helpers/platform';

const spawned = vi.hoisted(() => ({ calls: [] as { file: string; args: string[]; opts: Record<string, unknown> }[] }));
vi.mock('node:child_process', async (orig) => {
  const real = await orig<typeof import('node:child_process')>();
  return {
    ...real,
    spawnSync: (file: string, args: string[], opts: Record<string, unknown>) => {
      spawned.calls.push({ file, args, opts });
      return { status: 0, signal: null };
    },
  };
});

const only = (...files: string[]) => (f: string): boolean => files.includes(f);
const HOSTILE = 'https://app.simplenote.com/p/abc $(touch /tmp/pwn); rm -rf ~ `id` | cat\n\u001b]52;c;eA==\u0007';

afterEach(() => {
  restorePlatform();
  spawned.calls = [];
});

describe('#447 macOS clipboard through pbcopy', () => {
  it('1: WHEN copyCommand is asked for `darwin`, `linux` and `freebsd` THEN it answers `["/usr/bin/pbcopy"]`, `["wl-copy"]` and `["wl-copy"]`', () => {
    expect([copyCommand('darwin'), copyCommand('linux'), copyCommand('freebsd')]).toEqual([['/usr/bin/pbcopy'], ['wl-copy'], ['wl-copy']]);
  });

  it('2: WHEN process.platform is `darwin` and copyToClipboard(<hostile link holding `$(...)`, `;`, a backtick, a pipe, a newline and an OSC 52 sequence>) is called with no command THEN it returns true and spawned exactly `/usr/bin/pbcopy` with no arguments, the text byte-for-byte as `input`, and no `shell` option', () => {
    setPlatform('darwin');
    expect(copyToClipboard(HOSTILE)).toBe(true);
    const c = spawned.calls;
    expect([c.length, c[0]?.file, c[0]?.args, c[0]?.opts.input, c[0]?.opts.shell]).toEqual([1, '/usr/bin/pbcopy', [], HOSTILE, undefined]);
  });

  it('3: WHEN process.platform is `linux` and copyToClipboard(<the same text>) is called with no command THEN it spawned exactly `wl-copy` with no arguments and the text as `input`', () => {
    setPlatform('linux');
    copyToClipboard(HOSTILE);
    expect([spawned.calls[0]?.file, spawned.calls[0]?.args, spawned.calls[0]?.opts.input]).toEqual(['wl-copy', [], HOSTILE]);
  });

  it("4: WHEN envReport({ PATH: '/a' }, ...) runs for `darwin` with `/a/nvim` and `/usr/bin/pbcopy` present, and again with `/a/nvim` and `/a/pbcopy` only (a pbcopy on PATH that the copy never runs) THEN it returns exactly `ok       nvim: /a/nvim` + `ok       pbcopy: /usr/bin/pbcopy`, then `ok       nvim: /a/nvim` + `optional pbcopy: not found (copies a note to the clipboard)`, with no wl-copy or omarchy-launch-tui line", () => {
    expect(envReport({ PATH: '/a' }, only('/a/nvim', '/usr/bin/pbcopy'), 'darwin')).toBe('ok       nvim: /a/nvim\nok       pbcopy: /usr/bin/pbcopy');
    expect(envReport({ PATH: '/a' }, only('/a/nvim', '/a/pbcopy'), 'darwin')).toBe('ok       nvim: /a/nvim\noptional pbcopy: not found (copies a note to the clipboard)');
  });
});
