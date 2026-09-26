import { render } from 'ink-testing-library';
import React from 'react';

import { noteRow } from '../../src/core/note-row';
import { revisionLabel } from '../../src/core/history';
import { sanitizeForTerminal } from '../../src/core/sanitize';
import { tagRows } from '../../src/core/collection';
import Preview from '../../src/tui/Preview';
import type { Note, Tag, TagHash, TagName } from '@vendor/types';
import { makeNote } from '../tui/fixtures';

const OSC8 = '\x1b]8;;http://evil\x07click\x1b]8;;\x07';

describe('sanitizeForTerminal', () => {
  it('1: WHEN sanitizeForTerminal(\'\\x1b]8;;http://evil\\x07click\\x1b]8;;\\x07\') runs THEN it returns exactly `click`', () => {
    expect(sanitizeForTerminal(OSC8)).toBe('click');
  });

  it('2: WHEN sanitizeForTerminal(\'\\x1b[31mred\\x1b[0m\') runs THEN it returns exactly `red`', () => {
    expect(sanitizeForTerminal('\x1b[31mred\x1b[0m')).toBe('red');
  });

  it('3: WHEN sanitizeForTerminal(\'\\x1b]52;c;aGVsbG8=\\x07after\') runs THEN it returns exactly `after`, and sanitizeForTerminal(\'\\x1b[2Jwiped\') returns exactly `wiped`', () => {
    expect(sanitizeForTerminal('\x1b]52;c;aGVsbG8=\x07after')).toBe('after');
    expect(sanitizeForTerminal('\x1b[2Jwiped')).toBe('wiped');
  });

  it("4: WHEN sanitizeForTerminal('x\\x9by') runs (C1 CSI byte) THEN it returns exactly `xy`, and sanitizeForTerminal('a\\rb') returns exactly `ab`, and a lone BEL sanitizeForTerminal('a\\x07b') returns exactly `ab`", () => {
    expect(sanitizeForTerminal('x\u009by')).toBe('xy');
    expect(sanitizeForTerminal('a\rb')).toBe('ab');
    expect(sanitizeForTerminal('a\x07b')).toBe('ab');
  });

  it('5: WHEN sanitizeForTerminal(\'hi 👍 中文\\ttab\\nline\') runs THEN it returns exactly `hi 👍 中文\\ttab\\nline` unchanged', () => {
    expect(sanitizeForTerminal('hi 👍 中文\ttab\nline')).toBe(
      'hi 👍 中文\ttab\nline'
    );
  });

  it('6: WHEN a note whose content is \'\\x1b]8;;http://evil\\x07click\\x1b]8;;\\x07\' is rendered in the Preview pane THEN the frame contains `click` and `lastFrame()` does not contain `\\x1b`', () => {
    const note = makeNote('n1', OSC8);
    const { lastFrame } = render(<Preview note={note} width={80} height={24} />);
    const frame = lastFrame() ?? '';
    expect(frame).toContain('click');
    expect(frame).not.toContain('\x1b');
  });
});

describe('view models sanitize what they hand to <Text>', () => {
  it('noteRow strips OSC 8 from title and preview lines', () => {
    const note = makeNote('n1', OSC8 + '\n' + OSC8 + ' body');
    const row = noteRow(note, 40);
    expect(row.title).toBe('click');
    expect(row.previewLines.length).toBeGreaterThan(0);
    for (const line of row.previewLines) {
      expect(line).not.toContain('\x1b');
      expect(line).toContain('click');
    }
  });

  it('tagRows sanitizes each tag name', () => {
    const tags = new Map<TagHash, Tag>();
    tags.set('h1' as TagHash, { name: 'work\x1b[31m' as unknown as TagName });
    tags.set('h2' as TagHash, { name: 'pe\x9brsonal' as unknown as TagName });
    tags.set('h3' as TagHash, { name: 'plain\rtag' as unknown as TagName });
    expect(tagRows(tags)).toEqual(['personal', 'plaintag', 'work']);
  });

  it('revisionLabel sanitizes the title before joining', () => {
    const rev = {
      version: 3,
      note: makeNote('n1', OSC8 + '\nbody', { modificationDate: 0 }),
    };
    const label = revisionLabel(rev);
    expect(label).toContain('click');
    expect(label).not.toContain('\x1b');
    expect(label.startsWith('v3  1970-01-01 00:00  ')).toBe(true);
  });

  it('Preview sanitizes the title heading', () => {
    const note: Note = makeNote('n1', OSC8 + '\nsecond line');
    const { lastFrame } = render(<Preview note={note} width={80} height={24} />);
    const frame = lastFrame() ?? '';
    expect(frame).toContain('Preview: click');
    expect(frame).not.toContain('\x1b');
  });
});
