/**
 * #689: closing the terminal window (SIGHUP) or SIGTERM writes
 * state.json before the signal ends snote, so text typed in the inline editor
 * less than 1.5 s ago (the autosave has not run) is on disk. The signal is
 * raised on a stand-in process (the test runner must live); the data dir is
 * copied right after it, which is what the death by the re-raised signal
 * leaves, the server ignores change frames meanwhile, and snote restarts on
 * the copy.
 */
import { describe, it, expect, afterEach } from 'vitest';
import { render } from 'ink-testing-library';
import { EventEmitter } from 'node:events';
import { spawnSync } from 'node:child_process';
import { cpSync, mkdtempSync, rmSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { build } from 'esbuild';
import React from 'react';

import { FakeSimperiumServer } from '../fake-simperium/server';
import { buildStore } from '../../src/cli/main';
import { pendingCount } from '../../src/core/simperium-reducer';
import { flushOnSignal } from '../../src/core/signal-flush';
import { App } from '../../src/tui/App';
import { waitForFrame, waitForInput } from '../helpers/ink-waits';

const APP_ID = 'test-app';
const TOKEN = 'store1-token';
const EMAIL = 'store1@example.com';
const BASE = 'line1\nline2';
const MK = 'line1\nline2MK';
const FOOTER = 'Autosaves · Esc close · Ctrl+S save now';

type Built = ReturnType<typeof buildStore>;

const servers: FakeSimperiumServer[] = [];
const dirs: string[] = [];
const open: Built[] = [];
const unmounts: (() => void)[] = [];

afterEach(() => {
  for (const u of unmounts.splice(0)) u();
  for (const b of open.splice(0)) close(b);
  for (const s of servers.splice(0)) s.stop();
  for (const d of dirs.splice(0)) rmSync(d, { recursive: true, force: true });
});

function endSync(b: Built): void {
  (b.store.client as unknown as { end?: () => void })?.end?.();
  b.store.stopSync?.();
}

function close(b: Built): void {
  b.stopSaving();
  endSync(b);
}

async function waitFor(cond: () => boolean, timeoutMs: number, label: () => string): Promise<void> {
  const start = Date.now();
  while (!cond()) {
    if (Date.now() - start > timeoutMs) throw new Error(`timed out (${timeoutMs} ms) waiting for: ${label()}`);
    await new Promise((r) => setTimeout(r, 25));
  }
}

function newDir(): string {
  const dir = mkdtempSync(join(tmpdir(), 'snote-689-'));
  dirs.push(dir);
  return dir;
}

async function startServer(): Promise<FakeSimperiumServer> {
  const server = new FakeSimperiumServer();
  await server.start();
  servers.push(server);
  server.seedBucket(APP_ID, 'note', [
    {
      id: 'n1',
      data: { content: BASE, creationDate: 1000, deleted: false, modificationDate: 2000, systemTags: [], tags: [] },
      version: 1,
    },
  ]);
  return server;
}

function openA(dataDir: string, serverUrl: string, noteEditDelayMs?: number): Built {
  const built = buildStore({ dataDir, appId: APP_ID, server: serverUrl, noteEditDelayMs }, { email: EMAIL, token: TOKEN }, () => {});
  open.push(built);
  return built;
}

/** The server ignores every incoming `c` frame while `on` is set. */
function ignoreChanges(server: FakeSimperiumServer): { on: boolean } {
  const priv = server as unknown as Record<string, (...args: unknown[]) => void>;
  const real = priv.handleChange.bind(server);
  const flag = { on: false };
  priv.handleChange = (...args: unknown[]) => {
    if (flag.on) return;
    real(...args);
  };
  return flag;
}

const serverContent = (server: FakeSimperiumServer) => String(server.getObject(APP_ID, 'note', 'n1')?.data.content ?? '');
const localContent = (b: Built) => b.store.getState().data.notes.get('n1' as never)?.content;
const pending = (b: Built) => pendingCount(b.store.getState().simperium);
const noteCount = (b: Built) => b.store.getState().data.notes.size;

function stateContent(dir: string): string | undefined {
  try {
    const state = JSON.parse(readFileSync(join(dir, 'state.json'), 'utf8')) as {
      data?: { notes?: { __map?: [string, { content?: string }][] } };
    };
    return state.data?.notes?.__map?.find(([id]) => id === 'n1')?.[1]?.content;
  } catch {
    return undefined;
  }
}

/** A stand-in for `process`: records each kill instead of dying. */
function fakeProcess(): EventEmitter & { pid: number; kills: [number, string][]; kill: (pid: number, sig: string) => boolean } {
  const proc = new EventEmitter() as EventEmitter & { pid: number; kills: [number, string][]; kill: (pid: number, sig: string) => boolean };
  proc.pid = 4242;
  proc.kills = [];
  proc.kill = (pid: number, sig: string) => {
    proc.kills.push([pid, sig]);
    return true;
  };
  return proc;
}

/** Open n1 in the inline editor, type `MK`, raise `sig` at once, copy the data dir and restart on the copy. */
async function typeThenSignal(sig: 'SIGHUP' | 'SIGTERM'): Promise<void> {
  const server = await startServer();
  const flag = ignoreChanges(server);
  const dir = newDir();
  const dead = newDir();
  const a = openA(dir, server.url);
  await waitFor(() => localContent(a) === BASE && pending(a) === 0 && stateContent(dir) === BASE, 8000, () => 'A synced n1 and state.json holds it');
  const r = render(<App store={a.store} width={80} height={24} />);
  unmounts.push(r.unmount);
  await waitForInput(r.stdin);
  await waitForFrame(r.lastFrame, 'line1');
  r.stdin.write('i');
  await waitForFrame(r.lastFrame, FOOTER);
  const proc = fakeProcess();
  flushOnSignal(proc, () => r.unmount(), () => a.stopSaving());
  flag.on = true;
  const typed = Date.now();
  r.stdin.write('M');
  r.stdin.write('K');
  await waitForFrame(r.lastFrame, 'line2MK');
  unmounts.splice(unmounts.indexOf(r.unmount), 1);
  proc.emit(sig);
  // what the death by the re-raised signal leaves: the lock (this runner's pid) is left out
  cpSync(dir, dead, { recursive: true, filter: (src) => !src.endsWith('instance.lock') });
  expect(Date.now() - typed).toBeLessThan(1500);
  expect(proc.kills).toEqual([[4242, sig]]);
  expect(stateContent(dead)).toBe(MK);
  open.splice(open.indexOf(a), 1);
  endSync(a);
  flag.on = false;
  const b = openA(dead, server.url, 10);
  const want = () => serverContent(server) === MK && localContent(b) === MK && pending(b) === 0 && noteCount(b) === 1;
  await waitFor(want, 8000, () =>
    `server and store n1 are MK once, nothing pending, 1 note (server: ${JSON.stringify(serverContent(server))}, store: ${JSON.stringify(localContent(b))}, pending: ${pending(b)}, notes: ${noteCount(b)})`,
  );
  expect(localContent(b)).toBe(MK);
  expect(noteCount(b)).toBe(1);
}

describe('#689: SIGHUP and SIGTERM write state.json before snote ends', () => {
  it('1: WHEN n1 `line1\\nline2` is synced, opened with `i` in the App on that buildStore store, `MK` is typed and, inside 1500 ms (before the autosave), SIGHUP reaches flushOnSignal (stand-in process, the server ignores change frames) THEN the signal is raised again exactly once (`[4242, "SIGHUP"]`), the data dir copied at once holds n1 `line1\\nline2MK` in state.json, and snote restarted on the copy has n1 `line1\\nline2MK` once, on the server too, nothing pending, `1` note; and the same with SIGTERM', async () => {
    await typeThenSignal('SIGHUP');
    await typeThenSignal('SIGTERM');
  }, 20000);

  it('2: WHEN flushOnSignal listens on a stand-in process THEN SIGHUP and SIGTERM have `1` listener each; on SIGTERM the steps run in the order `unmount`, `flush`, `kill SIGTERM` and both listeners are gone; an unmount that throws still flushes and kills; the stop function removes both listeners with no kill; and with a listener added before it (signal-exit), SIGHUP runs `unmount`, `flush`, `kill SIGHUP` and only then that listener', () => {
    const steps: string[] = [];
    const p1 = fakeProcess();
    flushOnSignal(p1, () => steps.push('unmount'), () => steps.push('flush'));
    expect([p1.listenerCount('SIGHUP'), p1.listenerCount('SIGTERM')]).toEqual([1, 1]);
    p1.kill = (_pid: number, sig: string) => (steps.push(`kill ${sig}`), true);
    p1.emit('SIGTERM');
    expect(steps).toEqual(['unmount', 'flush', 'kill SIGTERM']);
    expect([p1.listenerCount('SIGHUP'), p1.listenerCount('SIGTERM')]).toEqual([0, 0]);
    const p2 = fakeProcess();
    let flushed = 0;
    flushOnSignal(p2, () => { throw new Error('gone'); }, () => { flushed += 1; });
    p2.emit('SIGHUP');
    expect(flushed).toBe(1);
    expect(p2.kills).toEqual([[4242, 'SIGHUP']]);
    const p3 = fakeProcess();
    const stop = flushOnSignal(p3, () => {}, () => {});
    stop();
    expect([p3.listenerCount('SIGHUP'), p3.listenerCount('SIGTERM')]).toEqual([0, 0]);
    expect(p3.kills).toEqual([]);
    const p4 = fakeProcess();
    const order: string[] = [];
    p4.on('SIGHUP', () => order.push('signal-exit'));
    p4.kill = (_pid: number, sig: string) => (order.push(`kill ${sig}`), true);
    flushOnSignal(p4, () => order.push('unmount'), () => order.push('flush'));
    p4.emit('SIGHUP');
    expect(order).toEqual(['unmount', 'flush', 'kill SIGHUP', 'signal-exit']);
  });

  it('3: WHEN src/cli/main.tsx is read THEN it calls `flushOnSignal(process, () => unmount(), () => stopSaving())` once, after the render, and `stopSignalFlush();` once, before the last `stopSaving();`', () => {
    const src = readFileSync(join(process.cwd(), 'src/cli/main.tsx'), 'utf8');
    const wire = 'const stopSignalFlush = flushOnSignal(process, () => unmount(), () => stopSaving());';
    expect(src.split(wire).length - 1).toBe(1);
    expect(src.split('  stopSignalFlush();\n').length - 1).toBe(1);
    expect(src.indexOf(wire)).toBeGreaterThan(src.indexOf('const { waitUntilExit, unmount, clear } = render('));
    expect(src.indexOf('  stopSignalFlush();\n')).toBeLessThan(src.lastIndexOf('  stopSaving();\n'));
    expect(src.indexOf('  stopSignalFlush();\n')).toBeGreaterThan(src.indexOf('await waitUntilExit();'));
  });

  it('4: WHEN a real node process holds a signal-exit hook (as Ink and restore-cursor do) and flushOnSignal, whose unmount starts the quit path (a microtask that would print `continued` and exit 0), gets SIGHUP and then, in a second process, SIGTERM THEN each process dies by that signal (exit code `null`, signal `SIGHUP` / `SIGTERM`) and printed exactly `unmount`, `flush`, `exit-hook` and nothing on stderr: the quit path never ran', async () => {
    const dir = newDir();
    const probe = join(dir, 'probe.cjs');
    await build({
      stdin: {
        contents: [
          "import { writeSync } from 'node:fs';",
          "import onExit from 'signal-exit';",
          "import { flushOnSignal } from './src/core/signal-flush';",
          "const log = (s) => writeSync(1, s + '\\n');",
          "onExit(() => log('exit-hook'));",
          "flushOnSignal(process, () => { log('unmount'); void Promise.resolve().then(() => { log('continued'); process.exit(0); }); }, () => log('flush'));",
          'process.kill(process.pid, process.argv[2]);',
          "setTimeout(() => { log('timeout'); process.exit(0); }, 2000);",
        ].join('\n'),
        resolveDir: process.cwd(),
        loader: 'js',
      },
      outfile: probe,
      bundle: true,
      platform: 'node',
      format: 'cjs',
      logLevel: 'silent',
    });
    for (const sig of ['SIGHUP', 'SIGTERM'] as const) {
      const r = spawnSync(process.execPath, [probe, sig], { encoding: 'utf8', timeout: 2500 });
      expect({ status: r.status, signal: r.signal, out: r.stdout, err: r.stderr }).toEqual({ status: null, signal: sig, out: 'unmount\nflush\nexit-hook\n', err: '' });
    }
  }, 10000);
});
