import { useLayoutEffect, useState } from 'react';

// S6-02: Root's too-small screen must not quit over unsaved inline-editor text.
let editOpenNow = false;
export const isInlineEditOpen = (): boolean => editOpenNow;

/**
 * T315.2/T315.3: whether the built-in inline editor is open, swapping the
 * Preview pane for InlineEditor (src/tui/InlineEditor.tsx) inside MainPanes.
 * `base` is the note's content captured at the moment `openEdit` is called
 * (i.e. when `i` is pressed) — InlineEditor compares its live buffer against
 * `base` to decide whether Escape needs to confirm a discard, and
 * `saveInlineEdit` (app-actions.ts) merges against it on Ctrl+S.
 */
export function useInlineEditorState(): {
  open: boolean;
  base: string;
  openEdit: (content: string) => void;
  closeEdit: () => void;
} {
  const [open, setOpen] = useState(false);
  const [base, setBase] = useState('');
  const openEdit = (content: string) => {
    setBase(content);
    setOpen(true);
  };
  const closeEdit = () => setOpen(false);
  useLayoutEffect(() => {
    editOpenNow = open;
    return () => {
      editOpenNow = false;
    };
  }, [open]);
  return { open, base, openEdit, closeEdit };
}

/** T456: a line over this many UTF-16 units makes the inline editor too slow. */
export const INLINE_EDIT_MAX_LINE = 10000;
export const INLINE_EDIT_TOO_LONG = 'A line is over 10,000 characters: press e to edit in your editor';

/** The fixed notice when `i` must refuse for this content, else null. */
export function inlineEditRefusal(content: string): string | null {
  return content.split('\n').some((l) => l.length > INLINE_EDIT_MAX_LINE) ? INLINE_EDIT_TOO_LONG : null;
}
