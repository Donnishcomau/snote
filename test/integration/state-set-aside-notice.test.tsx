/**
 * #563: when start-up keeps an unloadable state.json as state.json.corrupt (#545, #553), one plain line on the
 * screen says so and says offline notes were kept; a start with a good state.json, or none, shows no such line.
 * Same rig as test/integration/state-shape.test.ts (buildStore against the fake server on localhost).
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render } from 'ink-testing-library';
import { createElement } from 'react';
import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

import { FakeSimperiumServer } from '../fake-simperium/server';
import { restorePlatform, setPlatform } from '../helpers/platform';
import { buildStore } from '../../src/cli/main';
import { saveState } from '../../src/core/persistence';
import { currentProblem, onProblem, resetProblemSignal } from '../../src/core/problem-signal';
import { makeStore } from '../../src/core/store';
import { App } from '../../src/tui/App';
import { waitForFrame } from '../helpers/ink-waits';
import { stopSyncWriters } from '../helpers/sync-writers';

// Tests 3 and 4: flock answers `ENOENT` (not installed) when `missing` is set; every other spawn is the real one.
const flock = vi.hoisted(() => ({ missing: false }));
vi.mock('node:child_process', async (orig) => {
  const real = await orig<typeof import('node:child_process')>();
  return {
    ...real,
    spawnSync: (file: string, ...rest: unknown[]) =>
      file === '/usr/bin/flock' && flock.missing
        ? { status: null, signal: null, error: Object.assign(new Error('spawnSync /usr/bin/flock ENOENT'), { code: 'ENOENT' }) }
        : (real.spawnSync as (...a: unknown[]) => unknown)(file, ...rest),
  };
});

const APP_ID = 'test-app';
const SHAPE_B = '{"version":1,"data":{"notes":{"__map":[["n1",{"content":5,"tags":[],"systemTags":[]}]]}}}';
const DRAFT_LINE = 'Restored 1 note from an unfinished editor session';
const LOCK_LINE = 'No kernel lock (flock not installed): two copies started at once may both run.';
const LINE = 'Could not read saved data: kept it as state.json.corrupt. Offline notes kept.';
const n9 = { content: 'offline note', creationDate: 1, deleted: false, modificationDate: 5000, systemTags: [], tags: [] };
let dir: string;
const servers: FakeSimperiumServer[] = [];
const open: Array<ReturnType<typeof buildStore>> = [];

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'snote-563-'));
  resetProblemSignal();
});

afterEach(async () => {
  // a build's draft recovery runs on a 0 ms timer and reads the module's drafts folder: let it run before the next test moves it
  await new Promise((r) => setTimeout(r, 0));
  try {
    // #319: each client writes ghosts-*.json (and makes the folder) until its connection has closed, so remove it only after that
    await stopSyncWriters(open.splice(0), servers.splice(0));
  } finally {
    resetProblemSignal();
    flock.missing = false;
    rmSync(dir, { recursive: true, force: true });
  }
});

async function startWith(stateText: string | null) {
  const server = new FakeSimperiumServer();
  await server.start();
  servers.push(server);
  if (stateText !== null) writeFileSync(join(dir, 'state.json'), stateText);
  writeFileSync(join(dir, 'unsynced-notes.json'), JSON.stringify({ n9 }));
  writeFileSync(join(dir, 'unsynced.json'), JSON.stringify({ n9: 5000 }));
  const built = buildStore({ dataDir: dir, appId: APP_ID, server: server.url }, { email: 'store1@example.com', token: 'store1-token' }, () => {});
  open.push(built);
  return built;
}

describe('#563 start-up says when state.json was set aside', () => {
  it('1: WHEN state.json holds a note whose content is the number 5 (shape B) THEN state.json.corrupt is kept and the screen shows `Could not read saved data: kept it as state.json.corrupt. Offline notes kept.` and lists `offline note`', async () => {
    const b = await startWith('{"version":1,"data":{"notes":{"__map":[["n1",{"content":5,"tags":[],"systemTags":[]}]]}}}');
    expect(existsSync(join(dir, 'state.json.corrupt'))).toBe(true);
    const r = render(createElement(App, { store: b.store, width: 100, height: 24 }));
    const frame = await waitForFrame(r.lastFrame, (f) => f.includes(LINE) && f.includes('offline note'));
    expect(frame).toContain(LINE);
    expect(frame).toContain('offline note');
    r.unmount();
  });

  it('2: WHEN state.json is a good saved state, or there is no state.json, THEN no state.json.corrupt is written and no line names it', async () => {
    const good = makeStore({ stubClient: {} });
    good.dispatch({ type: 'IMPORT_NOTE_WITH_ID', noteId: 'n1' as never, note: { content: 'good note', tags: [], systemTags: [], deleted: false, creationDate: 1, modificationDate: 1 } as never });
    saveState(good.getState(), dir);
    const b = await startWith(null);
    expect(existsSync(join(dir, 'state.json.corrupt'))).toBe(false);
    expect(currentProblem()).toBeNull();
    const r = render(createElement(App, { store: b.store, width: 100, height: 24 }));
    const frame = await waitForFrame(r.lastFrame, 'good note');
    expect(frame).not.toContain('state.json.corrupt');
    r.unmount();
    // #319: the first store's client is done (no connection open) before its folder is reused
    await stopSyncWriters(open.splice(0), servers.splice(0));
    rmSync(join(dir, 'state.json'), { force: true });
    resetProblemSignal();
    await startWith(null);
    expect(existsSync(join(dir, 'state.json.corrupt'))).toBe(false);
    expect(currentProblem()).toBeNull();
  });

  it(`3: WHEN state.json is shape B and the drafts folder holds one draft \`draft text\` that no note holds THEN the one notice that names the draft is \`${LINE} ${DRAFT_LINE}\`, and the screen shows the set-aside line and lists \`draft text\``, async () => {
    mkdirSync(join(dir, 'drafts', 'snote-1'), { recursive: true });
    writeFileSync(join(dir, 'drafts', 'snote-1', 'note.md'), 'draft text');
    const got: string[] = [];
    const off = onProblem((message) => got.push(message));
    try {
      const b = await startWith(SHAPE_B);
      const r = render(createElement(App, { store: b.store, width: 100, height: 24 }));
      const frame = await waitForFrame(r.lastFrame, (f) => f.includes(LINE) && f.includes('draft text') && got.includes(`${LINE} ${DRAFT_LINE}`));
      expect(frame).toContain(LINE);
      expect(got.filter((m) => m.includes('Restored'))).toEqual([`${LINE} ${DRAFT_LINE}`]);
      r.unmount();
    } finally {
      off();
    }
  });

  it(`4: WHEN state.json is shape B and flock is not installed THEN the notice slot's last message is \`${LINE} ${LOCK_LINE}\`, and the screen shows the set-aside line`, async () => {
    // #886: the fake fails only the Linux flock path, so this start must see linux on every host (on macOS the real
    // Homebrew flock would lock and the no-flock notice would never show); tests 1 to 3 run the host's real flock
    setPlatform('linux');
    flock.missing = true;
    const got: string[] = [];
    const off = onProblem((message) => got.push(message));
    try {
      const b = await startWith(SHAPE_B);
      const r = render(createElement(App, { store: b.store, width: 100, height: 24 }));
      const frame = await waitForFrame(r.lastFrame, (f) => f.includes(LINE) && f.includes('offline note') && got.length === 2);
      expect(frame).toContain(LINE);
      expect(got).toEqual([LOCK_LINE, `${LINE} ${LOCK_LINE}`]);
      r.unmount();
    } finally {
      off();
      restorePlatform();
    }
  });
});
