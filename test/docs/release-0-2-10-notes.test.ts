import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';

// Collapse the CHANGELOG's line wrapping so a sentence can be matched across lines.
const flat = (path: string): string => readFileSync(path, 'utf8').replace(/\s+/g, ' ');
const files = ['docs/release-notes-0.2.10.md', 'CHANGELOG.md'];

describe('0.2.10 public wording', () => {
  it('1: WHEN the 0.2.10 notes and CHANGELOG are read THEN both hold the new failure and source sentences', () => {
    for (const f of files) {
      const text = flat(f);
      expect(text).toContain('and when the write fails it removes the file it created.');
      expect(text).toContain('It was found by the Omarchy marketplace review.');
    }
  });

  it('2: WHEN the 0.2.10 notes and CHANGELOG are read THEN neither holds the old cleanup claim or the severity rating', () => {
    for (const f of files) {
      const text = flat(f);
      expect(text).not.toContain('so no partly written file is left');
      expect(text).not.toContain('rated low');
    }
  });
});
