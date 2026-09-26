/**
 * T33: snote entry — flags, synced store, first screen.
 */
import { describe, it, expect, beforeEach, afterAll } from 'vitest';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';

import { main } from '../../src/cli/main';
import { saveToken, loadToken } from '../../src/core/token';

const EDITOR_KEY = 'EDITOR';

describe('T33 main', () => {
  let dir: string;
  let logged: string[];
  let io: { log: (text: string) => void };
  const originalEditor = process.env[EDITOR_KEY];

  beforeEach(() => {
    // OMARCHY: remove the previous dir first so no fresh `snote-` entry ever
    // lingers in os.tmpdir() while other suites snapshot it.
    if (dir) fs.rmSync(dir, { recursive: true, force: true });
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'snote-t33-'));
    logged = [];
    io = { log: (text) => logged.push(text) };
  });

  afterEach(() => {
    if (originalEditor === undefined) {
      delete process.env[EDITOR_KEY];
    } else {
      process.env[EDITOR_KEY] = originalEditor;
    }
  });

  afterAll(() => {
    if (dir) fs.rmSync(dir, { recursive: true, force: true });
  });

  it("1: WHEN process.env.EDITOR is myed and main(['--check', '--data-dir', dir], io) runs THEN it resolves 0, logged.join('\\n') contains `editor: myed`, the text `data dir: ` followed by dir, and `terminal: `, and fs.readdirSync(dir) is still empty", async () => {
    process.env[EDITOR_KEY] = 'myed';

    const code = await main(['--check', '--data-dir', dir], io);

    expect(code).toBe(0);
    const out = logged.join('\n');
    expect(out).toContain('editor: myed');
    expect(out).toContain(`data dir: ${dir}`);
    expect(out).toContain('terminal: ');
    expect(fs.readdirSync(dir)).toEqual([]);
  });

  it("2: WHEN main(['--help'], io) runs THEN it resolves 0, logged has exactly 1 entry, and it starts with `usage: snote [options]`", async () => {
    const code = await main(['--help'], io);

    expect(code).toBe(0);
    expect(logged).toHaveLength(1);
    expect(logged[0].startsWith('usage: snote [options]')).toBe(true);
  });

  it("3: WHEN dir holds a saved token (a@b.co, tok) and a file state.json, and main(['--logout', '--data-dir', dir], io) runs THEN it resolves 0, await loadToken(dir) is null, fs.readdirSync(dir) is empty and logged contains `logged out`", async () => {
    await saveToken(dir, { email: 'a@b.co', token: 'tok' });
    fs.writeFileSync(path.join(dir, 'state.json'), 'state');

    const code = await main(['--logout', '--data-dir', dir], io);

    expect(code).toBe(0);
    expect(await loadToken(dir)).toBeNull();
    expect(fs.readdirSync(dir)).toEqual([]);
    expect(logged).toContain('logged out');
  });

  it("4: WHEN main(['--nope'], io) runs THEN it resolves 2 (it does not reject), one logged entry starts with `error:` and contains `--nope`, and another contains `usage: snote`", async () => {
    const code = await main(['--nope'], io);

    expect(code).toBe(2);
    expect(logged.some((l) => l.startsWith('error:') && l.includes('--nope'))).toBe(
      true
    );
    expect(logged.some((l) => l.includes('usage: snote'))).toBe(true);
  });

  it("5: WHEN main(['--help', '--check', '--logout', '--data-dir', dir], io) runs with a saved token in dir THEN only the usage text is logged and await loadToken(dir) still has token tok", async () => {
    await saveToken(dir, { email: 'a@b.co', token: 'tok' });

    const code = await main(
      ['--help', '--check', '--logout', '--data-dir', dir],
      io
    );

    expect(code).toBe(0);
    expect(logged).toHaveLength(1);
    expect(logged[0].startsWith('usage: snote [options]')).toBe(true);
    expect((await loadToken(dir))?.token).toBe('tok');
  });
});
