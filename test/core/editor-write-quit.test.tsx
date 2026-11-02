/**
 * #478 (, quit case): the external editor writes the same text again (an identical `:w`) while it is still
 * open and snote quits normally before the watcher's settle wait (WRITE_SETTLE_MS) ends. main's quit step settles
 * the pending reads first, so the next start (state.json and the drafts folder as the quit left them, then
 * recoverDrafts) holds one note, also when the write merged another device's change; a real write inside the
 * window reaches the note through the normal save; a quit with nothing pending reads nothing.
 * The settle wait is held by a setTimeout spy (only calls with the delay WRITE_SETTLE_MS), so "inside the
 * window" is a state the test waits for, never a sleep. The stop is taken as a copy of both folders (file times
 * kept), as in 97e, 97g and 97h.
 */
import { describe, it, expect, afterEach, beforeEach, vi } from 'vitest';
import { cpSync, existsSync, lstatSync, mkdtempSync, readdirSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { WRITE_SETTLE_MS } from '../../src/core/editor-write-watch';
import { editInEditor } from '../../src/core/editor';
import { draftsDir, recoverDrafts, setDraftsDir } from '../../src/core/editor-drafts';
import { loadState, persistOnChange, saveState } from '../../src/core/persistence';
import { makeStore } from '../../src/core/store';
import { editSelectedNote } from '../../src/tui/app-actions';
import { stepEditor, type StepEditor } from '../helpers/step-editor';
import type { State } from '../../src/core/store';
import type { EntityId } from '@vendor/types';

// Counts the draft reads of the watcher: a read after the identical `:w` shows that its settle has run.
const reads = vi.hoisted(() => ({ n: 0 }));
vi.mock('../../src/core/editor-drafts', async (orig) => {
  const m = await orig<typeof import('../../src/core/editor-drafts')>();
  return { ...m, readDraft: (...a: Parameters<typeof m.readDraft>) => (reads.n++, m.readDraft(...a)) };
});

const eid = (id: string): EntityId => id as unknown as EntityId;
const quiet = { pause: () => undefined, resume: () => undefined };
const LOCAL = 'LOCAL LINE\ntitle line\nmiddle line\nlast line';
const BASE = 'title line\nmiddle line\nlast line';
let ed: StepEditor | undefined;
let handedBack: () => boolean = () => true;
let stopSave: (() => void) | undefined;
let account = '';
beforeEach(() => {
  account = mkdtempSync(join(tmpdir(), 'editor-write-rewrite-'));
  setDraftsDir(join(account, 'drafts'));
});
afterEach(async () => {
  if (ed && !ed.exited()) ed.quit(0);
  await expect.poll(handedBack, { timeout: 2000 }).toBe(true);
  ed?.remove();
  ed = undefined;
  stopSave?.();
  stopSave = undefined;
  rmSync(account, { recursive: true, force: true });
  setDraftsDir(null);
});

/** The one draft folder of the session and its .md file. */
function session(): { folder: string; md: string } {
  const folder = join(draftsDir(), readdirSync(draftsDir()).find((n) => n.startsWith('snote-'))!);
  return { folder, md: join(folder, readdirSync(folder).find((n) => n.endsWith('.md'))!) };
}
/** True while source.json still has the file time the last saved write gave it: the draft's less 1.5 s (97e). */
const stamped = (): boolean => {
  if (!existsSync(draftsDir()) || !readdirSync(draftsDir()).some((n) => n.startsWith('snote-'))) return false;
  const s = session();
  return Math.abs(lstatSync(s.md).mtimeMs - lstatSync(join(s.folder, 'source.json')).mtimeMs - 1500) < 2;
};

/**
 * Note n1 (`initial`) in a saved store, opened in the step editor, which writes `text` (step 1). Resolves once
 * state.json holds `text` (`onDisk`), or once the store holds it before any save (`onDisk` false, a save 1.5 s away).
 * With `remote`, another device's change `remote` reaches the note before the write.
 */
async function writeFirst(text: string, o: { initial?: string; remote?: string; onDisk?: boolean } = {}): Promise<string> {
  const { initial = 'old note', remote, onDisk = true } = o;
  const dataDir = join(account, 'data');
  ed = stepEditor('vi');
  const bin = ed.bin;
  const store = makeStore({ stubClient: {} });
  store.dispatch({ type: 'CREATE_NOTE_WITH_ID', noteId: eid('n1'), note: { content: initial, systemTags: [], tags: [] } } as never);
  if (remote === undefined) saveState(store.getState(), dataDir);
  stopSave = persistOnChange(store, dataDir, onDisk ? 20 : 1500);
  let raw = true;
  handedBack = () => raw;
  editSelectedNote({
    store,
    selectedEntry: { id: eid('n1'), note: store.getState().data.notes.get(eid('n1'))! },
    setRawMode: (m) => (raw = m),
    runEditor: (initial, opts) => editInEditor(initial, { editor: bin, stdin: quiet, ...opts }),
  });
  if (remote !== undefined) store.dispatch({ type: 'EDIT_NOTE', noteId: eid('n1'), changes: { content: remote } } as never);
  ed.write(text);
  const state = join(dataDir, 'state.json');
  const saved = (): boolean => existsSync(state) && readFileSync(state, 'utf8').includes(remote === undefined ? text : 'REMOTE LINE') && readFileSync(state, 'utf8').includes('LOCAL LINE') === text.includes('LOCAL LINE');
  if (onDisk) await expect.poll(() => ({ saved: saved(), stamped: stamped() }), { timeout: 2000 }).toEqual({ saved: true, stamped: true });
  else await expect.poll(() => ({ held: store.getState().data.notes.get(eid('n1'))?.content, saved: saved() }), { timeout: 1000 }).toEqual({ held: text, saved: false });
  return dataDir;
}

/** The stop: copy the data and drafts folders as they are now, then start from the copy and recover. */
function stopAndRestart(dataDir: string): { notes: Record<string, string>; folders: number } {
  const snap = mkdtempSync(join(account, 'stop-'));
  cpSync(dataDir, join(snap, 'data'), { recursive: true, preserveTimestamps: true });
  cpSync(draftsDir(), join(snap, 'drafts'), { recursive: true, preserveTimestamps: true });
  const next = makeStore({ stubClient: {}, preloadedState: loadState(join(snap, 'data')) as Partial<State> });
  recoverDrafts(next, join(snap, 'drafts'));
  const notes = Object.fromEntries([...next.getState().data.notes.entries()].map(([id, n]) => [id, n.content ?? '']));
  return { notes, folders: readdirSync(join(snap, 'drafts')).filter((n) => n.startsWith('snote-')).length };
}

/** Hold every settle wait the watcher starts from now on (only the calls with the delay WRITE_SETTLE_MS); `n()` counts them. */
function holdSettleWaits(): { n: () => number } {
  const real = globalThis.setTimeout;
  let count = 0;
  vi.spyOn(globalThis, 'setTimeout').mockImplementation(((fn: () => void, ms?: number, ...rest: unknown[]) => {
    if (ms !== WRITE_SETTLE_MS) return real(fn, ms, ...rest);
    count++;
    return real(() => undefined, 2 ** 30).unref(); // a handle the watcher can clear; its settle never fires by itself
  }) as typeof setTimeout);
  return { n: () => count };
}

/** The editor writes `text` again (step 2) while it stays open; resolves once the file holds it and the watcher began its settle wait (held). */
async function rewriteHeld(text: string, held: { n: () => number }): Promise<void> {
  ed!.write(text);
  await expect.poll(() => ed!.done(2) && held.n() >= 1, { timeout: 2000 }).toBe(true);
}

/** main's quit step as far as the editor is concerned: settle the pending reads, then stop saving (the flush). */
async function settleStep(): Promise<void> {
  const m = (await import('../../src/core/editor-write-watch')) as { settleDraftWrites?: () => void };
  m.settleDraftWrites?.();
}
async function quitStep(): Promise<void> {
  await settleStep();
  stopSave?.();
  stopSave = undefined;
}

describe('#478 a normal quit inside the settle wait of a write in the open editor', () => {
  afterEach(() => vi.restoreAllMocks());

  it('1: WHEN a remote change added `REMOTE LINE` to the note while the editor was open, the editor wrote `LOCAL LINE` above the original text, state.json held both, the editor then wrote the same text again and stayed open, and snote quit before the settle wait ended THEN the next start holds only note `n1`, with both `REMOTE LINE` and `LOCAL LINE`, and `0` draft folders', async () => {
    const dataDir = await writeFirst(LOCAL, { initial: BASE, remote: BASE + '\nREMOTE LINE' });
    const held = holdSettleWaits();
    await rewriteHeld(LOCAL, held);
    await quitStep();
    const next = stopAndRestart(dataDir);
    expect({ ids: Object.keys(next.notes), local: next.notes.n1?.includes('LOCAL LINE'), remote: next.notes.n1?.includes('REMOTE LINE'), folders: next.folders })
      .toEqual({ ids: ['n1'], local: true, remote: true, folders: 0 });
  });

  it('2: (pass-on-old) WHEN the editor wrote `plain write`, state.json held it, the editor wrote the same text again and snote quit before the settle wait ended THEN the next start holds only note `n1` with `plain write` and `0` draft folders', async () => {
    const dataDir = await writeFirst('plain write');
    const held = holdSettleWaits();
    await rewriteHeld('plain write', held);
    await quitStep();
    expect(stopAndRestart(dataDir)).toEqual({ notes: { n1: 'plain write' }, folders: 0 });
  });

  it('3: WHEN `first write` was saved, the editor then wrote a different text `second write` and snote quit before the settle wait ended THEN state.json itself holds `second write` in note `n1` (the quit step handed the write on, no recovery needed), and the next start holds only note `n1` with `second write` and `0` draft folders', async () => {
    const dataDir = await writeFirst('first write');
    const held = holdSettleWaits();
    await rewriteHeld('second write', held);
    await quitStep();
    const saved = loadState(dataDir) as State;
    expect(saved.data.notes.get(eid('n1'))?.content).toBe('second write');
    expect(stopAndRestart(dataDir)).toEqual({ notes: { n1: 'second write' }, folders: 0 });
  });

  it('4: WHEN the editor is open, nothing was written after the saved `plain write`, and snote quits THEN the quit step reads the draft `0` more times and source.json keeps its bytes and its file time, and the next start holds only note `n1` with `plain write`', async () => {
    const dataDir = await writeFirst('plain write');
    const { folder } = session();
    const before = { reads: reads.n, bytes: readFileSync(join(folder, 'source.json'), 'utf8'), at: lstatSync(join(folder, 'source.json')).mtimeMs };
    await quitStep();
    expect({ reads: reads.n, bytes: readFileSync(join(folder, 'source.json'), 'utf8'), at: lstatSync(join(folder, 'source.json')).mtimeMs }).toEqual(before);
    expect(stopAndRestart(dataDir)).toEqual({ notes: { n1: 'plain write' }, folders: 0 });
  });

  it('5: WHEN no editor is open, and WHEN an editor was open and has closed while the watcher still had a settle wait started, and snote quits THEN the quit step reads no draft (`0` reads) and does not throw', async () => {
    const start = reads.n;
    await quitStep();
    expect(reads.n).toBe(start);
    const held = holdSettleWaits();
    ed = stepEditor('vi');
    const bin = ed.bin;
    const store = makeStore({ stubClient: {} });
    store.dispatch({ type: 'CREATE_NOTE_WITH_ID', noteId: eid('n1'), note: { content: 'old note', systemTags: [], tags: [] } } as never);
    let raw = true;
    handedBack = () => raw;
    editSelectedNote({
      store,
      selectedEntry: { id: eid('n1'), note: store.getState().data.notes.get(eid('n1'))! },
      setRawMode: (m) => (raw = m),
      runEditor: (initial, opts) => editInEditor(initial, { editor: bin, stdin: quiet, ...opts }),
    });
    await expect.poll(() => held.n() >= 1, { timeout: 2000 }).toBe(true); // the watcher runs, its first wait is held
    ed.quit(0);
    await expect.poll(handedBack, { timeout: 2000 }).toBe(true);
    await quitStep();
    expect(reads.n).toBe(start);
  });

  it('6: WHEN src/cli/main.tsx is read THEN its quit step loads editor-write-watch with `import(` and calls `settleDraftWrites()` after `quit.current()` and before `sendBeforeQuit(quitStore)`, and again after the send wait and before `stopSaving();`, each inside its own try that ends `catch { /* quit as before */ }`, and does not import it statically', () => {
    const main = readFileSync('src/cli/main.tsx', 'utf8');
    const at = (t: string, from = 0): number => main.indexOf(t, from);
    const call = "try { (await import('../core/editor-write-watch')).settleDraftWrites(); } catch { /* quit as before */ }";
    const first = at(call);
    const second = at(call, first + 1);
    expect({ first: first > at('quit.current()') && first < at('sendBeforeQuit(quitStore)'), second: second > at('sendBeforeQuit(quitStore)') && second < at('  stopSaving();', second), statically: /from\s+['"][./]+(core\/)?editor-write-watch['"]/.test(main) })
      .toEqual({ first: true, second: true, statically: false });
  });

  it('7: WHEN the editor wrote the same text again during the send wait (after the first settle, inside a new settle wait that is held) and snote then finished the wait THEN the second settle makes the next start hold only note `n1`, with both `REMOTE LINE` and `LOCAL LINE`, and `0` draft folders', async () => {
    const dataDir = await writeFirst(LOCAL, { initial: BASE, remote: BASE + '\nREMOTE LINE' });
    const held = holdSettleWaits();
    await settleStep(); // the first settle: nothing is pending
    await rewriteHeld(LOCAL, held); // the identical :w made during sendBeforeQuit's wait
    await quitStep(); // the second settle, then the save stop
    const next = stopAndRestart(dataDir);
    expect({ ids: Object.keys(next.notes), local: next.notes.n1?.includes('LOCAL LINE'), remote: next.notes.n1?.includes('REMOTE LINE'), folders: next.folders })
      .toEqual({ ids: ['n1'], local: true, remote: true, folders: 0 });
  });
});
