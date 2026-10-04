/**
 * T360: snote --new is accepted on the command line and listed in --help.
 */
import { describe, it, expect, beforeEach, afterAll } from 'vitest';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';

import { main } from '../../src/cli/main';
import { splitNewFlag, USAGE } from '../../src/cli/args';

describe('T360 --new flag', () => {
  let dir: string;
  let logged: string[];
  let io: { log: (text: string) => void };

  beforeEach(() => {
    // Remove the previous dir first so no fresh `snote-` entry ever lingers
    // in os.tmpdir() while other suites snapshot it.
    if (dir) fs.rmSync(dir, { recursive: true, force: true });
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'snote-t360-'));
    logged = [];
    io = { log: (text) => logged.push(text) };
  });

  afterAll(() => {
    if (dir) fs.rmSync(dir, { recursive: true, force: true });
  });

  it('1: WHEN splitNewFlag([\'--new\']) is called THEN it returns `{ args: [], startNew: true }`', () => {
    expect(splitNewFlag(['--new'])).toEqual({ args: [], startNew: true });
  });

  it("2: WHEN splitNewFlag(['--data-dir', '/x', '--new', '--check']) runs THEN it returns `{ args: ['--data-dir', '/x', '--check'], startNew: true }`; `['--check']` gives `startNew: false`", () => {
    expect(splitNewFlag(['--data-dir', '/x', '--new', '--check'])).toEqual({
      args: ['--data-dir', '/x', '--check'],
      startNew: true,
    });
    expect(splitNewFlag(['--check']).startNew).toBe(false);
  });

  it("3: WHEN main(['--new', '--check', '--data-dir', dir], io) runs THEN it resolves `0`, the log contains `editor:`, and `fs.readdirSync(dir)` is still empty", async () => {
    const code = await main(['--new', '--check', '--data-dir', dir], io);

    expect(code).toBe(0);
    expect(logged.join('\n')).toContain('editor:');
    expect(fs.readdirSync(dir)).toEqual([]);
  });

  it("4: WHEN main(['--new', '--help'], io) runs THEN it resolves `0`, exactly 1 entry is logged, it starts with `usage: snote [options]` and contains `--new`", async () => {
    const code = await main(['--new', '--help'], io);

    expect(code).toBe(0);
    expect(logged).toHaveLength(1);
    expect(logged[0].startsWith('usage: snote [options]')).toBe(true);
    expect(logged[0]).toContain('--new');
  });

  it('5: WHEN USAGE is read THEN it contains the exact line `  --new            Open the editor for a new note at start`', () => {
    expect(USAGE).toContain(
      '  --new            Open the editor for a new note at start',
    );
  });
});
