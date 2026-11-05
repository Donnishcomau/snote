import { Box, Text, useInput, type Key } from 'ink';
import React from 'react';
import { caretMove } from './caretMoves';
import { sanitizeForTerminal } from '../core/sanitize';
import { splitPastedInput } from './split-input';
import { useReadGate } from './read-gate';
import { theme } from './theme';

interface PromptProps {
  label: string;
  initial: string;
  onSubmit: (value: string) => void;
  onCancel: () => void;
  // #637: an unchanged Enter calls this when given (the export prompt keeps its suggested path), else onCancel
  onKeep?: () => void;
}

/**
 * Prompt - one-line text editing component.
 * Renders: `<label>: <text>` where text starts as `initial`, with the
 * character under the cursor shown without the inverse (#637).
 * Keys: Escape → onCancel, Return → submit trimmed if non-empty and different,
 * Left/Right, Home/End and Ctrl+A/Ctrl+E move the cursor, Backspace removes
 * before it, Delete at it, Ctrl+U clears the line, printable → insert at it.
 * proof: test/tui/prompt-edit.test.tsx
 */
export function Prompt({ label, initial, onSubmit, onCancel, onKeep }: PromptProps): React.JSX.Element {
  const [text, setText] = React.useState(initial);
  const [caret, setCaret] = React.useState(initial.length);

  // Latest text and cursor for the batched-paste loop below, which replays
  // several characters per event and must see each character's effect.
  const textRef = React.useRef(text);
  const caretRef = React.useRef(initial.length);
  const write = (next: string, at: number) => {
    textRef.current = next;
    caretRef.current = at;
    setText(next);
    setCaret(at);
  };
  // #637: grapheme steps come from the inline editor's caret moves (one line: width 0)
  const step = (at: number, dir: 'leftArrow' | 'rightArrow'): number =>
    caretMove(textRef.current, at, '', { [dir]: true } as unknown as Key, 0)?.caret ?? at;

  const handle = (input: string, key: Parameters<Parameters<typeof useInput>[0]>[1]): boolean => {
    // Escape cancels
    if (key.escape) {
      onCancel();
      return true;
    }

    // Return submits trimmed text if non-empty and different from initial
    if (key.return) {
      const trimmed = textRef.current.trim();
      if (trimmed === '' || trimmed === initial) {
        (trimmed !== '' && onKeep ? onKeep : onCancel)();
      } else {
        onSubmit(trimmed);
      }
      return true;
    }

    const t = textRef.current;
    const at = caretRef.current;
    // #637: Backspace removes the character before the cursor
    if (key.backspace) {
      const p = step(at, 'leftArrow');
      write(t.slice(0, p) + t.slice(at), p);
      return true;
    }
    if (key.ctrl && input === 'u') {
      write('', 0);
      return true;
    }
    if (key.home || key.end) {
      write(t, key.home ? 0 : t.length);
      return true;
    }
    if (key.upArrow || key.downArrow) return true;
    // Left/Right, Ctrl+A/Ctrl+E and Delete (at the cursor): the inline editor's moves
    const move = caretMove(t, at, input, key, 0);
    if (move) {
      write(move.value, move.caret);
      return true;
    }

    // Ignore other ctrl/meta keys
    if (key.ctrl || key.meta) {
      return true;
    }

    // Insert printable input at the cursor (may be multi-character like 'job')
    if (input !== '') {
      write(t.slice(0, at) + input + t.slice(at), at + input.length);
    }
    return false;
  };

  useInput((input, key) => {
    // A bunched paste chunk (multi-char, no escape sequence) arrives as ONE
    // Ink event with every key.* flag false (same split as TagEditor and
    // App.tsx). Replay per character so an embedded '\r' still submits:
    // Ink never sets key.return for a '\r' bunched with other characters,
    // so synthesize it and pass '' as the input for that character.
    const chars = splitPastedInput(input);
    if (chars) {
      for (const ch of chars) {
        const stop =
          ch === '\r'
            ? handle('', { ...key, return: true, escape: false })
            : handle(ch, { ...key, return: false, escape: false });
        if (stop) return;
      }
      return;
    }
    handle(input, key);
  });

  const next = caretMove(text, caret, '', { rightArrow: true } as unknown as Key, 0)?.caret ?? caret;
  return (
    <Box>
      <Text bold inverse>{label}: </Text>
      <Text bold inverse>{sanitizeForTerminal(text.slice(0, caret))}</Text>
      <Text bold>{sanitizeForTerminal(text.slice(caret, next)) || ' '}</Text>
      <Text bold inverse>{sanitizeForTerminal(text.slice(next))}</Text>
    </Box>
  );
}

interface ConfirmProps {
  question: string;
  onYes: () => void;
  onNo: () => void;
  destructive?: boolean;
}

/**
 * Confirm - yes/no confirmation component.
 * Renders: `<question> y/n`.
 * Keys: y/Y → onYes, n/N/Escape → onNo, everything else ignored.
 */
export function Confirm({ question, onYes, onNo, destructive }: ConfirmProps): React.JSX.Element {
  useReadGate({ confirm: true }); // only a one-key read answers
  useInput((input, key) => {
    // Escape calls onNo
    if (key.escape) {
      onNo();
      return;
    }

    // y/Y calls onYes
    if (input === 'y' || input === 'Y') {
      onYes();
      return;
    }

    // n/N calls onNo
    if (input === 'n' || input === 'N') {
      onNo();
      return;
    }
  });

  return (
    <Box>
      {destructive ? (
        <Text bold {...theme.error}>{question} y/n</Text>
      ) : (
        <Text>{question} y/n</Text>
      )}
    </Box>
  );
}

export default Prompt;
