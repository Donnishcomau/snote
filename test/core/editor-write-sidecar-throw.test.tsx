/**
 * #670: a throwing writeSource in the save callback of a `:w` (the sidecar rewrite after the save) must not leave the
 * session thinking a callback still waits. The next `:w` registers its own save callback and the sidecar follows the
 * note again; a restart after a failed `:w` reads a sidecar that names the last saved write, not an older one.
 * Test 1 and 2 inject the throw through a mock of writeSource (the real one swallows its own errors; this is the seam
 * for a throw from anywhere in the callback).
 */
import { describe, it, expect, afterEach, beforeEach, vi } from 'vitest';
import { createHash } from 'node:crypto';
import { cpSync, existsSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const gate = vi.hoisted(() => ({ throwNext: false, threw: 0 }));
vi.mock('../../src/core/editor-drafts', async (orig) => {
  const real = await orig<typeof import('../../src/core/editor-drafts')>();
  return {
    ...real,
    writeSource: (...args: Parameters<typeof real.writeSource>): void => {
      if (gate.throwNext) {
        gate.throwNext = false;
        gate.threw++;
        throw new Error('injected writeSource failure');
      }
      real.writeSource(...args);
    },
  };
});

import { editInEditor } from '../../src/core/editor';
import { draftsDir, recoverDrafts, setDraftsDir } from '../../src/core/editor-drafts';
import { loadState, persistOnChange, saveState } from '../../src/core/persistence';
import { makeStore } from '../../src/core/store';
import { editSelectedNote } from '../../src/tui/app-actions';
import { stepEditor, type StepEditor } from '../helpers/step-editor';
import type { State } from '../../src/core/store';
import type { EntityId } from '@vendor/types';

const eid = (id: string): EntityId => id as unknown as EntityId;
const quiet = { pause: () => undefined, resume: () => undefined };
const sha = (t: string): string => createHash('sha256').update(t, 'utf8').digest('hex');
let ed: StepEditor | undefined;
let handedBack: () => boolean = () => true;
let stopSave: (() => void) | undefined;
let account = '';
beforeEach(() => {
  account = mkdtempSync(join(tmpdir(), 'editor-write-sidecar-throw-'));
  setDraftsDir(join(account, 'drafts'));
  gate.throwNext = false;
  gate.threw = 0;
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

const folder = (root: string): string => join(root, readdirSync(root).find((n) => n.startsWith('snote-'))!);
const sidecarSha = (root: string): string => (JSON.parse(readFileSync(join(folder(root), 'source.json'), 'utf8')) as { sha256: string }).sha256;

/** Note n1 (`old note`) saved, opened in the step editor; the first save callback after `arm` throws. */
function open(): { dataDir: string; state: string } {
  ed = stepEditor('vi');
  const bin = ed.bin;
  const dataDir = join(account, 'data');
  const store = makeStore({ stubClient: {} });
  store.dispatch({ type: 'CREATE_NOTE_WITH_ID', noteId: eid('n1'), note: { content: 'old note', systemTags: [], tags: [] } } as never);
  saveState(store.getState(), dataDir);
  stopSave = persistOnChange(store, dataDir, 20);
  let raw = true;
  handedBack = () => raw;
  editSelectedNote({
    store,
    selectedEntry: { id: eid('n1'), note: store.getState().data.notes.get(eid('n1'))! },
    setRawMode: (m) => (raw = m),
    runEditor: (initial, o) => editInEditor(initial, { editor: bin, stdin: quiet, ...o }),
  });
  return { dataDir, state: join(dataDir, 'state.json') };
}

/** A failed `:w` (`first write`), then a good one (`second write`) saved to state.json. */
async function failThenWrite(): Promise<string> {
  const { dataDir, state } = open();
  gate.throwNext = true;
  ed!.write('first write');
  await expect.poll(() => gate.threw, { timeout: 2000 }).toBe(1); // the save held `first write`, its callback threw
  ed!.write('second write');
  await expect.poll(() => existsSync(state) && readFileSync(state, 'utf8').includes('second write'), { timeout: 2000 }).toBe(true);
  return dataDir;
}

describe('#670 a throwing writeSource does not stop the sidecar following the note', () => {
  it('1: WHEN the sidecar rewrite throws at the save of `first write` and the editor then writes `second write` THEN once that is saved source.json names `second write` (not `old note`)', async () => {
    await failThenWrite();
    await expect.poll(() => sidecarSha(draftsDir()), { timeout: 2000 }).toBe(sha('second write'));
  });

  it('2: WHEN the sidecar rewrite threw at `first write`, `second write` was saved and the draft then holds `third write` (never handed on) when snote is killed THEN the next start holds only note `n1`, with `third write`, and no second note', async () => {
    const dataDir = await failThenWrite();
    await expect.poll(() => sidecarSha(draftsDir()), { timeout: 2000 }).toBe(sha('second write'));
    const snap = mkdtempSync(join(account, 'kill-'));
    cpSync(dataDir, join(snap, 'data'), { recursive: true, preserveTimestamps: true });
    cpSync(draftsDir(), join(snap, 'drafts'), { recursive: true, preserveTimestamps: true });
    const md = readdirSync(folder(join(snap, 'drafts'))).find((n) => n.endsWith('.md'))!;
    writeFileSync(join(folder(join(snap, 'drafts')), md), 'third write'); // the editor wrote it after the last save
    const next = makeStore({ stubClient: {}, preloadedState: loadState(join(snap, 'data')) as Partial<State> });
    recoverDrafts(next, join(snap, 'drafts'));
    expect([...next.getState().data.notes.entries()].map(([id, n]) => [id, n.content])).toEqual([['n1', 'third write']]);
  });
});
