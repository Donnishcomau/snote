import type { Store } from 'redux';

import type { State } from '../core/store';
import { paneLayout } from '../core/layout';
import { newNoteFields } from '../core/new-note';
import { mendOwn } from '../core/editor-conflict-merge';
import { saveInlineEdit } from './app-actions';
import type { InlineSession } from './inline-editor-state';

/** #618 (lane 4c): SNOTE_NEW_NOTE_EDITOR=inline makes `n` write the new note in the built-in editor; anything else is `external`. */
export const newNoteRoute = (env: NodeJS.ProcessEnv = process.env): 'inline' | 'external' => (env.SNOTE_NEW_NOTE_EDITOR === 'inline' ? 'inline' : 'external');

/** `n` opens the inline editor only when the route is on and the window shows the preview pane (else the editor would not be on screen). */
export const newNoteInline = (width: number, tagsOpen: boolean, tagsFocused: boolean, reading: boolean): boolean => newNoteRoute() === 'inline' && paneLayout(width, tagsOpen, tagsFocused, reading).previewWidthProp > 0;

export const NOTHING_TYPED = 'Nothing typed, so no note was created';

/**
 * The inline editor's store for a session: an existing note (or a new one already created) goes through
 * saveInlineEdit; a new note comes into being at the first store that holds text.
 * proof: test/tui/inline-new-note.test.tsx
 */
export function saveInlineSession(ctx: { store: Store<State>; session: { current: InlineSession }; local: string; onEditorError: (m: string) => void; onNotice?: (m: string) => void }): void {
  const { store, session, local, onEditorError, onNotice } = ctx; // #402: onNotice reaches saveInlineEdit
  const s = session.current;
  if (!s.entry) {
    if (!s.fresh || local.trim() === '') return;
    const { id, top } = s.fresh;
    const fields = newNoteFields(store.getState().ui.collection, top);
    try { store.dispatch({ type: 'CREATE_NOTE_WITH_ID', noteId: id, note: { content: local, systemTags: fields.systemTags, tags: fields.tags }, meta: { nextNoteToOpen: id } } as never); } // OMARCHY: boundary cast — the vendored action type carries meta
    finally { const note = store.getState().data.notes.get(id); if (note) { s.entry = { id, note }; s.stored = note.content; } } // #690: the note the store holds is the session's, even if the store rewrote its text (a lone half becomes U+FFFD) or a throw came after the reducer
    return;
  }
  saveInlineEdit({ store, selectedEntry: s.entry, base: s.stored, local, onEditorError, onNotice });
  s.stored = mendOwn(s.stored, local); // #701: the base is the text sent, mended as the merge mended it (a lone half is U+FFFD, as in the store)
}

/** The close of a new-note session (the editor has already stored its last text): say what became of it. */
export function finishInlineNew(ctx: { store: Store<State>; session: { current: InlineSession }; setNotice: (m: string) => void; setNoticeError: (m: string) => void }): void {
  const { store, session, setNotice, setNoticeError } = ctx;
  const s = session.current;
  if (!s.fresh) return;
  s.fresh = null;
  if (!s.entry) return setNotice(NOTHING_TYPED);
  if ((store.getState().data.notes.get(s.entry.id)?.content ?? '').trim() === '') {
    store.dispatch({ type: 'TRASH_NOTE', noteId: s.entry.id } as never); // OMARCHY: boundary cast
    return setNoticeError('Empty note moved to trash'); // as createNote: a new note emptied before the close is a discard, kept in the trash
  }
  setNotice('New note saved — press g to add tags');
}
