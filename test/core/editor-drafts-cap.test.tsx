/**
 * #89: a draft larger than the cap is kept on disk and never loaded at start,
 * a restored draft's notice is an info notice (not an error), and the start
 * reads each draft through one open file descriptor (no second lookup).
 */
import { describe, it, expect, afterEach, beforeEach } from 'vitest';
import React from 'react';
import { render } from 'ink-testing-library';
import { createRequire } from 'node:module';
import { execFileSync } from 'node:child_process';
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  statSync,
  symlinkSync,
  writeFileSync,
  chmodSync,
  constants as fsConstants,
} from 'node:fs';
import { dirname, join } from 'node:path';
import { tmpdir } from 'node:os';
import { createServer } from 'node:net';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

import {
  MAX_DRAFT_BYTES,
  draftsDir,
  recoverDrafts,
  recoveryNotice,
  setDraftsDir,
} from '../../src/core/editor-drafts';
import type { TooLargeDraft } from '../../src/core/editor-drafts';
import { persistOnChange, saveState } from '../../src/core/persistence';
import { makeStore } from '../../src/core/store';
import { buildStore } from '../../src/cli/main';
import { onProblem, publishInfo, publishProblem, resetProblemSignal } from '../../src/core/problem-signal';
import { App } from '../../src/tui/App';
import { waitForFrame, waitForInput } from '../helpers/ink-waits';
import { FakeSimperiumServer } from '../fake-simperium/server';
import { hostileText } from '../fixtures/hostile';

const inkPkgDir = path.dirname(path.dirname(createRequire(import.meta.url).resolve('ink')));
const inkChalk = (
  await import(pathToFileURL(path.join(inkPkgDir, 'node_modules/chalk/source/index.js')).href)
).default;
const chalkLevel = inkChalk.level;

const waitFor = async (cond: () => boolean, timeoutMs = 2500) => {
  const start = Date.now();
  while (!cond()) {
    if (Date.now() - start > timeoutMs) throw new Error('timed out waiting for condition');
    await new Promise((r) => setTimeout(r, 10));
  }
};

const cleanup: string[] = [];
const stops: Array<() => void> = [];
let account = '';
beforeEach(() => {
  resetProblemSignal();
  account = mkdtempSync(join(tmpdir(), 'editor-drafts-cap-'));
  cleanup.push(account);
  setDraftsDir(join(account, 'drafts'));
});
afterEach(() => {
  for (const stop of stops.splice(0)) stop();
  for (const d of cleanup.splice(0)) rmSync(d, { recursive: true, force: true });
  setDraftsDir(null);
  resetProblemSignal();
  inkChalk.level = chalkLevel;
});

const scratch = (prefix: string): string => {
  const d = mkdtempSync(join(tmpdir(), prefix));
  cleanup.push(d);
  return d;
};

const noteContents = (store: ReturnType<typeof makeStore>): string[] =>
  [...store.getState().data.notes.values()].map((n) => n.content);

/** A draft folder under the account drafts folder (mode 0700) with one 0600 file. */
function writeDraft(folderName: string, file: string, data: string | Buffer): { folder: string; file: string } {
  const folder = join(draftsDir(), folderName);
  mkdirSync(folder, { recursive: true, mode: 0o700 });
  chmodSync(folder, 0o700);
  const full = join(folder, file);
  writeFileSync(full, data, { mode: 0o600 });
  chmodSync(full, 0o600);
  return { folder, file: full };
}

const mode = (p: string): number => statSync(p).mode & 0o777;

async function fakeServer(): Promise<FakeSimperiumServer> {
  const server = new FakeSimperiumServer();
  await server.start();
  stops.push(() => setTimeout(() => server.stop(), 100));
  server.seedBucket('test-app', 'note', []);
  return server;
}

