/**
 * Published links use https (T310).
 * One `it()` per numbered Acceptance line in TASKS.md T310.
 */

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { publishLink } from '../../src/core/note-keys';
import type { Note, SystemTag } from '@vendor/types';

const publishedNote: Note = {
  content: 'x',
  creationDate: 0,
  deleted: false,
  modificationDate: 0,
  systemTags: ['published' as SystemTag],
  tags: [],
  publishURL: 'abc123',
};

const unpublishedNote: Note = {
  content: 'y',
  creationDate: 0,
  deleted: false,
  modificationDate: 0,
  systemTags: [],
  tags: [],
  publishURL: 'abc123',
};

describe('T310: Published links use https://simp.ly/...', () => {
  it('1: WHEN publishLink is called with a published note whose publishURL is abc123 THEN it returns https://simp.ly/p/abc123', () => {
    expect(publishLink(publishedNote)).toBe('https://simp.ly/p/abc123');
  });

  it('2: WHEN publishLink is called with a note that is not published THEN it returns null', () => {
    expect(publishLink(unpublishedNote)).toBeNull();
  });

  it('3: WHEN src/core/note-keys.ts is read as text THEN it does not contain http://simp.ly', () => {
    const src = readFileSync('src/core/note-keys.ts', 'utf8');
    expect(src).not.toContain('http://simp.ly');
  });

  it("4: WHEN README.md is read as text THEN it does not contain http://simp.ly and does not contain use `http://`", () => {
    const readme = readFileSync('README.md', 'utf8');
    expect(readme).not.toContain('http://simp.ly');
    expect(readme).not.toContain('use `http://`');
  });
});
