/**
 * #97 (slice 97f, AC8): a GUI editor (no inherited terminal) gets the same
 * write-while-open behaviour as a terminal one. A GUI editor that returns at
 * once (it hands the file to a window that is already open, and exits) ends
 * the session before any write: snote then keeps the note as it was, and the
 * text written later in that window does not reach snote. That is the limit
 * this slice records.
 */
import { describe, it, expect, afterEach, beforeEach } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { editInEditor } from '../../src/core/editor';
import { setDraftsDir } from '../../src/core/editor-drafts';
import { isTerminalEditor } from '../../src/core/editor-select';
import { makeStore } from '../../src/core/store';
import { editSelectedNote } from '../../src/tui/app-actions';
import { stepEditor, type StepEditor } from '../helpers/step-editor';
import type { EntityId } from '@vendor/types';

const eid = (id: string): EntityId => id as unknown as EntityId;
let ed: StepEditor | undefined;
let handedBack: () => boolean = () => true;
let account = '';
const direct = process.env.SNOTE_EDITOR_DIRECT;
beforeEach(() => {
  account = mkdtempSync(join(tmpdir(), 'editor-write-gui-'));
  setDraftsDir(join(account, 'drafts'));
  process.env.SNOTE_EDITOR_DIRECT = '1'; // run the editor itself, not through uwsm
});
afterEach(async () => {
  if (ed && !ed.exited()) ed.quit(0);
  await expect.poll(handedBack, { timeout: 2000 }).toBe(true);
  ed?.remove();
  ed = undefined;
  rmSync(account, { recursive: true, force: true });
  setDraftsDir(null);
  if (direct === undefined) delete process.env.SNOTE_EDITOR_DIRECT;
  else process.env.SNOTE_EDITOR_DIRECT = direct;
});

/** Open note n1 (`old note`) in the step editor named `snote-gui-ed` (not a terminal editor). */
function openGui() {
  ed = stepEditor('snote-gui-ed');
  const bin = ed.bin;
  const store = makeStore({ stubClient: {} });
  store.dispatch({ type: 'CREATE_NOTE_WITH_ID', noteId: eid('n1'), note: { content: 'old note', systemTags: [], tags: [] } } as never);
  const edits: string[] = [];
  const dispatch = store.dispatch;
  store.dispatch = ((a: { type: string; changes?: { content?: string } }) => {
    if (a.type === 'EDIT_NOTE') edits.push(a.changes?.content ?? '');
    return dispatch(a as never);
  }) as typeof store.dispatch;
  let pauses = 0;
  const stdin = { pause: () => { pauses++; }, resume: () => undefined };
  let raw = true;
  handedBack = () => raw;
  editSelectedNote({
    store,
    selectedEntry: { id: eid('n1'), note: store.getState().data.notes.get(eid('n1'))! },
    setRawMode: (m) => (raw = m),
    runEditor: (initial, o) => editInEditor(initial, { editor: bin, stdin, ...o }),
  });
  return { store, edits, pauses: () => pauses, closed: () => raw };
}
const text = (store: ReturnType<typeof makeStore>): string | undefined => store.getState().data.notes.get(eid('n1'))?.content;

describe('#97 97f a GUI editor', () => {
  it('1: WHEN a GUI editor (`snote-gui-ed`, not a terminal editor, stdin never paused) writes `gui write` while open THEN within 2 s the note holds `gui write` and the editor has not exited', async () => {
    const o = openGui();
    ed!.write('gui write');
    await expect.poll(() => ({ terminal: isTerminalEditor(ed!.bin), text: text(o.store), exited: ed!.exited(), pauses: o.pauses() }), { timeout: 2000 })
      .toEqual({ terminal: false, text: 'gui write', exited: false, pauses: 0 });
  });

  it('2: WHEN the GUI editor writes `gui one`, then `gui two`, and quits THEN the note holds `gui two` and EDIT_NOTE carried `gui one` and `gui two` once each', async () => {
    const o = openGui();
    ed!.write('gui one');
    await expect.poll(() => text(o.store), { timeout: 2000 }).toBe('gui one');
    ed!.write('gui two');
    await expect.poll(() => text(o.store), { timeout: 2000 }).toBe('gui two');
    ed!.quit(0);
    await expect.poll(() => ({ back: o.closed(), text: text(o.store), edits: o.edits }), { timeout: 2000 })
      .toEqual({ back: true, text: 'gui two', edits: ['gui one', 'gui two'] });
  });

  it('3: WHEN the GUI editor returns at once without writing (it handed the file to a window already open) THEN the note keeps `old note` and `0` EDIT_NOTE are dispatched (the recorded limit)', async () => {
    const o = openGui();
    ed!.quit(0);
    await expect.poll(() => ({ back: o.closed(), text: text(o.store), edits: o.edits.length }), { timeout: 2000 })
      .toEqual({ back: true, text: 'old note', edits: 0 });
  });
});
