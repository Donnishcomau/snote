/**
 * #618 (lane 4c): a note written in the inline editor with SNOTE_NEW_NOTE_EDITOR=inline is there after a kill.
 * The kill is simulated at the disk level as in test/integration/inline-autosave-restart.test.tsx: once state.json
 * holds the text the data dir is copied (what a SIGKILL leaves behind), the server stops taking change frames from the
 * dying process, and the restart runs on the copy.
 */
import { describe, it, expect, afterEach, beforeEach, vi } from 'vitest';
import { render } from 'ink-testing-library';
import { EventEmitter } from 'node:events';
import { cpSync, existsSync, mkdtempSync, rmSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import React from 'react';

import { FakeSimperiumServer } from '../fake-simperium/server';
import { buildStore } from '../../src/cli/main';
import { pendingCount } from '../../src/core/simperium-reducer';
import { flushOnSignal } from '../../src/core/signal-flush';
import { App } from '../../src/tui/App';
import { waitForFrame, waitForInput } from '../helpers/ink-waits';

const APP_ID = 'test-app';
const FOOTER = 'Autosaves · Esc close · Ctrl+S save now';
type Built = ReturnType<typeof buildStore>;

const cleanups: (() => void)[] = [];
beforeEach(() => vi.stubEnv('SNOTE_NEW_NOTE_EDITOR', 'inline'));
afterEach(() => {
  vi.unstubAllEnvs();
  for (const c of cleanups.splice(0).reverse()) c();
});

const stateNotes = (dir: string): [string, { content?: string }][] => {
  try {
    const state = JSON.parse(readFileSync(join(dir, 'state.json'), 'utf8')) as { data?: { notes?: { __map?: [string, { content?: string }][] } } };
    return state.data?.notes?.__map ?? [];
  } catch {
    return [];
  }
};

describe('#618 4c: an inline new note survives a kill', () => {
  it('1: WHEN `n` is pressed in the App on a buildStore store, `MK` is typed and stored by the autosave, state.json holds it, and snote is killed (data dir copied, server ignores change frames) and restarts on the copy THEN the restarted store holds exactly one note `MK` and the server holds that note id with `MK`, pendingCount 0', async () => {
    const server = new FakeSimperiumServer();
    await server.start();
    server.seedBucket(APP_ID, 'note', []);
    cleanups.push(() => server.stop());
    const priv = server as unknown as Record<string, (...args: unknown[]) => void>;
    const real = priv.handleChange.bind(server);
    let ignore = false;
    priv.handleChange = (...args: unknown[]) => { if (!ignore) real(...args); };
    const dir = mkdtempSync(join(tmpdir(), 'snote-618b-'));
    const killed = mkdtempSync(join(tmpdir(), 'snote-618b-k-'));
    cleanups.push(() => rmSync(dir, { recursive: true, force: true }), () => rmSync(killed, { recursive: true, force: true }));
    const open = (d: string, delay?: number): Built => {
      const b = buildStore({ dataDir: d, appId: APP_ID, server: server.url, noteEditDelayMs: delay }, { email: 'store1@example.com', token: 'store1-token' }, () => {});
      cleanups.push(() => close(b));
      return b;
    };
    const close = (b: Built): void => {
      b.stopSaving();
      (b.store.client as unknown as { end?: () => void })?.end?.();
      b.store.stopSync?.();
    };
    const a = open(dir);
    const r = render(<App store={a.store} width={80} height={24} />);
    cleanups.push(r.unmount);
    await waitForInput(r.stdin);
    r.stdin.write('n');
    await waitForFrame(r.lastFrame, FOOTER);
    expect(stateNotes(dir)).toEqual([]);
    r.stdin.write('MK');
    await waitForFrame(r.lastFrame, 'MK');
    await vi.waitFor(() => expect(stateNotes(dir).map(([, n]) => n.content)).toEqual(['MK']), { timeout: 8000, interval: 25 });
    const noteId = stateNotes(dir)[0][0];
    ignore = true;
    // the instance lock is left out: its pid (this test runner) is alive
    cpSync(dir, killed, { recursive: true, filter: (src) => !src.endsWith('instance.lock') });
    close(a);
    ignore = false;
    const b = open(killed, 10);
    await vi.waitFor(() => {
      expect(String(server.getObject(APP_ID, 'note', noteId)?.data.content)).toBe('MK');
      expect(pendingCount(b.store.getState().simperium)).toBe(0);
    }, { timeout: 8000, interval: 25 });
    expect([...b.store.getState().data.notes.values()].map((n) => n.content)).toEqual(['MK']);
  }, 20000);

  it('2: (#689) WHEN `n` is pressed in the App on a buildStore store, `MK` is typed once a is connected and state.json is on disk and, inside 1500 ms (before the autosave), SIGHUP reaches flushOnSignal (stand-in process; the first server ignores change frames) THEN the signal is raised again once (`[4242, "SIGHUP"]`), the data dir copied at once holds exactly one note `MK` in state.json, and snote restarted on the copy against a second, empty server holds exactly one note `MK`, that server holds it with `MK`, pendingCount 0', async () => {
    const server = new FakeSimperiumServer();
    await server.start();
    server.seedBucket(APP_ID, 'note', []);
    cleanups.push(() => server.stop());
    (server as unknown as Record<string, (...args: unknown[]) => void>).handleChange = () => {}; // the dying process's frames never land
    const fresh = new FakeSimperiumServer();
    await fresh.start();
    fresh.seedBucket(APP_ID, 'note', []);
    cleanups.push(() => fresh.stop());
    const dir = mkdtempSync(join(tmpdir(), 'snote-618b-s-'));
    const dead = mkdtempSync(join(tmpdir(), 'snote-618b-d-'));
    cleanups.push(() => rmSync(dir, { recursive: true, force: true }), () => rmSync(dead, { recursive: true, force: true }));
    const close = (b: Built): void => {
      b.stopSaving();
      (b.store.client as unknown as { end?: () => void })?.end?.();
      b.store.stopSync?.();
    };
    const a = buildStore({ dataDir: dir, appId: APP_ID, server: server.url }, { email: 'store1@example.com', token: 'store1-token' }, () => {});
    // state.json is on disk before `n` (with none, the first pending note writes it at once and the signal path is not what saves the text)
    await vi.waitFor(() => expect(a.store.getState().simperium.connected && existsSync(join(dir, 'state.json'))).toBe(true), { timeout: 8000, interval: 25 });
    const r = render(<App store={a.store} width={80} height={24} />);
    await waitForInput(r.stdin);
    r.stdin.write('n');
    await waitForFrame(r.lastFrame, FOOTER);
    const kills: [number, string][] = [];
    const proc = Object.assign(new EventEmitter(), { pid: 4242, kill: (pid: number, sig: string) => { kills.push([pid, sig]); return true; } });
    const stop = flushOnSignal(proc, () => r.unmount(), () => a.stopSaving());
    const typed = Date.now();
    r.stdin.write('MK');
    await waitForFrame(r.lastFrame, 'MK');
    proc.emit('SIGHUP');
    // what the death by the re-raised signal leaves: the lock (this runner's pid) is left out
    cpSync(dir, dead, { recursive: true, filter: (src) => !src.endsWith('instance.lock') });
    expect(Date.now() - typed).toBeLessThan(1500);
    stop();
    close(a);
    expect(kills).toEqual([[4242, 'SIGHUP']]);
    expect(stateNotes(dead).map(([, n]) => n.content)).toEqual(['MK']);
    const noteId = stateNotes(dead)[0][0];
    const b = buildStore({ dataDir: dead, appId: APP_ID, server: fresh.url, noteEditDelayMs: 10 }, { email: 'store1@example.com', token: 'store1-token' }, () => {});
    cleanups.push(() => close(b));
    await vi.waitFor(() => {
      expect(String(fresh.getObject(APP_ID, 'note', noteId)?.data.content)).toBe('MK');
      expect(pendingCount(b.store.getState().simperium)).toBe(0);
    }, { timeout: 8000, interval: 25 });
    expect([...b.store.getState().data.notes.values()].map((n) => n.content)).toEqual(['MK']);
  }, 20000);
});