describe('#89 draft size cap, info notice, one descriptor', () => {
  it('1: WHEN a draft of `1048577` bytes exists at start THEN it is not loaded and stays on disk with `1048577` bytes (file `0600`, folder `0700`), the notice reads `Draft too large to restore (1025 KB), kept on disk: <folder>`, and a draft of exactly `1048576` bytes is restored', () => {
    expect(MAX_DRAFT_BYTES).toBe(1048576);
    const big = writeDraft('snote-big', 'big.md', 'a'.repeat(MAX_DRAFT_BYTES + 1));
    const store = makeStore({ stubClient: {} });
    const tooLarge: TooLargeDraft[] = [];
    expect(recoverDrafts(store, draftsDir(), tooLarge)).toBe(0);
    expect(noteContents(store)).toEqual([]);
    expect(statSync(big.file).size).toBe(1048577);
    expect(mode(big.file)).toBe(0o600);
    expect(mode(big.folder)).toBe(0o700);
    expect(tooLarge).toEqual([{ folder: big.folder, bytes: 1048577 }]);
    expect(recoveryNotice(0, tooLarge)).toBe(`Draft too large to restore (1025 KB), kept on disk: ${big.folder}`);

    const edge = writeDraft('snote-edge', 'edge.md', 'b'.repeat(MAX_DRAFT_BYTES));
    const second: TooLargeDraft[] = [];
    expect(recoverDrafts(store, draftsDir(), second)).toBe(1);
    expect(noteContents(store)).toEqual(['b'.repeat(MAX_DRAFT_BYTES)]);
    expect(second).toEqual([{ folder: big.folder, bytes: 1048577 }]);
    expect(existsSync(edge.file)).toBe(true); // removed only after a save
    expect(existsSync(big.file)).toBe(true);
  });

  it('2: WHEN a draft folder holds a draft over the cap and a draft `small words`, and another holds a draft over the cap and a draft equal to note `dup text`, THEN `small words` is restored and both over-cap files are still on disk after the next save', async () => {
    const big = writeDraft('snote-mixed', 'big.md', 'c'.repeat(MAX_DRAFT_BYTES + 1));
    writeFileSync(join(big.folder, 'small.md'), 'small words', { mode: 0o600 });
    const big2 = writeDraft('snote-dupe1', 'big2.md', 'f'.repeat(MAX_DRAFT_BYTES + 1));
    writeFileSync(join(big2.folder, 'dup.md'), 'dup text', { mode: 0o600 });
    const dataDir = dirname(draftsDir());
    const store = makeStore({ stubClient: {} });
    store.dispatch({
      type: 'CREATE_NOTE_WITH_ID',
      noteId: 'n-dup' as never,
      note: { content: 'dup text', systemTags: [], tags: [] },
    } as never);
    stops.push(persistOnChange(store, dataDir, 50));
    expect(recoverDrafts(store, draftsDir(), [])).toBe(1);
    const stateFile = join(dataDir, 'state.json');
    await waitFor(
      () =>
        noteContents(store).includes('small words') &&
        existsSync(stateFile) &&
        readFileSync(stateFile, 'utf-8').includes('small words'),
    );
    // the save and its after-save hooks ran in one synchronous block: both folders are still there
    expect(existsSync(big.file)).toBe(true);
    expect(existsSync(big2.file)).toBe(true);
    expect(existsSync(join(big.folder, 'small.md'))).toBe(true);
    expect(statSync(big.file).size).toBe(1048577);
    expect(statSync(big2.file).size).toBe(1048577);
  });

  it('3: WHEN a draft is restored at start THEN its notice `Restored 1 note from an unfinished editor session` is published as an info notice and drawn in the info style (green `\\u001b[32m`), whether it arrives before or after the first frame, while a problem stays in the error style (red `\\u001b[31m`)', async () => {
    const text = 'Restored 1 note from an unfinished editor session';
    // the real start: buildStore restores the draft and publishes the notice as info
    writeDraft('snote-info', 'info.md', 'info words');
    const server = await fakeServer();
    saveState(makeStore({ stubClient: {} }).getState(), account);
    const notices: Array<[string, boolean]> = [];
    stops.push(onProblem((m, info) => notices.push([m, info])));
    const built = buildStore(
      { dataDir: account, appId: 'test-app', server: server.url, noteEditDelayMs: 10 },
      { email: 'test@example.com', token: 'test-token' },
      () => {},
    );
    stops.unshift(built.stopSaving);
    await waitFor(() => notices.length > 0);
    expect(notices).toEqual([[text, true]]);

    // drawn after the first frame (a listener) and before it (the stored value)
    inkChalk.level = 3;
    resetProblemSignal(); // the start's notice must not be the one drawn below
    const store = makeStore({ stubClient: {} });
    const later = render(React.createElement(App, { store, width: 100, height: 24 }));
    await waitForInput(later.stdin);
    publishInfo(text);
    const g1 = await waitForFrame(later.lastFrame, (f) => f.includes(`\u001b[32m${text}`));
    expect(g1).not.toContain(`\u001b[31m${text}`);
    publishProblem('could not save notes: EISDIR');
    const r1 = await waitForFrame(later.lastFrame, (f) => f.includes('\u001b[31mcould not save notes: EISDIR'));
    expect(r1).not.toContain(`\u001b[32m${text}`);
    later.unmount();
    resetProblemSignal();
    publishInfo(text);
    const early = render(React.createElement(App, { store, width: 100, height: 24 }));
    await waitForInput(early.stdin);
    const g2 = await waitForFrame(early.lastFrame, (f) => f.includes(`\u001b[32m${text}`));
    expect(g2).toContain(`\u001b[32m${text}`);
    expect(g2).not.toContain(`\u001b[31m${text}`);
    early.unmount();
  });

  it('4: WHEN a draft file is a symlink to a file over the cap, a named pipe, or a file that cannot be read (beside a draft equal to note `old note`) THEN recoverDrafts returns `0`, reports no oversized draft, does not wait on the pipe, and leaves all three in place', async () => {
    expect(MAX_DRAFT_BYTES).toBe(1048576);
    expect(typeof fsConstants.O_NOFOLLOW).toBe('number'); // present in Node on Linux and macOS
    expect(typeof fsConstants.O_NONBLOCK).toBe('number');
    const folder = join(draftsDir(), 'snote-links');
    mkdirSync(folder, { recursive: true, mode: 0o700 });
    const outside = join(scratch('editor-drafts-cap-out-'), 'huge.md');
    writeFileSync(outside, 'd'.repeat(MAX_DRAFT_BYTES + 5));
    symlinkSync(outside, join(folder, 'link.md'));
    execFileSync('mkfifo', [join(folder, 'pipe.md')]);
    const locked = writeDraft('snote-locked', 'same.md', 'old note');
    // A file nobody can open, root included: a live Unix socket (open gives ENXIO).
    const sock = createServer();
    await new Promise<void>((resolve) => sock.listen(join(locked.folder, 'socket.md'), resolve));
    // ROOT-READS-MODE-000: root can read a mode-000 file (the Mac mini container runs as root),
    // so the mode-000 case runs only for a normal user; the socket above covers root.
    const asNormalUser = typeof process.getuid === 'function' && process.getuid() !== 0;
    if (asNormalUser) {
      writeFileSync(join(locked.folder, 'locked.md'), 'unreadable words', { mode: 0o600 });
      chmodSync(join(locked.folder, 'locked.md'), 0o000);
    }
    const store = makeStore({ stubClient: {} });
    store.dispatch({ type: 'CREATE_NOTE_WITH_ID', noteId: 'n1' as never, note: { content: 'old note', systemTags: [], tags: [] } } as never);
    const tooLarge: TooLargeDraft[] = [];
    expect(recoverDrafts(store, draftsDir(), tooLarge)).toBe(0);
    expect(noteContents(store)).toEqual(['old note']);
    expect(tooLarge).toEqual([]);
    if (asNormalUser) expect(existsSync(join(locked.folder, 'locked.md'))).toBe(true);
    expect(existsSync(join(locked.folder, 'socket.md'))).toBe(true);
    await new Promise<void>((resolve) => sock.close(() => resolve()));
    expect(existsSync(join(locked.folder, 'same.md'))).toBe(true);
    expect(statSync(outside).size).toBe(MAX_DRAFT_BYTES + 5);
    expect(existsSync(join(folder, 'link.md'))).toBe(true);
    expect(existsSync(join(folder, 'pipe.md'))).toBe(true);
  });

  it('5: WHEN a draft holds the hostile corpus (`HOSTILE-MARK` then every sequence of the hostile fixture) and an over-cap draft sits in a folder whose path holds `\\x1b]0;pwn\\x07` THEN the list view shows `HOSTILE-MARK` and the notice shows `Draft too large to restore (1025 KB)`, with no escape-introducer byte of the corpus or of the path', async () => {
    const evil = join(scratch('editor-drafts-cap-evil-'), 'x\x1b]0;pwn\x07y');
    mkdirSync(evil);
    setDraftsDir(join(evil, 'drafts'));
    writeDraft('snote-hostile', 'hostile.md', hostileText('HOSTILE-MARK'));
    writeDraft('snote-huge', 'huge.md', 'e'.repeat(MAX_DRAFT_BYTES + 1));
    const server = await fakeServer();
    saveState(makeStore({ stubClient: {} }).getState(), evil);
    const built = buildStore(
      { dataDir: evil, appId: 'test-app', server: server.url, noteEditDelayMs: 10 },
      { email: 'test@example.com', token: 'test-token' },
      () => {},
    );
    stops.unshift(built.stopSaving);
    const { stdin, lastFrame } = render(React.createElement(App, { store: built.store, width: 240, height: 24 }));
    await waitForInput(stdin);
    const frame = await waitForFrame(
      lastFrame,
      (f) => f.includes('HOSTILE-MARK') && f.includes('Draft too large to restore (1025 KB)'),
    );
    expect(frame).toContain('HOSTILE-MARK');
    expect(frame).toContain('Draft too large to restore (1025 KB)');
    expect(frame).not.toContain(']');
    expect(frame).not.toContain('');
    expect(frame).not.toContain('');
    expect(frame).not.toContain('P');
    expect(frame).not.toContain('_');
  });

  it('6: WHEN the account `drafts` folder is a symlink to a folder holding a draft `behind link` at start THEN no note is added, no notice is published, and the draft behind the link is untouched', async () => {
    const target = scratch('editor-drafts-cap-target-');
    mkdirSync(join(target, 'snote-behind'));
    writeFileSync(join(target, 'snote-behind', 'note.md'), 'behind link');
    symlinkSync(target, join(account, 'drafts'));
    const server = await fakeServer();
    const seed = makeStore({ stubClient: {} });
    saveState(seed.getState(), account);
    const notices: string[] = [];
    stops.push(onProblem((m) => notices.push(m)));
    const built = buildStore(
      { dataDir: account, appId: 'test-app', server: server.url, noteEditDelayMs: 10 },
      { email: 'test@example.com', token: 'test-token' },
      () => {},
    );
    stops.unshift(built.stopSaving);
    // timers of one delay run in the order they were set: this one runs after the recovery timer
    await new Promise((r) => setTimeout(r, 0));
    expect(noteContents(built.store)).toEqual([]);
    expect(notices.filter((m) => m.includes('draft') || m.includes('Draft') || m.includes('Restored'))).toEqual([]);
    expect(readFileSync(join(target, 'snote-behind', 'note.md'), 'utf-8')).toBe('behind link');
  });
});
