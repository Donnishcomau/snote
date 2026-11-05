import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render } from 'ink-testing-library';
import { render as inkRender } from 'ink';
import { PassThrough } from 'node:stream';
import * as os from 'node:os';
import * as path from 'node:path';
import * as fs from 'node:fs';
import React from 'react';

import { Root } from '../../src/tui/Root';
import { makeStore } from '../../src/core/store';
import { saveToken } from '../../src/core/token';
import { waitForFrame, waitForInput } from '../helpers/ink-waits';
import type { Store } from 'redux';
import type { State } from '../../src/core/store';
import { createRequire } from 'node:module';
import { pathToFileURL } from 'node:url';

const ESC = String.fromCharCode(27);
const SGR = new RegExp(`${ESC}\\[[0-9;:]*m`, 'g');
const plain = (s: string): string => s.replace(SGR, '');
const rows = (f: string): string[] => f.split('\n');
/** Ink's own chalk at level 3 for one test, so colour codes show in the frame (as test/tui/heading-bar.test.tsx does). */
async function chalkOn(): Promise<() => void> {
  const inkDir = path.dirname(createRequire(import.meta.url).resolve('ink'));
  const chalk = (await import(pathToFileURL(path.join(inkDir, '..', 'node_modules', 'chalk', 'source', 'index.js')).href)).default;
  const saved = chalk.level;
  chalk.level = 3;
  return () => { chalk.level = saved; };
}
const requestCode = vi.fn().mockResolvedValue(undefined);
const completeLogin = vi.fn().mockResolvedValue('tok');

function seed(): Store<State> {
  const s = makeStore({ stubClient: {} });
  s.dispatch({
    type: 'CREATE_NOTE_WITH_ID',
    noteId: 'n1' as never,
    note: { content: 'First note', systemTags: [], tags: [], modificationDate: 1 },
  });
  return s as Store<State>;
}

describe('#134 the header row shows the snote mark', () => {
  let dir: string;

  beforeEach(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'snote-header-'));
  });

  afterEach(() => {
    fs.rmSync(dir, { recursive: true, force: true });
  });

  const tree = (width: number, height: number, store = seed()): React.ReactElement => (
    <Root dataDir={dir} width={width} height={height} makeStoreFor={vi.fn(() => store)}
      requestCode={requestCode} completeLogin={completeLogin} />
  );
  const mount = async (width: number, height: number, token = true) => {
    if (token) await saveToken(dir, { email: 'a@b.co', token: 'tok' });
    return render(tree(width, height));
  };

  it('1: WHEN Root shows the main screen at 80x24 THEN row 1 is `>_ snote` with `>_` in blue (SGR 34) and `snote` bold (SGR 1), and the frame shows `First note`', async () => {
    const restore = await chalkOn();
    try {
      const r = await mount(80, 24);
      const f = await waitForFrame(r.lastFrame, (x) => x.includes('First note') && plain(rows(x)[0]).trimEnd() === '>_ snote');
      const top = rows(f)[0];
      expect(plain(top).trimEnd()).toBe('>_ snote');
      expect(top).toContain(`${ESC}[34m>_`);
      expect(top).toContain(`${ESC}[1m snote`);
      r.unmount();
    } finally {
      restore();
    }
  });

  it('2: WHEN Root shows the main screen at 80x24 and at 40x8 THEN the frame has exactly 24 and 8 rows, row 1 is `>_ snote` in both', async () => {
    for (const [w, h] of [[80, 24], [40, 8]] as const) {
      const r = await mount(w, h);
      const f = await waitForFrame(r.lastFrame, (x) => x.includes('First note') && plain(rows(x)[0]).trimEnd() === '>_ snote');
      expect(rows(f).length).toBe(h);
      expect(plain(rows(f)[0]).trimEnd()).toBe('>_ snote');
      r.unmount();
    }
  });

  it('3: WHEN Root shows the main screen at 80x7 THEN no row is `>_ snote`, the frame shows `First note` and has at most 7 rows', async () => {
    const r = await mount(80, 7);
    const f = await waitForFrame(r.lastFrame, 'First note');
    expect(rows(f).map((l) => plain(l).trimEnd())).not.toContain('>_ snote');
    expect(rows(f).length).toBeLessThanOrEqual(7);
    r.unmount();
  });

  it('4: WHEN `?` opens Help at 80x24 THEN row 1 is still `>_ snote` and the frame shows `Help - Keyboard Shortcuts`', async () => {
    const r = await mount(80, 24);
    await waitForFrame(r.lastFrame, 'First note');
    await waitForInput(r.stdin);
    r.stdin.write('?');
    const f = await waitForFrame(r.lastFrame, 'Help - Keyboard Shortcuts');
    expect(plain(rows(f)[0]).trimEnd()).toBe('>_ snote');
    r.unmount();
  });

  it('5: WHEN no token is saved and the login screen shows THEN the frame shows `Email` and no `>_ snote`', async () => {
    const r = await mount(80, 24, false);
    const f = await waitForFrame(r.lastFrame, 'Email');
    expect(plain(f)).not.toContain('>_ snote');
    r.unmount();
  });

  it('6: WHEN Root runs through Ink with `isScreenReaderEnabled: true` at 80x24 THEN row 1 of the app frame is exactly `snote` and the output has no `>_` and no SGR code', async () => {
    await saveToken(dir, { email: 'a@b.co', token: 'tok' });
    const stdout = new PassThrough();
    Object.assign(stdout, { columns: 80, rows: 24, isTTY: false });
    const chunks: string[] = [];
    stdout.on('data', (c: Buffer) => chunks.push(c.toString()));
    const stdin = Object.assign(new PassThrough(), { isTTY: true, setRawMode: () => undefined, ref: () => undefined, unref: () => undefined });
    const app = inkRender(tree(80, 24), {
      stdout: stdout as never, stdin: stdin as never, debug: true,
      patchConsole: false, exitOnCtrlC: false, isScreenReaderEnabled: true,
    });
    try {
      await vi.waitFor(() => { if (!chunks.join('').includes('First note')) throw new Error('no app frame yet'); }, { timeout: 2000, interval: 10 });
    } finally {
      app.unmount();
    }
    const out = chunks.join('');
    const frame = chunks.filter((c) => c.includes('First note')).pop() ?? '';
    expect(frame.split('\n')[0].trim()).toBe('snote');
    expect(out).not.toContain('>_');
    expect(out).not.toMatch(SGR);
  });

  it('7: WHEN src/tui/HeaderBar.tsx is read THEN it declares `export function HeaderBar(): ` (no props) and imports nothing from `../core` or `./useAppState`', () => {
    const src = fs.readFileSync(path.join(__dirname, '../../src/tui/HeaderBar.tsx'), 'utf8');
    expect(src).toContain('export function HeaderBar(): ');
    expect(src).not.toMatch(/from '\.\.\/core|from '\.\/useAppState'/);
  });
});
