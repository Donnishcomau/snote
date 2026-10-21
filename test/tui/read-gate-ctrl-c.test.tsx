/**
 * T538R-5 (F221, F222, the Ctrl+C path): the last per-read lines.
 *
 * Ink's own exit on Ctrl+C is off (src/cli/main.tsx); Root quits on Ctrl+C
 * through the read gate, and only from a read of Ctrl+C bytes alone. As a
 * later key of a read it quits nothing and ends the read. The gate keeps App's
 * role when the app first mounts below 20x7 (F221), dropped keys never reach
 * the key ring (F222), and the gate stays the only wrapper of an input emitter
 * or a stdin read in `src/`. Each `stdin.write` below is one read.
 */
import { describe, it, expect, vi, afterEach, type Mock } from 'vitest';
import { render } from 'ink-testing-library';
import * as os from 'node:os';
import * as path from 'node:path';
import * as fs from 'node:fs';
import React from 'react';

import { Root } from '../../src/tui/Root';
import { makeStore } from '../../src/core/store';
import { saveToken } from '../../src/core/token';
import { getKeyLog, resetKeyLog } from '../../src/tui/key-ring';
import { waitForFrame, waitForInput } from '../helpers/ink-waits';
import type { Store } from 'redux';
import type { State } from '../../src/core/store';
import type { EntityId } from '@vendor/types';

const eid = (id: string): EntityId => id as unknown as EntityId;
const settle = () => new Promise((res) => setTimeout(res, 200));
const dirs: string[] = [];

afterEach(() => {
  for (const d of dirs.splice(0)) fs.rmSync(d, { recursive: true, force: true });
});

/** Root with a saved token and note t1 `hello world`, at the given size. */
async function mount(width = 80, height = 24) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'read-gate-ctrl-c-'));
  dirs.push(dir);
  await saveToken(dir, { email: 'a@b.co', token: 'tok' });
  const store = makeStore({ stubClient: {} });
  store.dispatch({
    type: 'IMPORT_NOTE_WITH_ID',
    noteId: eid('t1'),
    note: { content: 'hello world', systemTags: [], tags: [], deleted: false, modificationDate: 2000, creationDate: 2000 },
  });
  const onQuit: Mock<() => void> = vi.fn();
  const r = render(
    <Root dataDir={dir} width={width} height={height} makeStoreFor={vi.fn(() => store as Store<State>)} requestCode={vi.fn()} completeLogin={vi.fn()} onQuit={onQuit} />,
  );
  const size = (cols: number, rows: number) => {
    Object.defineProperty(r.stdout, 'columns', { get: () => cols, configurable: true });
    Object.defineProperty(r.stdout, 'rows', { get: () => rows, configurable: true });
    r.stdout.emit('resize');
  };
  await waitForInput(r.stdin);
  const t1 = () => store.getState().data.notes.get(eid('t1'));
  const untouched = () => JSON.stringify(t1()?.systemTags) === '[]' && t1()?.deleted === false;
  return { ...r, size, onQuit, t1, untouched };
}

