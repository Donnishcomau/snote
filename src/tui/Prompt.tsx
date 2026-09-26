import { Box, Text, useInput } from 'ink';
import React from 'react';
import { splitPastedInput } from './split-input';

interface PromptProps {
  label: string;
  initial: string;
  onSubmit: (value: string) => void;
  onCancel: () => void;
}

/**
 * Prompt - one-line text editing component.
 * Renders: `<label>: <text>` where text starts as `initial`.
 * Keys: Escape → onCancel, Return → submit trimmed if non-empty and different,
 * Backspace/Delete → remove last char, printable → append.
 */
export function Prompt({ label, initial, onSubmit, onCancel }: PromptProps): React.JSX.Element {
  const [text, setText] = React.useState(initial);

  // Latest text for the batched-paste loop below, which replays several
  // characters per event and must see each character's effect on the text.
  const textRef = React.useRef(text);
  const write = (next: string) => {
    textRef.current = next;
    setText(next);
  };

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
        onCancel();
      } else {
        onSubmit(trimmed);
      }
      return true;
    }

    // Backspace / delete removes last character
    if (key.backspace || key.delete) {
      if (textRef.current.length > 0) {
        write(textRef.current.slice(0, -1));
      }
      return true;
    }

    // Ignore ctrl/meta keys, and empty input
    if (key.ctrl || key.meta) {
      return true;
    }

    // Append printable input (may be multi-character like 'job')
    if (input !== '') {
      write(textRef.current + input);
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
          ch === '\r' ? handle('', { ...key, return: true }) : handle(ch, key);
        if (stop) return;
      }
      return;
    }
    handle(input, key);
  });

  return (
    <Box>
      <Text bold inverse>{label}: </Text>
      <Text bold inverse>{text}</Text>
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
        <Text bold color="red">{question} y/n</Text>
      ) : (
        <Text>{question} y/n</Text>
      )}
    </Box>
  );
}

export default Prompt;
