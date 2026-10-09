import { describe, it, expect, beforeEach, afterEach, vi, type Mock } from 'vitest';
import { render } from 'ink-testing-library';
import * as os from 'node:os';
import * as path from 'node:path';
import * as fs from 'node:fs';
import React from 'react';

import { Root } from '../../src/tui/Root';
import { makeStore } from '../../src/core/store';
import { saveToken, loadToken } from '../../src/core/token';
import { waitForFrame, waitForInput } from '../helpers/ink-waits';
import type { Store } from 'redux';
import type { State } from '../../src/core/store';

const MSG = 'snote needs at least 20x7 — make the window bigger';
const requestCode = vi.fn().mockResolvedValue(undefined);
const completeLogin = vi.fn().mockResolvedValue('tok');

function seed(): ReturnType<typeof makeStore> {
  const s = makeStore({ stubClient: {} });
  s.dispatch({
    type: 'CREATE_NOTE_WITH_ID',
    noteId: 'n1' as never,
    note: { content: 'Second note', systemTags: [], tags: [], modificationDate: 1 },
  });
  s.dispatch({
    type: 'CREATE_NOTE_WITH_ID',
    noteId: 'n2' as never,
    note: { content: 'First note', systemTags: [], tags: [], modificationDate: 2 },
  });
  return s;
}

const lines = (f: string | undefined): string[] => (f ?? '').split('\n');

