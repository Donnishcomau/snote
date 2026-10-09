import { Box, Text, useInput } from 'ink';
import React, { useState } from 'react';
import { sanitizeForTerminal } from '../core/sanitize';
import { tagInputStep, suggestTag } from './tag-input';
import { splitPastedInput } from './split-input';
import { theme } from './theme';

interface TagEditorProps {
  tags: string[];
  allTags: string[];
  onAdd: (tagName: string) => void;
  onRemove: (tagName: string) => void;
  onClose: () => void;
}

export function TagEditor({ tags, allTags, onAdd, onRemove, onClose }: TagEditorProps): React.JSX.Element {
  const [text, setText] = useState('');

  const suggestion = suggestTag(text, allTags, tags);

  useInput((input, key) => {
    // A bunched paste chunk (multi-char, no escape) arrives as ONE Ink event
    // with every key.* flag false; splitPastedInput splits it so a literal
    // '\r' inside the chunk still commits (Ink never sets key.return for a
    // '\r' bunched with others), so synthesize it with '' as the input.
    const pasted = splitPastedInput(input);
    if (pasted) {
      let next = text;
      for (const ch of pasted) {
        const step =
          ch === '\r'
            ? tagInputStep(next, '', { ...key, return: true } as any, tags, allTags)
            : tagInputStep(next, ch, key as any, tags, allTags);
        next = step.text;
        if (step.add) onAdd(step.add);
        if (step.remove) onRemove(step.remove);
        if (step.close) onClose();
      }
      setText(next);
      return;
    }
    const step = tagInputStep(text, input, key as any, tags, allTags);
    setText(step.text);
    if (step.add) onAdd(step.add);
    if (step.remove) onRemove(step.remove);
    if (step.close) onClose();
  });

  // Build the display line. T306 G1: tags are server-supplied, so they are
  // sanitized where they are DRAWN only; all logic (suggestTag, tagInputStep,
  // onAdd, onRemove) keeps the raw values so removal still matches the name.
  const displayTags = tags.map((t) => `[${sanitizeForTerminal(t)}] `);

  let display = 'tags: ';
  display += displayTags.join('');
  display += text === '' ? '+ type to add' : '+ ';

  if (suggestion) {
    // Same rule: sanitize for display, keep raw for the text.length math.
    const restOfSuggestion = sanitizeForTerminal(suggestion.slice(text.length));
    return (
      <Box>
        <Text bold inverse>{display}{sanitizeForTerminal(text)}</Text>
        <Text {...theme.muted}>{restOfSuggestion}</Text>
      </Box>
    );
  }

  return (
    <Box>
      <Text bold inverse>{display}{sanitizeForTerminal(text)}</Text>
    </Box>
  );
}

export { suggestTag };