describe('T538R-5 Ctrl+C, resize and the key ring', () => {
  it('1: WHEN the list shows note t1 `hello world` and `\\x1b[B\\x03` arrives as one read THEN `onQuit` is called 0 times and the frame still contains `hello world`', async () => {
    const a = await mount();
    await waitForFrame(a.lastFrame, 'hello world');
    a.stdin.write('\x1b[B\x03');
    await settle();
    const frame = await waitForFrame(a.lastFrame, 'hello world');
    expect(a.onQuit).toHaveBeenCalledTimes(0);
    expect(frame).toContain('hello world');
  });

  it('2: WHEN the inline editor is open on t1 and `XY\\x1b[B\\x03` arrives as one read THEN `onQuit` is called 0 times and the frame contains `Ctrl+S save` and `hello worldXY`', async () => {
    const a = await mount();
    await waitForFrame(a.lastFrame, 'hello world');
    a.stdin.write('i');
    await waitForFrame(a.lastFrame, 'Ctrl+S save');
    a.stdin.write('XY\x1b[B\x03');
    await settle();
    const frame = await waitForFrame(a.lastFrame, (f) => f.includes('Ctrl+S save') && f.includes('hello worldXY'));
    expect(a.onQuit).toHaveBeenCalledTimes(0);
    expect(frame).toContain('Ctrl+S save');
    expect(frame).toContain('hello worldXY');
  });

  it('3: WHEN the list shows note t1 and `\\x03` arrives as a read of its own, then (fresh app) `\\x03\\x03` as one read (only Ctrl+C bytes) THEN `onQuit` is called 1 time in each app, and `src/cli/main.tsx` contains `exitOnCtrlC: false`; and (fresh app) a bracketed paste `\\x1b[200~\\x03\\x03\\x1b[201~` gives `onQuit` 0 times', async () => {
    for (const read of ['\x03', '\x03\x03']) {
      const a = await mount();
      await waitForFrame(a.lastFrame, 'hello world');
      a.stdin.write(read);
      await vi.waitFor(() => {
        if (a.onQuit.mock.calls.length !== 1) throw new Error('not quit yet');
      }, { timeout: 2000, interval: 10 });
      await settle();
      expect(a.onQuit).toHaveBeenCalledTimes(1);
      a.unmount();
    }
    expect(fs.readFileSync(path.join(__dirname, '../../src/cli/main.tsx'), 'utf8')).toContain('exitOnCtrlC: false');
    const p = await mount();
    const frame = await waitForFrame(p.lastFrame, 'hello world');
    p.stdin.write('\x1b[200~\x03\x03\x1b[201~');
    await settle();
    expect(p.onQuit).toHaveBeenCalledTimes(0);
    expect(frame).toContain('hello world');
  });

  it('4: WHEN Root starts at 15x5, is enlarged to 80x24 and `iPd` arrives as one read THEN the frame contains `Ctrl+S save` and `hello worldPd`, and t1 has system tags `[]` and deleted `false`', async () => {
    const a = await mount(15, 5);
    await waitForFrame(a.lastFrame, 'snote needs');
    a.size(80, 24);
    await waitForFrame(a.lastFrame, 'hello world');
    a.stdin.write('iPd');
    const frame = await waitForFrame(a.lastFrame, (f) => f.includes('Ctrl+S save') && f.includes('hello worldPd') && a.untouched());
    expect(frame).toContain('Ctrl+S save');
    expect(frame).toContain('hello worldPd');
    expect(a.t1()?.systemTags).toEqual([]);
    expect(a.t1()?.deleted).toBe(false);
  });

  it('5: WHEN the list shows note t1, `zx9kv` arrives as one read and then `j` as its own read THEN the key-ring inputs are exactly `["z","j"]`', async () => {
    const a = await mount();
    await waitForFrame(a.lastFrame, 'hello world');
    resetKeyLog();
    a.stdin.write('zx9kv');
    await settle();
    a.stdin.write('j');
    await vi.waitFor(() => {
      if (getKeyLog().at(-1)?.input !== 'j') throw new Error('j not recorded yet');
    }, { timeout: 2000, interval: 10 });
    expect(getKeyLog().map((e) => e.input)).toEqual(['z', 'j']);
  });

  it("6: WHEN every file under `src/` is read THEN only `src/tui/read-gate.ts` assigns an `emit` or `read` property (`.emit =`, `['emit'] =`, `defineProperty(…, 'emit'` and the same for `read`), except `src/core/simperium-removed-note-fix.ts`, whose only such line assigns `channel.emit =`", () => {
    const root = path.join(__dirname, '../../src');
    const files = (fs.readdirSync(root, { recursive: true }) as string[]).filter((f) => /\.tsx?$/.test(f));
    const assigns = /\.(emit|read)\s*=[^=]|\[['"](emit|read)['"]\]\s*=[^=]|defineProperty\([^)]*['"](emit|read)['"]/;
    const hits = files.flatMap((f) =>
      fs.readFileSync(path.join(root, f), 'utf8').split('\n').filter((l) => assigns.test(l)).map((l) => ({ f: f.split(path.sep).join('/'), l })),
    );
    const outside = hits.filter((h) => h.f !== 'tui/read-gate.ts');
    expect(hits.some((h) => h.f === 'tui/read-gate.ts')).toBe(true);
    expect(outside.map((h) => h.f)).toEqual(['core/simperium-removed-note-fix.ts']);
    expect(outside[0].l).toContain('channel.emit =');
  });
});
