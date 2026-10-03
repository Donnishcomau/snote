import { useState } from 'react';

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
  return { open, base, openEdit, closeEdit };
}