describe('T459 too small window', () => {
  let dir: string;
  let store: ReturnType<typeof makeStore>;
  let onQuit: Mock<() => void>;
  const editorBefore = process.env.SNOTE_EDITOR;

  beforeEach(async () => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'snote-toosmall-'));
    store = seed();
    onQuit = vi.fn<() => void>();
  });

  afterEach(() => {
    if (editorBefore === undefined) delete process.env.SNOTE_EDITOR;
    else process.env.SNOTE_EDITOR = editorBefore;
    fs.rmSync(dir, { recursive: true, force: true });
  });

  const mount = async (opts: { token?: boolean; startNew?: boolean } = {}) => {
    if (opts.token !== false) await saveToken(dir, { email: 'a@b.co', token: 'tok' });
    const r = render(
      <Root
        dataDir={dir}
        width={120}
        height={32}
        makeStoreFor={vi.fn(() => store as Store<State>)}
        requestCode={requestCode}
        completeLogin={completeLogin}
        onQuit={onQuit}
        startNew={opts.startNew}
      />,
    );
    const size = (cols: number, rows: number) => {
      Object.defineProperty(r.stdout, 'columns', { get: () => cols, configurable: true });
      Object.defineProperty(r.stdout, 'rows', { get: () => rows, configurable: true });
      r.stdout.emit('resize');
    };
    return { ...r, size };
  };

  const contents = (): string[] =>
    [...store.getState().data.notes.values()].map((n) => (n as { content: string }).content);
  const anyDeleted = (): boolean =>
    [...store.getState().data.notes.values()].some((n) => (n as { deleted?: boolean }).deleted);

  it('1: WHEN APP is resized to 120x6 THEN within 1 s the frame contains `snote needs at least 20x7 — make the window bigger` and no `│`; at 20x7 it contains `First note` and no `snote needs`.', async () => {
    const { lastFrame, size, unmount } = await mount();
    size(120, 32);
    await waitForFrame(lastFrame, 'First note');
    size(120, 6);
    const small = await waitForFrame(lastFrame, MSG, 1000);
    expect(small).toContain(MSG);
    expect(small).not.toContain('│');
    size(20, 7);
    const ok = await waitForFrame(
      lastFrame,
      (f) => f.includes('First note') && !f.includes('snote needs'),
      1000,
    );
    expect(ok).toContain('First note');
    expect(ok).not.toContain('snote needs');
    unmount();
  });

  it('2: WHEN `i`, `Z`, `Q` are typed, APP goes to 15x5, `d`, `x`, Ctrl+S are written and back to 120x32 THEN within 1 s the frame has `First noteZQ`, not `ZQx`, and the store holds `First note`, none deleted.', async () => {
    const { lastFrame, stdin, size, unmount } = await mount();
    size(120, 32);
    await waitForFrame(lastFrame, 'First note');
    await waitForInput(stdin);
    stdin.write('i');
    await waitForFrame(lastFrame, 'Ctrl+S save');
    stdin.write('Z');
    await waitForFrame(lastFrame, 'First noteZ');
    stdin.write('Q');
    await waitForFrame(lastFrame, 'First noteZQ');
    size(15, 5);
    await waitForFrame(lastFrame, 'snote needs');
    stdin.write('d');
    stdin.write('x');
    stdin.write('\x13');
    size(120, 32);
    const f = await waitForFrame(
      lastFrame,
      (fr) => fr.includes('First noteZQ') && !fr.includes('ZQx'),
      1000,
    );
    expect(f).toContain('First noteZQ');
    expect(f).not.toContain('ZQx');
    expect(contents()).toContain('First note');
    expect(anyDeleted()).toBe(false);
    unmount();
  });

  it('3: WHEN `/` and `Sec` are typed at 120x32, APP goes to 15x5, `d` and Enter are written and it goes back to 120x32 THEN within 1 s the frame equals the frame before the shrink and contains `Sec`.', async () => {
    const { lastFrame, stdin, size, unmount } = await mount();
    size(120, 32);
    await waitForFrame(lastFrame, 'First note');
    await waitForInput(stdin);
    stdin.write('/');
    await waitForFrame(lastFrame, 'search');
    stdin.write('Sec');
    const before = await waitForFrame(
      lastFrame,
      (f) => f.includes('Sec') && !f.includes('First note'),
    );
    size(15, 5);
    await waitForFrame(lastFrame, 'snote needs');
    stdin.write('d');
    stdin.write('\r');
    size(120, 32);
    const after = await waitForFrame(lastFrame, (f) => f === before && f.includes('Sec'), 1000);
    expect(after).toBe(before);
    expect(after).toContain('Sec');
    unmount();
  });

  it('4: WHEN APP is at 15x5 and `d`, `D`, `L`, `y`, `x`, then `q` are written THEN each frame has at most `5` lines of at most `15` characters, `onQuit` was called `1` time, no note is deleted, and the token is still saved.', async () => {
    const { lastFrame, frames, stdin, size, unmount } = await mount();
    size(120, 32);
    await waitForFrame(lastFrame, 'First note');
    await waitForInput(stdin);
    size(15, 5);
    await waitForFrame(lastFrame, 'snote needs');
    const from = frames.length - 1;
    for (const k of ['d', 'D', 'L', 'y', 'x', 'q']) stdin.write(k);
    await vi.waitFor(() => expect(onQuit).toHaveBeenCalledTimes(1), { timeout: 1000 });
    const seen = frames.slice(from);
    expect(seen.length).toBeGreaterThan(0);
    for (const f of seen) {
      expect(lines(f).length).toBeLessThanOrEqual(5);
      for (const l of lines(f)) expect(l.length).toBeLessThanOrEqual(15);
    }
    expect(onQuit).toHaveBeenCalledTimes(1);
    expect(anyDeleted()).toBe(false);
    expect(contents().length).toBe(2);
    expect(await loadToken(dir)).not.toBeNull();
    unmount();
  });

  it('5: WHEN APP starts with `startNew` and the fake editor, the note count reaches `3`, then 15x5, 120x32 and 300 ms pass THEN the count file holds exactly `x\\n` and the note count is still `3`.', async () => {
    const count = path.join(dir, 'count');
    const script = path.join(dir, 'fake-editor.sh');
    fs.writeFileSync(script, `#!/bin/sh\necho x >> "${count}"\nprintf 'Brand new' > "$1"\n`, {
      mode: 0o755,
    });
    process.env.SNOTE_EDITOR = script;
    const { lastFrame, size, unmount } = await mount({ startNew: true });
    size(120, 32);
    await vi.waitFor(() => expect(store.getState().data.notes.size).toBe(3), { timeout: 2000 });
    size(15, 5);
    await waitForFrame(lastFrame, 'snote needs');
    size(120, 32);
    await new Promise((r) => setTimeout(r, 300));
    expect(fs.readFileSync(count, 'utf8')).toBe('x\n');
    expect(store.getState().data.notes.size).toBe(3);
    unmount();
  });

  it('6: WHEN no token is saved, `a@b` is typed at the login screen and Root goes to 19x24, then 10x3, then 20x7 THEN it shows `snote needs at` without `Email:`, then at most `3` lines of at most `10`, then `a@b`.', async () => {
    const { lastFrame, stdin, size, unmount } = await mount({ token: false });
    size(120, 32);
    await waitForFrame(lastFrame, 'Email');
    await waitForInput(stdin);
    stdin.write('a@b');
    await waitForFrame(lastFrame, 'a@b');
    size(19, 24);
    const a = await waitForFrame(
      lastFrame,
      (f) => f.includes('snote needs at') && !f.includes('Email:'),
      1000,
    );
    expect(a).toContain('snote needs at');
    expect(a).not.toContain('Email:');
    size(10, 3);
    const b = await waitForFrame(
      lastFrame,
      (f) => lines(f).length <= 3 && lines(f).every((l) => l.length <= 10) && f.includes('snote'),
      1000,
    );
    expect(lines(b).length).toBeLessThanOrEqual(3);
    for (const l of lines(b)) expect(l.length).toBeLessThanOrEqual(10);
    size(20, 7);
    const c = await waitForFrame(lastFrame, 'a@b', 1000);
    expect(c).toContain('a@b');
    unmount();
  });

  it('7: WHEN `i` and `UNSAVED` are typed in the inline editor, APP goes to 15x5 and `q` is written THEN `onQuit` is called `0` times, and back at 120x32 the frame contains `UNSAVED`; test 4 pins `q` quitting with no editor open.', async () => {
    const { lastFrame, stdin, size, unmount } = await mount();
    size(120, 32);
    await waitForFrame(lastFrame, 'First note');
    await waitForInput(stdin);
    stdin.write('i');
    await waitForFrame(lastFrame, 'Ctrl+S save');
    stdin.write('UNSAVED');
    await waitForFrame(lastFrame, 'First noteUNSAVED');
    size(15, 5);
    await waitForFrame(lastFrame, 'snote needs');
    stdin.write('q');
    stdin.write('\x1b');
    size(120, 32);
    const f = await waitForFrame(lastFrame, 'First noteUNSAVED', 1000);
    expect(f).toContain('UNSAVED');
    expect(onQuit).toHaveBeenCalledTimes(0);
    unmount();
  });
});
