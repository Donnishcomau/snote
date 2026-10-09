import { Box, Text, useInput } from 'ink';
import type { Key } from 'ink';
import React, { useRef, useState } from 'react';
import { TextArea } from 'react-ink-textarea';
import type { TextAreaHandle } from 'react-ink-textarea';

import type { Note } from '@vendor/types';
import { caretMove } from './caretMoves';
import { Divider } from './Divider';
import { previewColWidth } from './Preview';
import { remapEdit, standInText } from './standin';

interface InlineEditorProps {
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

/** The [line, col] position of offset `at` in `text`. */
function positionAt(text: string, at: number): [number, number] {
  return endPosition(text.slice(0, at));
}

/** The offset of [line, col] in `text`, clamped to the text. */
function offsetAt(text: string, [line, col]: [number, number]): number {
  const lines = text.split('\n');
  const l = Math.max(0, Math.min(line, lines.length - 1));
  let at = 0;
  for (let i = 0; i < l; i++) at += lines[i].length + 1;
  return at + Math.max(0, Math.min(col, lines[l].length));
}

/**
 * F161: one TextArea edit, described relative to the caret it was made at:
 * `before`/`after` units removed on each side of the caret, `text` put in
 * their place (the caret ends after `text`). The TextArea builds every edit
 * from the value and caret of its last render, so a key that arrives before
 * the redraw of the previous key carries a stale whole-text `next`; this
 * recovers what that key did so it can be replayed on the latest text.
 */
function caretEdit(
  prev: string,
  caret: number,
  next: string,
): { before: number; after: number; text: string; caret: number } | null {
  const grow = next.length - prev.length;
  if (grow > 0 && next.startsWith(prev.slice(0, caret)) && next.endsWith(prev.slice(caret))) {
    // typed or pasted at the caret
    return { before: 0, after: 0, text: next.slice(caret, caret + grow), caret: caret + grow };
  }
  const cut = -grow;
  if (cut > 0 && caret >= cut && next === prev.slice(0, caret - cut) + prev.slice(caret)) {
    // Backspace, Ctrl+W, Ctrl+U: removed before the caret
    return { before: cut, after: 0, text: '', caret: caret - cut };
  }
  if (cut > 0 && next === prev.slice(0, caret) + prev.slice(caret + cut)) {
    // Delete, Ctrl+K: removed after the caret
    return { before: 0, after: cut, text: '', caret };
  }
  return null;
}

/**
 * S6-01: a `useInput` listener with no output. Ink calls listeners in the
 * order they were added, and siblings add theirs in tree order (again in
 * tree order when `active` flips, since the TextArea's `focus` flips in the
 * same render). One placed before the TextArea sees each key first; one
 * placed after it sees the key last.
 */
function KeyHook({ active, onKey }: { active: boolean; onKey: (input: string, key: Key) => void }): null {
  useInput(onKey, { isActive: active });
  return null;
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
  // T461: the same rows as the Preview it replaces (height - 2) and its divider
  const rows = Math.max(1, height - 2);
  const discardPrompt = colWidth >= DISCARD_PROMPT_LONG.length ? DISCARD_PROMPT_LONG : DISCARD_PROMPT_SHORT;
  const footerRows = Math.max(1, Math.ceil(FOOTER_HINT.length / Math.max(1, colWidth)));
  const [cursorPosition, setCursorPosition] = useState<[number, number]>(() => endPosition(base));
  const [confirmDiscard, setConfirmDiscard] = useState(false);
  const ref = useRef<TextAreaHandle>(null);

  // T412: the TextArea only ever sees stand-in text (control/bidi/zero-width
  // characters drawn as visible pictures, one unit for one, so [line, col]
  // offsets match). `real` stays the note's bytes; `value` is what gets
  // drawn; `shownRef` is the exact string the TextArea was last given, so
  // an edit's changed middle can be remapped back onto the real text.
  const realRef = useRef(base);
  const shownRef = useRef(standInText(base));
  const [value, setValueState] = useState(shownRef.current);
  // F161: the caret offset into shownRef.current after the latest key; the
  // last position the TextArea reported (it drops a report equal to the
  // previous one); and how to read its next report: 'skip' when it is the
  // caret of an edit already placed here, 'absolute' when it is the caret
  // of an edit whose result was taken as is.
  const caretRef = useRef(shownRef.current.length);
  const reportedRef = useRef<string | null>(null);
  const reportModeRef = useRef<'skip' | 'absolute' | null>(null);
  // S6-01: set while the TextArea handles a caret-move key that was already
  // applied here ('fresh': its caret report is exact and is taken; 'stale':
  // it was worked out on an old render and is ignored); and the TextArea's
  // wrap width, so Up/Down move by the same rows it draws
  const moveRef = useRef<'fresh' | 'stale' | null>(null);
  const widthRef = useRef(0);
  // what the TextArea last rendered: every callback below is built from it
  const renderedCaret = offsetAt(value, cursorPosition);
  const stale = (): boolean => shownRef.current !== value || caretRef.current !== renderedCaret;

  const show = (nextReal: string, caret: number): void => {
    realRef.current = nextReal;
    shownRef.current = standInText(nextReal);
    caretRef.current = Math.max(0, Math.min(caret, shownRef.current.length));
    setValueState(shownRef.current);
    setCursorPosition(positionAt(shownRef.current, caretRef.current));
  };

  const setValue = (next: string): void => {
    // the TextArea's own newline normalisation can only have run on
    // stand-in text (the pictures for CR/C1 survive as single units), so the
    // shown text is exactly the real text's stand-in when nothing changed
    if (next === value) return;
    // S6-01: Down on the last row adds a line; that key was applied here
    if (moveRef.current) return;
    const edit = caretEdit(value, renderedCaret, next);
    if (!edit) {
      // not a caret edit (undo/redo): take the TextArea's text and caret
      const fresh = !stale();
      realRef.current = remapEdit(realRef.current, shownRef.current, next, next.length);
      shownRef.current = standInText(realRef.current);
      setValueState(shownRef.current);
      reportModeRef.current = fresh ? 'absolute' : 'skip';
      return;
    }
    // F161: the TextArea built `next` on the value of its last render; when
    // an earlier key of the same burst already changed the text, replacing
    // the text with `next` would drop that key. Replay this key's edit at
    // the latest caret instead (identical to `next` when nothing is stale).
    const fresh = !stale();
    const shown = shownRef.current;
    const at = caretRef.current;
    const from = Math.max(0, at - edit.before);
    const after = shown.slice(0, from) + edit.text + shown.slice(Math.min(shown.length, at + edit.after));
    show(remapEdit(realRef.current, shown, after, from + edit.text.length), from + edit.text.length);
    // the TextArea now reports its own caret for this edit, unless it
    // equals its last report, which it drops. On a fresh render that report
    // is exact (it tells Delete from Backspace between equal characters);
    // on a stale one it is the old caret moved, so it is ignored.
    if (fresh) reportModeRef.current = 'absolute';
    else reportModeRef.current = String(positionAt(next, edit.caret)) !== reportedRef.current ? 'skip' : null;
  };

  const setCursor = (position: [number, number]): void => {
    reportedRef.current = String(position);
    const mode = reportModeRef.current;
    reportModeRef.current = null;
    if (moveRef.current === 'stale') return;
    if (moveRef.current === 'fresh') {
      caretRef.current = offsetAt(shownRef.current, position);
      setCursorPosition(position);
      return;
    }
    if (mode === 'skip') return;
    if (mode === 'absolute' || !stale()) {
      caretRef.current = offsetAt(shownRef.current, position);
      setCursorPosition(position);
      return;
    }
    // F161: a caret move made on an old render: apply it as a move
    const moved = caretRef.current + offsetAt(value, position) - renderedCaret;
    caretRef.current = Math.max(0, Math.min(moved, shownRef.current.length));
    setCursorPosition(positionAt(shownRef.current, caretRef.current));
  };

  // S6-01: runs before the TextArea for every key. A caret move is applied
  // here from the latest caret, so each key of a burst moves once, in
  // order; the TextArea would move every key of a burst from the caret of
  // its last render and drops a report equal to its previous one.
  const beforeTextArea = (input: string, key: Key): void => {
    moveRef.current = null;
    const fresh = !stale();
    const move = caretMove(shownRef.current, caretRef.current, input, key, widthRef.current);
    if (!move) return;
    moveRef.current = fresh ? 'fresh' : 'stale';
    if (move.value !== shownRef.current) {
      // Down on the last row: the stand-in text maps one unit for one
      show(realRef.current + move.value.slice(shownRef.current.length), move.caret);
      return;
    }
    if (move.caret === caretRef.current) return;
    caretRef.current = move.caret;
    setCursorPosition(positionAt(shownRef.current, move.caret));
  };
  const afterTextArea = (): void => {
    moveRef.current = null;
  };

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
      onSave(realRef.current);
      return;
    }
    if (key.escape) {
      if (realRef.current !== base) setConfirmDiscard(true);
      else onClose();
    }
  });

  return (
    <Box flexDirection="row">
      <Divider height={rows} />
      <Box flexDirection="column" width={colWidth} height={rows}>
      {confirmDiscard ? <Text>{discardPrompt}</Text> : null}
      <KeyHook active={!confirmDiscard} onKey={beforeTextArea} />
      <TextArea
        ref={ref}
        focus={!confirmDiscard}
        viewportLines={Math.max(1, rows - (confirmDiscard ? 1 : 0) - footerRows)}
        onSubmit={() => ref.current?.insert('\n')}
        value={value}
        cursorPosition={cursorPosition}
        onChange={setValue}
        onCursorChange={setCursor}
        onDimensions={(w: number) => {
          widthRef.current = w;
        }}
      />
      <KeyHook active={!confirmDiscard} onKey={afterTextArea} />
      <Text>{FOOTER_HINT}</Text>
      </Box>
    </Box>
  );
}

export default InlineEditor;
