/**
 * Issue #66 (U1): snote keeps checking for a new version while it is open and
 * shows a banner that stays. The git runner is a fake and the 24-hour timer is
 * injected, so nothing here touches the network or waits on a real timer.
 */
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { describe, it, expect, afterEach, vi } from 'vitest';
import { render } from 'ink-testing-library';
import React from 'react';

import { makeStore } from '../../src/core/store';
import { App } from '../../src/tui/App';
import { testNotes } from './fixtures';
import { startUpdateWatch, WATCH_INTERVAL_MS } from '../../src/core/update-watch';
import { currentBanner, publishBanner, resetBanner } from '../../src/core/update-banner';
import { compareVersions, pluginCloneDir } from '../../src/core/update-state';
import type { GitRunner } from '../../src/core/update-check';
import { waitForFrame, waitForInput } from '../helpers/ink-waits';
import type { EntityId } from '@vendor/types';

const eid = (id: string): EntityId => id as unknown as EntityId;

/** Fixture N: the App with the 5 testNotes, width 80, height 24. */
function renderN(): {
  stdin: { write: (s: string) => void; listenerCount(event: string): number };
  lastFrame: () => string | undefined;
} {
  const store = makeStore({ stubClient: {} });
  testNotes.forEach((note, idx) => {
    store.dispatch({
      type: 'CREATE_NOTE_WITH_ID',
      noteId: eid(`note-${idx + 1}`),
      note: {
        content: note.content,
        systemTags: note.systemTags,
        tags: note.tags,
        deleted: note.deleted,
        modificationDate: note.modificationDate,
        creationDate: note.creationDate,
      },
    });
  });
  return render(<App store={store} width={80} height={24} />);
}

const homes: string[] = [];

/** Temp home holding a plugin clone whose origin is an https url. */
function makeHome(): string {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), 'snote-66-'));
  homes.push(home);
  fs.mkdirSync(path.join(pluginCloneDir(home), '.git'), { recursive: true });
  fs.writeFileSync(
    path.join(pluginCloneDir(home), '.git', 'config'),
    '[remote "origin"]\n\turl = https://example.invalid/snote.git\n'
  );
  return home;
}

/** Every path under `dir`, sorted, with file sizes. */
function listing(dir: string): string[] {
  const out: string[] = [];
  const walk = (d: string): void => {
    for (const name of fs.readdirSync(d).sort()) {
      const full = path.join(d, name);
      const st = fs.statSync(full);
      out.push(`${path.relative(dir, full)}:${st.isDirectory() ? 'dir' : st.size}`);
      if (st.isDirectory()) walk(full);
    }
  };
  walk(dir);
  return out;
}

/** What `git ls-remote --tags` prints for the given tag names. */
const tagLines = (...names: string[]): string =>
  names.map((n) => `${'a'.repeat(40)}\trefs/tags/${n}`).join('\n') + '\n';

/** A fake runner that answers every call with `answer()` and records the calls. */
function makeRunner(answer: () => { code: number | null; stdout: string }): {
  run: GitRunner;
  calls: string[][];
  opts: Array<{ cwd: string; timeoutMs: number; env: NodeJS.ProcessEnv }>;
} {
  const calls: string[][] = [];
  const opts: Array<{ cwd: string; timeoutMs: number; env: NodeJS.ProcessEnv }> = [];
  const run: GitRunner = async (args, o) => {
    calls.push(args);
    opts.push(o);
    return answer();
  };
  return { run, calls, opts };
}

/** A fake 24-hour timer: remembers the callback and the delay, never fires by itself. */
function makeSchedule(): {
  schedule: (fn: () => void, ms: number) => () => void;
  fire: () => void;
  delays: number[];
  cancelled: boolean[];
} {
  let callback: (() => void) | null = null;
  const delays: number[] = [];
  const cancelled: boolean[] = [];
  return {
    schedule: (fn, ms) => {
      callback = fn;
      delays.push(ms);
      const slot = cancelled.push(false) - 1;
      return () => {
        cancelled[slot] = true;
      };
    },
    fire: () => {
      if (callback === null) throw new Error('no timer was scheduled');
      callback();
    },
    delays,
    cancelled,
  };
}

