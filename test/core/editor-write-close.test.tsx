/**
 * #97 (slice 97d): closing the external editor after a write. A close with
 * the text already written changes nothing more (no second save); a last
 * write that went back to the original text still wins; a failing editor
 * after a write leaves that write in the note and keeps the draft; the
 * draft folder goes only once the note is on disk (#65 kept).
 */
import { describe, it, expect, afterEach, beforeEach } from 'vitest';
import { existsSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { editInEditor } from '../../src/core/editor';
import { draftsDir, setDraftsDir } from '../../src/core/editor-drafts';
import { persistOnChange } from '../../src/core/persistence';
import { makeStore } from '../../src/core/store';
import { editSelectedNote } from '../../src/tui/app-actions';
import { stepEditor, type StepEditor } from '../helpers/step-editor';
import type { EntityId } from '@vendor/types';

const eid = (id: string): EntityId => id as unknown as EntityId;
const quiet = { pause: () => undefined, resume: () => undefined };
const cleanup: (() => void)[] = [];
let ed: StepEditor | undefined;
let handedBack: () => boolean = () => true;
let account = '';
beforeEach(() => {
  account = mkdtempSync(join(tmpdir(), 'editor-write-close-'));
  setDraftsDir(join(account, 'drafts'));
});
afterEach(async () => {
  if (ed && !ed.exited()) ed.quit(0);
  await expect.poll(handedBack, { timeout: 2000 }).toBe(true);
  ed?.remove();
  ed = undefined;
  for (const f of cleanup.splice(0)) f();
  rmSync(account, { recursive: true, force: true });
  setDraftsDir(null);
});

/** Open note n1 (`text`, by default `old note`) in the step editor; `edits` lists every EDIT_NOTE text, `error` the editor failure. */
function open(text = 'old note') {
  ed = stepEditor('vi');
  const bin = ed.bin;
  const store = makeStore({ stubClient: {} });
  store.dispatch({ type: 'CREATE_NOTE_WITH_ID', noteId: eid('n1'), note: { content: text, systemTags: [], tags: [] } } as never);
  const edits: string[] = [];
  const dispatch = store.dispatch;
  store.dispatch = ((a: { type: string; changes?: { content?: string } }) => {
    if (a.type === 'EDIT_NOTE') edits.push(a.changes?.content ?? '');
    return dispatch(a as never);
  }) as typeof store.dispatch;
  let raw = true;
  let error = '';
  const errors: string[] = [];
  handedBack = () => raw;
  const run = () => editSelectedNote({
    store,
    selectedEntry: { id: eid('n1'), note: store.getState().data.notes.get(eid('n1'))! },
    setRawMode: (m) => (raw = m),
    runEditor: (initial, o) => editInEditor(initial, { editor: bin, stdin: quiet, ...o }),
    onEditorError: (m) => { error = m; errors.push(m); },
  });
  return { store, edits, run, closed: () => raw, error: () => error, errors };
}
const text = (store: ReturnType<typeof makeStore>): string | undefined => store.getState().data.notes.get(eid('n1'))?.content;
const drafts = (): string[] => (existsSync(draftsDir()) ? readdirSync(draftsDir()).filter((n) => n.startsWith('snote-')) : []);

describe('#97 97d closing the editor after a write', () => {
  it('1: WHEN the editor writes `final text` and then quits with the file unchanged THEN the note holds `final text` and EDIT_NOTE was dispatched exactly `1` time', async () => {
    const o = open();
    o.run();
    ed!.write('final text');
    await expect.poll(() => text(o.store), { timeout: 2000 }).toBe('final text');
    ed!.quit(0);
    await expect.poll(() => ({ back: o.closed(), text: text(o.store), edits: o.edits }), { timeout: 2000 })
      .toEqual({ back: true, text: 'final text', edits: ['final text'] });
  });

  it('2: (pass-on-old) WHEN the editor writes `changed`, then writes `old note` (the text it began with) and quits at once THEN the note holds `old note`', async () => {
    const o = open();
    o.run();
    ed!.write('changed');
    await expect.poll(() => text(o.store), { timeout: 2000 }).toBe('changed');
    ed!.write('old note');
    ed!.quit(0);
    await expect.poll(() => ({ back: o.closed(), text: text(o.store) }), { timeout: 2000 }).toEqual({ back: true, text: 'old note' });
  });

  it('3: (pass-on-old) WHEN the editor writes `kept write` and then exits with status `1` THEN the note holds `kept write`, the error says `Your text is kept in` and `1` draft folder is left', async () => {
    const o = open();
    o.run();
    ed!.write('kept write');
    await expect.poll(() => text(o.store), { timeout: 2000 }).toBe('kept write');
    ed!.quit(1);
    await expect.poll(() => ({ text: text(o.store), kept: o.error().includes('Your text is kept in'), drafts: drafts().length }), { timeout: 2000 })
      .toEqual({ text: 'kept write', kept: true, drafts: 1 });
  });

  it('4: (pass-on-old) WHEN the store is saved to disk and the editor writes `on disk text` and quits THEN the draft folder is removed, and never while state.json lacks `on disk text`', async () => {
    const o = open();
    const dataDir = join(account, 'data');
    const stop = persistOnChange(o.store, dataDir, 300);
    cleanup.push(() => stop());
    o.run();
    await expect.poll(() => drafts().length, { timeout: 2000 }).toBe(1);
    ed!.write('on disk text');
    await expect.poll(() => text(o.store), { timeout: 2000 }).toBe('on disk text');
    ed!.quit(0);
    let early = false;
    const onDisk = (): boolean => existsSync(join(dataDir, 'state.json')) && readFileSync(join(dataDir, 'state.json'), 'utf8').includes('on disk text');
    await expect.poll(() => {
      const gone = drafts().length === 0;
      const saved = onDisk();
      if (gone && !saved) early = true;
      return { gone, saved, early };
    }, { timeout: 2500, interval: 5 }).toEqual({ gone: true, saved: true, early: false });
  });

  it('5: (pass-on-old) WHEN the editor exits with status `1` and `late write` is then written to the kept draft THEN 500 ms later the note does not hold `late write`', async () => {
    const o = open();
    o.run();
    ed!.quit(1);
    await expect.poll(() => o.error().includes('Your text is kept in'), { timeout: 2000 }).toBe(true);
    const kept = /kept in (.*)$/.exec(o.error())![1];
    writeFileSync(kept, 'late write');
    await new Promise((r) => setTimeout(r, 500)); // a negative check: the watcher had 3 settle periods to hand it on
    expect(text(o.store)).toBe('old note');
  });

  it('6: WHEN a write\'s merge kept both versions (`LOCAL middle` against a remote `REMOTE middle` on the same line) and the editor then quits with the file unchanged THEN the notice `A change from another device could not be merged automatically - both versions were kept.` is shown once', async () => {
    const o = open('title line\nmiddle line\nlast line');
    o.run();
    o.store.dispatch({ type: 'EDIT_NOTE', noteId: eid('n1'), changes: { content: 'title line\nREMOTE middle\nlast line' } } as never);
    ed!.write('title line\nLOCAL middle\nlast line');
    await expect.poll(() => ({ local: text(o.store)?.includes('LOCAL middle'), remote: text(o.store)?.includes('REMOTE middle') }), { timeout: 2000 })
      .toEqual({ local: true, remote: true });
    ed!.quit(0);
    await expect.poll(() => ({ back: o.closed(), errors: o.errors }), { timeout: 2000 })
      .toEqual({ back: true, errors: ['A change from another device could not be merged automatically - both versions were kept.'] });
  });
});
