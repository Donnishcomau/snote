import { Box, Text, useInput } from 'ink';
import React, { useRef, useState } from 'react';
import { TextArea } from 'react-ink-textarea';
import type { TextAreaHandle } from 'react-ink-textarea';

import type { Note } from '@vendor/types';
import { previewColWidth } from './Preview';

export interface InlineEditorProps {
  note: Note | null;
  width: number;
  height: number;
  // the note's content when the editor opened (useInlineEditorState's `base`)
  base: string;
  onClose: () => void;
  onSave: (value: string) => void;
}

/** The [line, col] cursor position at the end of `text`. */
function endPosition(text: string): [number, number] {
  const lines = text.split('\n');
  const last = lines.length - 1;
  return [last, lines[last].length];
}

// T315.6 (director addition A): the long form names the Esc-keeps-editing
// behaviour explicitly; it only renders when the pane is wide enough,
// otherwise the short form is kept (still honouring Escape either way).
const DISCARD_PROMPT_LONG = 'discard changes? (y/n, Esc keeps editing)';
const DISCARD_PROMPT_SHORT = 'discard changes? (y/n)';

// T315.6 (director addition B): static footer hint, always shown while the
// editor is open, so Ctrl+S-to-save is obvious without opening Help.
const FOOTER_HINT = 'Ctrl+S save · Esc cancel · Enter new line';

/**
 * T315.2/T315.3/T315.4: mounts `react-ink-textarea` in the Preview pane's
 * slot. Typing goes through the controlled `value`/`cursorPosition` pair
 * (TextArea's own documented controlled-input shape); Enter is wired to
 * `onSubmit` → the ref's own `insert('\n')`, since the library's default
 * treats Enter as submit, not newline. Ctrl+S (`key.ctrl && input === 's'`)
 * saves via `onSave`.
 *
 * The `discard changes?` confirm (T315.4) is modelled on blog-send-ask.ts's
 * documented fix for Ink's useInput passive-effect registration gap: rather
 * than mounting a fresh child "Confirm" component when Escape fires (which
 * would have its own useInput registered one render late, dropping a fast
 * following y/n), the confirm is just more state read by THIS component's
 * own single `useInput`, which is already registered from the moment
 * InlineEditor mounts (MainPanes mounts it once when `i` opens the editor;
 * it stays mounted for every later Escape, so there's no remount at the
 * point the prompt opens). The TextArea also stays mounted under the prompt
 * (only its `focus` drops), so answering `n` keeps its undo history.
 * The prompt line sits above the text so a long note cannot push it out of
 * the pane.
 */
export function InlineEditor({ width, height, base, onClose, onSave }: InlineEditorProps): React.JSX.Element {
  // T315.5: match Preview.tsx's own width scale-down (previewColWidth) so
  // the narrow-terminal "reading" layout (which pre-inflates the width prop
  // for Preview's 0.6 factor, src/core/layout.ts) wraps the editor's text
  // at the real terminal width instead of the inflated one. viewportLines
  // caps react-ink-textarea's rendered rows so a 10,000-line note renders
  // in one frame instead of laying out every row (the discard prompt takes
  // one row above the text, so the budget shrinks by 1 while it's shown).
  const colWidth = previewColWidth(width);
  const discardPrompt = colWidth >= DISCARD_PROMPT_LONG.length ? DISCARD_PROMPT_LONG : DISCARD_PROMPT_SHORT;
  const footerRows = Math.max(1, Math.ceil(FOOTER_HINT.length / Math.max(1, colWidth)));
  const [value, setValue] = useState(base);
  const [cursorPosition, setCursorPosition] = useState<[number, number]>(() => endPosition(base));
  const [confirmDiscard, setConfirmDiscard] = useState(false);
  const ref = useRef<TextAreaHandle>(null);

  useInput((input, key) => {
    if (confirmDiscard) {
      if (input === 'y' || input === 'Y') {
        setConfirmDiscard(false);
        onClose();
      } else if (input === 'n' || input === 'N' || key.escape) {
        // T315.6 (director addition A): a second Escape also keeps editing.
        setConfirmDiscard(false);
      }
      return;
    }
    if (key.ctrl && input === 's') {
      onSave(value);
      return;
    }
    if (key.escape) {
      if (value !== base) setConfirmDiscard(true);
      else onClose();
    }
  });

  return (
    <Box flexDirection="column" width={colWidth} height={height}>
      {confirmDiscard ? <Text>{discardPrompt}</Text> : null}
      <TextArea
        ref={ref}
        focus={!confirmDiscard}
        viewportLines={Math.max(1, height - (confirmDiscard ? 1 : 0) - footerRows)}
        onSubmit={() => ref.current?.insert('\n')}
        value={value}
        cursorPosition={cursorPosition}
        onChange={setValue}
        onCursorChange={(position) => setCursorPosition(position)}
      />
      <Text>{FOOTER_HINT}</Text>
    </Box>
  );
}

export default InlineEditor;
