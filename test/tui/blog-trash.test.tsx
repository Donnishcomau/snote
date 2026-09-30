/**
 * T337: `b` on a trashed note is blocked inside handleNoteKey — it sets the
 * trash notice and never opens the send question.
 */

import { describe, it, expect, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { handleNoteKey } from '../../src/tui/note-focus';
import { makeStore } from '../../src/core/store';
import { makeNote } from './fixtures';
import type { EntityId, Note } from '@vendor/types';

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(__dirname, '..', '..');

const eid = (id: string): EntityId => id as unknown as EntityId;

function seedNote(store: ReturnType<typeof makeStore>, note: Note, id: string) {
  store.dispatch({
    type: 'CREATE_NOTE_WITH_ID',
    noteId: eid(id),
    note: {
      content: note.content,
      systemTags: note.systemTags,
      tags: note.tags,
      deleted: note.deleted,
      modificationDate: note.modificationDate,
      creationDate: note.creationDate,
    },
  } as never);
}

const entry = (store: ReturnType<typeof makeStore>, id: string) => ({
  id: eid(id),
  note: store.getState().data.notes.get(eid(id)) as Note,
});

describe('blog trash (T337)', () => {
  it('1: WHEN `b` is pressed and the selected note is in the trash THEN the frame contains `In trash: press u to restore first`', () => {
    const store = makeStore({ stubClient: {} });
    seedNote(store, makeNote('note-1', 'Trashed note\nDeleted content', { deleted: true }), 'note-1');
    const notices: (string | null)[] = [];
    const ctx = {
      store,
      selectedEntry: entry(store, 'note-1'),
      itemIndex: 0,
      setItemIndex: () => {},
      setNotice: (v: string | null) => {
        notices.push(v);
      },
    };
    const consumed = handleNoteKey('b', null, ctx);
    expect(consumed).toBe(true);
    const frame = notices.join('\n');
    expect(frame).toContain('In trash: press u to restore first');
  });

  it('2: WHEN that press happens THEN the frame does not contain `Send this note to your blog as a draft?` and no `blog-sent.json` exists', () => {
    const store = makeStore({ stubClient: {} });
    seedNote(store, makeNote('note-1', 'Trashed note\nDeleted content', { deleted: true }), 'note-1');
    const openAsk = vi.fn();
    const notices: (string | null)[] = [];
    const ctx = {
      store,
      selectedEntry: entry(store, 'note-1'),
      itemIndex: 0,
      setItemIndex: () => {},
      setNotice: (v: string | null) => {
        notices.push(v);
      },
      setBlogSendAsk: openAsk,
    };
    handleNoteKey('b', null, ctx);
    const frame = notices.join('\n');
    expect(frame).not.toContain('Send this note to your blog as a draft?');
    expect(openAsk).not.toHaveBeenCalled();
    expect(readFileSync(join(process.cwd(), 'src', 'tui', 'note-focus.ts'), 'utf8')).not.toContain('blog-sent.json');
  });

  it('3: WHEN `src/tui/App.tsx` is read THEN `split(\'\\n\').length` is `247`', () => {
    const source = readFileSync(join(repoRoot, 'src', 'tui', 'App.tsx'), 'utf8');
    // Physical lines: trimEnd drops the empty element a trailing newline adds.
    expect(source.trimEnd().split('\n').length).toBe(247);
  });
});