/** Let every already-resolved promise of a finished fake check run. */
const flush = (): Promise<void> => new Promise((resolve) => setImmediate(resolve));

const stops: Array<() => void> = [];

afterEach(() => {
  for (const stop of stops.splice(0)) stop();
  resetBanner();
  for (const home of homes.splice(0)) fs.rmSync(home, { recursive: true, force: true });
});

describe('issue #66 update banner while snote is open', () => {
  it('1: WHEN snote has been open for 24 hours since its last check THEN it checks again, with no restart.', async () => {
    const home = makeHome();
    let stdout = tagLines('v0.2.5', 'v0.2.6');
    const { run, calls, opts } = makeRunner(() => ({ code: 0, stdout }));
    const timer = makeSchedule();
    const env = { GIT_SSH_COMMAND: 'sh -c evil', GIT_DIR: '/x', SNOTE_MARK: '1' } as NodeJS.ProcessEnv;
    stops.push(startUpdateWatch({ version: '0.2.6', home, env, run, schedule: timer.schedule }));
    await vi.waitFor(() => expect(calls).toHaveLength(1));
    expect(calls[0].slice(calls[0].indexOf('ls-remote'))).toEqual(['ls-remote', '--tags', 'https://example.invalid/snote.git']);
    expect(opts[0].cwd).toBe('/');
    expect(opts[0].timeoutMs).toBe(5000);
    expect(opts[0].env.GIT_SSH_COMMAND).toBeUndefined();
    expect(opts[0].env.GIT_DIR).toBeUndefined();
    expect(opts[0].env.GIT_TERMINAL_PROMPT).toBe('0');
    expect(opts[0].env.SNOTE_MARK).toBe('1');
    expect(timer.delays).toEqual([86_400_000]);
    expect(WATCH_INTERVAL_MS).toBe(86_400_000);
    await flush();
    expect(currentBanner()).toBeNull();
    // 24 hours later the timer fires: a second check, and the release that appeared meanwhile is found.
    stdout = tagLines('v0.2.5', 'v0.2.6', 'v0.2.8');
    timer.fire();
    await vi.waitFor(() => {
      expect(calls).toHaveLength(2);
      expect(currentBanner()).toEqual({ running: '0.2.6', available: '0.2.8' });
    });
    // starting the watch again (a re-login) cancels the earlier timer
    expect(timer.cancelled).toEqual([false]);
    stops.push(startUpdateWatch({ version: '0.2.6', home, env, run, schedule: makeSchedule().schedule }));
    expect(timer.cancelled).toEqual([true]);
  });

  it('2: WHEN a newer version is available THEN a banner reads `Update available: 0.2.x -> 0.2.y` (running and new version) and stays on screen in the list, search and editor views.', async () => {
    publishBanner('0.2.6', '0.2.8');
    const { stdin, lastFrame } = renderN();
    await waitForInput(stdin);
    const shown = 'Update available: 0.2.6 -> 0.2.8';
    const listFrame = await waitForFrame(lastFrame, (f) => f.includes(shown) && f.includes('4 notes'));
    expect(listFrame.split('\n').length).toBe(24);
    stdin.write('/');
    const searchFrame = await waitForFrame(lastFrame, (f) => f.includes('search:') && f.includes(shown));
    expect(searchFrame).toContain(shown);
    expect(searchFrame.split('\n').length).toBe(24);
    stdin.write('\x1b');
    await waitForFrame(lastFrame, (f) => !f.includes('search:') && f.includes(shown));
    stdin.write('i');
    const editorFrame = await waitForFrame(
      lastFrame,
      (f) => f.includes('Ctrl+S save · Esc cancel · Enter new line') && f.includes(shown)
    );
    expect(editorFrame).toContain(shown);
    expect(editorFrame.split('\n').length).toBe(24);
  });

  it('3: WHEN the banner is shown and the user presses Escape THEN it hides for this version only and returns for the next one.', async () => {
    const { stdin, lastFrame } = renderN();
    await waitForInput(stdin);
    publishBanner('0.2.6', '0.2.8');
    const shown = 'Update available: 0.2.6 -> 0.2.8';
    await waitForFrame(lastFrame, shown);
    // Escape first closes a search, as it always did: the banner stays
    stdin.write('/');
    await waitForFrame(lastFrame, (f) => f.includes('search:') && f.includes(shown));
    stdin.write('\x1b');
    await waitForFrame(lastFrame, (f) => !f.includes('search:') && f.includes(shown));
    expect(currentBanner()).toEqual({ running: '0.2.6', available: '0.2.8' });
    // Escape in the plain list hides the banner for 0.2.8
    stdin.write('\x1b');
    await waitForFrame(lastFrame, (f) => !f.includes('Update available'));
    expect(currentBanner()).toBeNull();
    // the same version again stays hidden
    publishBanner('0.2.6', '0.2.8');
    expect(currentBanner()).toBeNull();
    expect(lastFrame()).not.toContain('Update available');
    // the next version brings it back
    publishBanner('0.2.6', '0.2.9');
    const frame = await waitForFrame(lastFrame, 'Update available: 0.2.6 -> 0.2.9');
    expect(frame).toContain('Update available: 0.2.6 -> 0.2.9');
  });

  it('4: WHEN the remote answers a version that is not `digits.digits.digits` (optionally followed by `.digits`) or is not newer than the running one THEN no banner is shown.', async () => {
    const home = makeHome();
    const answers = [
      tagLines('v0.2.x'),
      tagLines('0.2.9'),
      tagLines('v0.2'),
      tagLines('v0.2.9.1.1'),
      tagLines('v0.2.9.x'),
      tagLines('v0.2.9\x1b]52;c;QQ==\x07', 'v0.2.9\x1b[31m'),
      tagLines('v0.2.9-rc1'),
      tagLines('v1234567.0.0'),
      tagLines('latest', 'v0.2.9/extra'),
      tagLines('v0.2.6'),
      tagLines('v0.2.5', 'v0.1.9'),
      '',
    ];
    for (const stdout of answers) {
      const { run, calls } = makeRunner(() => ({ code: 0, stdout }));
      stops.push(startUpdateWatch({ version: '0.2.6', home, env: {}, run, schedule: makeSchedule().schedule }));
      expect(calls).toHaveLength(1);
      await flush();
      expect(currentBanner(), JSON.stringify(stdout)).toBeNull();
    }
    // four-part versions compare numerically: 0.2.8 < 0.2.8.1 < 0.2.9
    expect(compareVersions('0.2.8', '0.2.8.1')).toBeLessThan(0);
    expect(compareVersions('0.2.8.1', '0.2.9')).toBeLessThan(0);
    const four = (stdout: string, version: string) => {
      const { run } = makeRunner(() => ({ code: 0, stdout }));
      stops.push(startUpdateWatch({ version, home, env: {}, run, schedule: makeSchedule().schedule }));
    };
    four(tagLines('v0.2.8'), '0.2.8.1');
    await flush();
    expect(currentBanner()).toBeNull();
    four(tagLines('v0.2.8.1'), '0.2.8.1');
    await flush();
    expect(currentBanner()).toBeNull();
    four(tagLines('v0.2.8.1'), '0.2.8');
    await vi.waitFor(() => expect(currentBanner()).toEqual({ running: '0.2.8', available: '0.2.8.1' }));
    resetBanner();
    four(tagLines('v0.2.9', 'v0.2.8.1'), '0.2.8.1');
    await vi.waitFor(() => expect(currentBanner()).toEqual({ running: '0.2.8.1', available: '0.2.9' }));
    resetBanner();
    // the same fake with a real newer release does show it, so the cases above could have failed
    const { run } = makeRunner(() => ({ code: 0, stdout: tagLines('v0.2.5', 'v0.2.10') }));
    stops.push(startUpdateWatch({ version: '0.2.6', home, env: {}, run, schedule: makeSchedule().schedule }));
    await vi.waitFor(() => expect(currentBanner()).toEqual({ running: '0.2.6', available: '0.2.10' }));
  });

  it('5: WHEN `SNOTE_UPDATE_CHECK=off` THEN no check runs and no banner is shown.', async () => {
    const home = makeHome();
    for (const value of ['off', '0']) {
      const { run, calls } = makeRunner(() => ({ code: 0, stdout: tagLines('v0.2.9') }));
      const timer = makeSchedule();
      stops.push(
        startUpdateWatch({ version: '0.2.6', home, env: { SNOTE_UPDATE_CHECK: value }, run, schedule: timer.schedule })
      );
      await flush();
      expect(calls).toHaveLength(0);
      expect(timer.delays).toHaveLength(0);
      expect(currentBanner()).toBeNull();
    }
    // with the switch not set, the same fake is asked and the banner appears
    const { run, calls } = makeRunner(() => ({ code: 0, stdout: tagLines('v0.2.9') }));
    stops.push(startUpdateWatch({ version: '0.2.6', home, env: {}, run, schedule: makeSchedule().schedule }));
    await vi.waitFor(() => expect(calls).toHaveLength(1));
    await vi.waitFor(() => expect(currentBanner()).toEqual({ running: '0.2.6', available: '0.2.9' }));
  });

  it('6: WHEN the check is offline or times out THEN nothing is shown and nothing is written.', async () => {
    const home = makeHome();
    const before = listing(home);
    const failures: Array<() => { code: number | null; stdout: string }> = [
      () => ({ code: 128, stdout: '' }),
      () => ({ code: null, stdout: tagLines('v0.2.9') }),
      () => ({ code: 1, stdout: tagLines('v0.2.9') }),
      () => {
        throw new Error('spawn failed');
      },
    ];
    for (const answer of failures) {
      const { run, calls } = makeRunner(answer);
      stops.push(startUpdateWatch({ version: '0.2.6', home, env: {}, run, schedule: makeSchedule().schedule }));
      expect(calls).toHaveLength(1);
      await flush();
      expect(currentBanner()).toBeNull();
    }
    expect(listing(home)).toEqual(before);
    expect(before.length).toBeGreaterThan(0);
    // an origin that is not https or an absolute path, and a folder that is not a clone, are never asked
    for (const url of ['ssh://example.invalid/snote', 'ext::sh -c id', 'git://example.invalid/snote', 'file:///x']) {
      const unsafe = makeHome();
      fs.writeFileSync(
        path.join(pluginCloneDir(unsafe), '.git', 'config'),
        `[remote "origin"]\n\turl = ${url}\n`
      );
      const { run, calls } = makeRunner(() => ({ code: 0, stdout: tagLines('v0.2.9') }));
      stops.push(startUpdateWatch({ version: '0.2.6', home: unsafe, env: {}, run, schedule: makeSchedule().schedule }));
      await flush();
      expect(calls, url).toHaveLength(0);
      expect(currentBanner()).toBeNull();
    }
    const noClone = fs.mkdtempSync(path.join(os.tmpdir(), 'snote-66-'));
    homes.push(noClone);
    const lone = makeRunner(() => ({ code: 0, stdout: tagLines('v0.2.9') }));
    stops.push(startUpdateWatch({ version: '0.2.6', home: noClone, env: {}, run: lone.run, schedule: makeSchedule().schedule }));
    await flush();
    expect(lone.calls).toHaveLength(0);
    expect(currentBanner()).toBeNull();
    // the banner draws nothing either
    const { stdin, lastFrame } = renderN();
    await waitForInput(stdin);
    const frame = await waitForFrame(lastFrame, (f) => f.length > 0);
    expect(frame).not.toContain('Update available');
  });
});
