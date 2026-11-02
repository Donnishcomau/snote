/**
 * #97 (slice 97b): while the external editor is open, each write of its draft
 * file (`:w`) becomes the note's text, without the editor closing. The
 * watcher reads only the one draft file, never through a symlink, and loads
 * only when the editor opens (it is not part of the start).
 */
import { describe, it, expect, afterEach, beforeEach } from 'vitest';
import { mkdtempSync, readdirSync, readFileSync, rmSync, symlinkSync, unlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { editInEditor, expectNote } from '../../src/core/editor';
import { MAX_DRAFT_BYTES, draftsDir, readDraft, setDraftsDir } from '../../src/core/editor-drafts';
import { watchDraftWrites } from '../../src/core/editor-write-watch';
import { makeStore } from '../../src/core/store';
import { editSelectedNote } from '../../src/tui/app-actions';
import { stepEditor, type StepEditor } from '../helpers/step-editor';
import type { EntityId } from '@vendor/types';

const eid = (id: string): EntityId => id as unknown as EntityId;
const quiet = { pause: () => undefined, resume: () => undefined };
const cleanup: string[] = [];
let ed: StepEditor | undefined;
let handedBack: () => boolean = () => true;
beforeEach(() => {
  const account = mkdtempSync(join(tmpdir(), 'editor-write-watch-'));
  cleanup.push(account);
  setDraftsDir(join(account, 'drafts'));
});
afterEach(async () => {
  if (ed && !ed.exited()) ed.quit(0);
  await expect.poll(handedBack, { timeout: 2000 }).toBe(true); // the next test may open the editor again
  ed?.remove();
  ed = undefined;
  for (const d of cleanup.splice(0)) rmSync(d, { recursive: true, force: true });
  setDraftsDir(null);
});

/** Open note n1 (`text`, by default `old note`) in the step editor through the app's own action. */
function open(text = 'old note'): { store: ReturnType<typeof makeStore>; edits: string[]; closed: () => boolean } {
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
  editSelectedNote({
    store,
    selectedEntry: { id: eid('n1'), note: store.getState().data.notes.get(eid('n1'))! },
    setRawMode: (m) => (raw = m),
    runEditor: (initial, o) => editInEditor(initial, { editor: bin, stdin: quiet, ...o }),
  });
  handedBack = () => raw;
  return { store, edits, closed: () => raw };
}
const content = (store: ReturnType<typeof makeStore>): string | undefined => store.getState().data.notes.get(eid('n1'))?.content;

/** A watcher on a hand-made draft, after its first read; `settled()` resolves after the next settled read. */
async function watched(initial: string) {
  const dir = mkdtempSync(join(tmpdir(), 'editor-write-watch-unit-'));
  cleanup.push(dir);
  const file = join(dir, 'note.md');
  writeFileSync(file, initial, { mode: 0o600 });
  const calls: string[] = [];
  let wake: (() => void) | undefined;
  const first = new Promise<void>((r) => { wake = r; });
  const stop = watchDraftWrites(file, initial, readDraft, (t) => calls.push(t), () => wake?.());
  await first;
  const settled = (change: () => void) => new Promise<void>((r) => { wake = r; change(); });
  return { dir, file, calls, stop, settled };
}

describe('#97 97b a write in the open editor becomes the note text', () => {
  it('1: WHEN the user writes `first write` while the editor stays open THEN within 2 s the note holds `first write`, the editor has not exited and the terminal is not handed back', async () => {
    const { store, closed } = open();
    ed!.write('first write');
    await expect.poll(() => ({ text: content(store), exited: ed!.exited(), handedBack: closed() }), { timeout: 2000 })
      .toEqual({ text: 'first write', exited: false, handedBack: false });
  });

  it('2: WHEN the editor writes `renamed write` by moving a new file over the draft (as nvim does) THEN the note holds `renamed write` while the editor stays open', async () => {
    const { store } = open();
    ed!.write('renamed write', 'rename');
    await expect.poll(() => ({ text: content(store), exited: ed!.exited() }), { timeout: 2000 }).toEqual({ text: 'renamed write', exited: false });
  });

  it('3: WHEN a write leaves the file empty, then blank, then equal to the text it began with THEN the watcher hands on nothing (`0` calls), and a later write `new text` is handed on `1` time', async () => {
    const w = await watched('same');
    await w.settled(() => writeFileSync(w.file, ''));
    await w.settled(() => writeFileSync(w.file, '  \n'));
    await w.settled(() => writeFileSync(w.file, 'same'));
    expect(w.calls).toEqual([]);
    await w.settled(() => writeFileSync(w.file, 'new text'));
    w.stop();
    expect(w.calls).toEqual(['new text']);
  });

  it('4: WHEN the draft is replaced by a symlink to a file outside holding `outside text` THEN the watcher hands on nothing and the outside file still reads `outside text`', async () => {
    const w = await watched('draft text');
    const outside = join(w.dir, '..', `${w.dir.split('/').pop()}-outside.txt`);
    writeFileSync(outside, 'outside text');
    cleanup.push(outside);
    await w.settled(() => { unlinkSync(w.file); symlinkSync(outside, w.file); });
    w.stop();
    expect({ calls: w.calls, outside: readFileSync(outside, 'utf8') }).toEqual({ calls: [], outside: 'outside text' });
  });

  it('5: WHEN two writes `one` then `two` happen and the editor then quits with the file at `two` THEN the note holds `two`, EDIT_NOTE carried `one` and `two` in that order, and the store holds `1` note', async () => {
    const { store, edits, closed } = open();
    ed!.write('one');
    await expect.poll(() => content(store), { timeout: 2000 }).toBe('one');
    ed!.write('two');
    await expect.poll(() => content(store), { timeout: 2000 }).toBe('two');
    ed!.quit(0);
    await expect.poll(() => ({ handedBack: closed(), text: content(store), notes: store.getState().data.notes.size, first: edits.slice(0, 2) }), { timeout: 2000 })
      .toEqual({ handedBack: true, text: 'two', notes: 1, first: ['one', 'two'] });
  });

  it('6: WHEN every file under src/ is read THEN none imports `editor-write-watch` statically, and src/core/editor.ts loads it with `import(\'./editor-write-watch\')`', () => {
    const files: string[] = [];
    const walk = (d: string): void => {
      for (const e of readdirSync(d, { withFileTypes: true })) {
        if (e.isDirectory()) walk(join(d, e.name));
        else if (/\.tsx?$/.test(e.name)) files.push(join(d, e.name));
      }
    };
    walk('src');
    const statics = files.filter((f) => /from\s+['"][./]+(core\/)?editor-write-watch['"]/.test(readFileSync(f, 'utf8')));
    expect(statics).toEqual([]);
    expect(readFileSync('src/core/editor.ts', 'utf8')).toContain("import('./editor-write-watch')");
    expect(draftsDir()).toContain('drafts');
  });

  it('7: WHEN a remote change adds `REMOTE LINE` to the note while the editor is open and the editor then writes `LOCAL LINE` above the original text THEN the note holds both `LOCAL LINE` and `REMOTE LINE`', async () => {
    const { store } = open('title line\nmiddle line\nlast line');
    store.dispatch({ type: 'EDIT_NOTE', noteId: eid('n1'), changes: { content: 'title line\nmiddle line\nlast line\nREMOTE LINE' } } as never);
    ed!.write('LOCAL LINE\ntitle line\nmiddle line\nlast line');
    await expect.poll(() => ({ local: content(store)?.includes('LOCAL LINE'), remote: content(store)?.includes('REMOTE LINE') }), { timeout: 2000 })
      .toEqual({ local: true, remote: true });
  });

  it('8: WHEN the note is deleted forever on another device (REMOTE_NOTE_DELETE_FOREVER) while the editor is open and the editor then writes `after delete` THEN exactly `1` note holds `after delete`', async () => {
    const { store } = open();
    store.dispatch({ type: 'REMOTE_NOTE_DELETE_FOREVER', noteId: eid('n1') } as never);
    ed!.write('after delete');
    await expect.poll(() => [...store.getState().data.notes.values()].filter((n) => (n.content ?? '').includes('after delete')).length, { timeout: 2000 }).toBe(1);
  });

  it('9: WHEN a write makes the draft one byte over MAX_DRAFT_BYTES THEN the watcher hands on nothing (`0` calls) and the note keeps its text', async () => {
    const w = await watched('small');
    await w.settled(() => writeFileSync(w.file, 'x'.repeat(MAX_DRAFT_BYTES + 1)));
    w.stop();
    expect({ calls: w.calls.length, cap: MAX_DRAFT_BYTES }).toEqual({ calls: 0, cap: 1048576 });
  });

  it('10: WHEN handing a write on throws THEN `0` uncaught errors are recorded and the editor\'s return still gives the file\'s text `thrown write`', async () => {
    ed = stepEditor('vi');
    const errs: unknown[] = [];
    const record = (e: unknown): void => { errs.push(e); };
    process.on('uncaughtException', record);
    try {
      let calls = 0;
      expectNote('n1');
      const back = editInEditor('orig', { editor: ed.bin, stdin: quiet, onWrite: () => { calls++; throw new Error('boom'); } });
      ed.write('thrown write');
      await expect.poll(() => calls, { timeout: 2000 }).toBe(1);
      ed.quit(0);
      expect({ got: await back, uncaught: errs.length }).toEqual({ got: 'thrown write', uncaught: 0 });
    } finally {
      process.off('uncaughtException', record);
    }
  });

  it('11: WHEN another device changes `the cat sat` to `the cow sat` while the editor is open and the editor then writes `the dog sat` THEN the note holds both `the dog sat` and `the cow sat` whole (the #390 loss check)', async () => {
    const { store } = open('title\nthe cat sat\nend');
    store.dispatch({ type: 'EDIT_NOTE', noteId: eid('n1'), changes: { content: 'title\nthe cow sat\nend' } } as never);
    ed!.write('title\nthe dog sat\nend');
    await expect.poll(() => ({ dog: content(store)?.includes('the dog sat'), cow: content(store)?.includes('the cow sat') }), { timeout: 2000 })
      .toEqual({ dog: true, cow: true });
  });

  it('12: WHEN the editor writes `two` and then writes the starting text `old note` back and quits at once THEN the note holds `old note`', async () => {
    const { store, closed } = open();
    ed!.write('two');
    await expect.poll(() => content(store), { timeout: 2000 }).toBe('two');
    ed!.write('old note');
    ed!.quit(0);
    await expect.poll(() => ({ handedBack: closed(), text: content(store) }), { timeout: 2000 }).toEqual({ handedBack: true, text: 'old note' });
  });
});
