/**
 * #401 — the quit step with nothing pending, its printed line, and how
 * main.tsx calls it.
 */
import { describe, it, expect, afterEach } from 'vitest';
import { mkdtempSync, rmSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

import { FakeSimperiumServer } from '../fake-simperium/server';
import { buildStore } from '../../src/cli/main';
import { pendingCount } from '../../src/core/simperium-reducer';
import { sendBeforeQuit, unsentLine } from '../../src/core/quit-send';

const APP_ID = 'test-app';
const TOKEN = 'store1-token';
const EMAIL = 'store1@example.com';
const BASE = 'line1\nline2';

type Built = ReturnType<typeof buildStore>;
const cleanups: Array<() => void> = [];

afterEach(() => {
  for (const c of cleanups.splice(0).reverse()) c();
});

async function waitFor(cond: () => boolean, timeoutMs: number, label: string): Promise<void> {
  const start = Date.now();
  while (!cond()) {
    if (Date.now() - start > timeoutMs) throw new Error(`timed out (${timeoutMs} ms): ${label}`);
    await new Promise((r) => setTimeout(r, 10));
  }
}

describe('#401 quit step: nothing pending, the line, the call in main', () => {
  it('5: WHEN nothing is pending (a synced n1, no edit) and sendBeforeQuit is called THEN it resolves to `0` within `50` ms and no frame of any kind naming n1 is received by the server after the call; and unsentLine(`0`) is the empty string', async () => {
    const server = new FakeSimperiumServer();
    await server.start();
    cleanups.push(() => server.stop());
    server.seedBucket(APP_ID, 'note', [
      { id: 'n1', data: { content: BASE, creationDate: 1000, deleted: false, modificationDate: 2000, systemTags: [], tags: [] }, version: 1 },
    ]);
    const dir = mkdtempSync(join(tmpdir(), 'snote-401-core-'));
    cleanups.push(() => rmSync(dir, { recursive: true, force: true }));
    const b: Built = buildStore({ dataDir: dir, appId: APP_ID, server: server.url }, { email: EMAIL, token: TOKEN }, () => {});
    cleanups.push(() => {
      b.stopSaving();
      (b.store.client as { end?: () => void } | undefined)?.end?.();
      b.store.stopSync?.();
    });
    await waitFor(
      () =>
        b.store.getState().data.notes.get('n1' as never)?.content === BASE &&
        pendingCount(b.store.getState().simperium) === 0 &&
        (b.store as unknown as Record<symbol, unknown>)[Symbol.for('snote.noteCatchUpApplied')] === true,
      2500,
      'n1 synced and the catch-up applied'
    );
    const from = server.received.length;
    const start = Date.now();
    const result = await sendBeforeQuit(b.store, 2000);
    const ms = Date.now() - start;
    // A round trip after the call: forceSync asks every bucket for its
    // changes, so once the note channel's `cv:` request is in, every frame
    // the quit step could have sent before it is in too.
    b.store.forceSync?.();
    await waitFor(() => server.received.slice(from).some((m) => m.startsWith('0:cv:')), 2000, 'the note channel cv request after the call');
    expect(result).toBe(0);
    expect(ms).toBeLessThanOrEqual(50);
    expect(server.received.slice(from).filter((m) => m.includes('"n1"'))).toEqual([]);
    expect(unsentLine(0)).toBe('');
  });

  it('7: WHEN unsentLine is called with `1` and with `2` THEN it returns exactly `1 change not sent yet: it is kept on this computer and sent the next time snote starts` and `2 changes not sent yet: they are kept on this computer and sent the next time snote starts`', () => {
    expect(unsentLine(1)).toBe('1 change not sent yet: it is kept on this computer and sent the next time snote starts');
    expect(unsentLine(2)).toBe('2 changes not sent yet: they are kept on this computer and sent the next time snote starts');
  });

  it('8: WHEN src/cli/main.tsx is read THEN it contains `await sendBeforeQuit(` exactly `1` time, after the last `await waitUntilExit()` and before the last `stopSaving();`, and `unsentLine(` appears only inside a `log(` call', () => {
    const src = readFileSync(join(__dirname, '../../src/cli/main.tsx'), 'utf8');
    const calls = src.split('await sendBeforeQuit(').length - 1;
    expect(calls).toBe(1);
    const at = src.indexOf('await sendBeforeQuit(');
    expect(at).toBeGreaterThan(src.lastIndexOf('await waitUntilExit()'));
    expect(at).toBeLessThan(src.lastIndexOf('stopSaving();'));
    const uses = [...src.matchAll(/unsentLine\(/g)].map((m) => m.index!);
    expect(uses.length).toBeGreaterThan(0);
    for (const i of uses) expect(src.slice(i - 'log('.length, i)).toBe('log(');
  });
});
