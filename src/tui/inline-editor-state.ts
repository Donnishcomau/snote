import { useLayoutEffect, useRef, useState } from 'react';
import type { EntityId, Note } from '@vendor/types';

// Root's too-small screen must not quit over unsaved inline-editor text.
let editOpenNow = false;
export const isInlineEditOpen = (): boolean => editOpenNow;

/** #387: the note an inline session stores into (by its id, from `i`) and the text it last stored. */
export interface InlineSession {
  entry: { id: EntityId; note: Note } | null;
  stored: string;
  /** #618 4c: a new note not created yet (its id, and the list's top note for its fields); null for `i` and once finished */
  fresh?: { id: EntityId; top: Note | null } | null;
}

/**
 *.2/.3: whether the built-in inline editor is open, swapping the
 * Preview pane for InlineEditor (src/tui/InlineEditor.tsx) inside MainPanes.
 * `base` is the note's content captured at the moment `openEdit` is called
 * (i.e. when `i` is pressed): the editor's first text. #387: `session` keeps
 * the note selected at `i` for the whole session and the text last stored,
 * the base `saveInlineEdit` (app-actions.ts) merges against on each store.
 */
export function useInlineEditorState(): {
  open: boolean;
  base: string;
  session: { current: InlineSession };
  openEdit: (entry: { id: EntityId; note: Note }) => void;
  openNew: (id: EntityId, top: Note | null) => void;
  closeEdit: () => void;
} {
  const [open, setOpen] = useState(false);
  const [base, setBase] = useState('');
  const session = useRef<InlineSession>({ entry: null, stored: '' });
  const openEdit = (entry: { id: EntityId; note: Note }) => {
    const content = entry.note.content ?? '';
    session.current = { entry, stored: content };
    setBase(content);
    setOpen(true);
  };
  const openNew = (id: EntityId, top: Note | null) => {
    session.current = { entry: null, stored: '', fresh: { id, top } };
    setBase('');
    setOpen(true);
  };
  const closeEdit = () => setOpen(false);
  useLayoutEffect(() => {
    editOpenNow = open;
    return () => {
      editOpenNow = false;
    };
  }, [open]);
  return { open, base, session, openEdit, openNew, closeEdit };
}

/** a line over this many UTF-16 units makes the inline editor too slow. */
export const INLINE_EDIT_MAX_LINE = 10000;
export const INLINE_EDIT_TOO_LONG = 'A line is over 10,000 characters: press e to edit in your editor';

/**
 * more than this many non-ASCII code points makes the inline editor
 * redraw too slow per key (each U+0000-U+007F code point is cheap; long
 * ASCII notes stay editable, so the cap counts non-ASCII only).
 */
export const INLINE_EDIT_MAX_NON_ASCII = 20000;
export const INLINE_EDIT_TOO_MANY_NON_ASCII =
  'The note has over 20,000 non-ASCII characters: press e to edit in your editor';

/** The fixed notice when `i` must refuse for this content, else null. */
export function inlineEditRefusal(content: string): string | null {
  if (content.split('\n').some((l) => l.length > INLINE_EDIT_MAX_LINE)) return INLINE_EDIT_TOO_LONG;
  // #24: count one at a time and stop the moment the cap is passed;
  // content.match(...) builds one array entry per non-ASCII character
  // (millions of them) before a huge note is refused.
  const nonAsciiChar = /[^\x00-\x7f]/gu;
  let nonAscii = 0;
  while (nonAsciiChar.exec(content) !== null) {
    if (++nonAscii > INLINE_EDIT_MAX_NON_ASCII) return INLINE_EDIT_TOO_MANY_NON_ASCII;
  }
  return null;
}
