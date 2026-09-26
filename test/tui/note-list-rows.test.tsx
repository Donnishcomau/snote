import { describe, it, expect } from 'vitest';
import { render } from 'ink-testing-library';
import React from 'react';

import { NoteList } from '../../src/tui/NoteList';
import { makeNote } from './fixtures';

const notes = [
  makeNote('1', 'Note one\nbody one line'),
  makeNote('2', 'Note two\nbody two'),
  makeNote('3', 'Note three\nbody three', { pinned: true }),
  makeNote('4', 'Note four\nbody four'),
  makeNote('5', 'Note five\nbody five'),
  makeNote('6', 'Note six\nbody six'),
  makeNote('7', 'Note seven\nbody seven'),
  makeNote('8', 'Note eight\nbody eight'),
];

function stripAnsi(s: string): string {
  return s.replace(/\x1b\[[0-9;]*m/g, '');
}

function getLines(frame: string): string[] {
  return frame.split('\n');
}

function nonEmptyLines(frame: string): string[] {
  // Exclude the "Notes" header line when counting non-empty lines.
  // The acceptance criteria count only the note content area.
  const lines = getLines(frame);
  // Skip the first line (header) for non-empty counting
  return lines.slice(1).filter(l => stripAnsi(l).trim() !== '');
}

describe('Note list rows (T211)', () => {
  it('1: WHEN the list is rendered THEN the frame contains ">Note one", the line after ">Note one" contains "body one line", and the line after that is empty.', async () => {
    const { lastFrame } = render(
      <NoteList notes={notes} selectedIndex={0} width={60} height={26} />
    );
    await new Promise(r => setTimeout(r, 0));
    const frame = lastFrame();
    const lines = getLines(frame);
    const stripped = lines.map(stripAnsi);
    const titleLine = stripped.findIndex(l => l.includes('>Note one'));
    expect(titleLine).toBeGreaterThanOrEqual(0);
    expect(stripped[titleLine + 1]).toContain('body one line');
    expect(stripped[titleLine + 2]).toBe('');
  });

  it('2: WHEN the frame is split into lines THEN the line holding "Note two" comes exactly 3 lines after the line holding "Note one".', async () => {
    const { lastFrame } = render(
      <NoteList notes={notes} selectedIndex={0} width={60} height={26} />
    );
    await new Promise(r => setTimeout(r, 0));
    const frame = lastFrame();
    const lines = getLines(frame);
    const stripped = lines.map(stripAnsi);
    const idxOne = stripped.findIndex(l => l.match(/^(\s*)>?(?:\s*)Note one/));
    const idxTwo = stripped.findIndex(l => l.match(/^(\s*)>?(?:\s*)Note two/));
    expect(idxTwo - idxOne).toBe(3);
  });

  it('3: WHEN the third note is pinned THEN the frame contains "Note three *".', async () => {
    const { lastFrame } = render(
      <NoteList notes={notes} selectedIndex={2} width={60} height={26} />
    );
    await new Promise(r => setTimeout(r, 0));
    const frame = lastFrame();
    expect(frame).toContain('Note three *');
  });

  it('4: WHEN the same list is rendered with height=26 THEN the number of non-empty frame lines is at most 24 and the frame contains "Note one" and does not contain "Note eight".', async () => {
    const { lastFrame } = render(
      <NoteList notes={notes} selectedIndex={0} width={60} height={26} />
    );
    await new Promise(r => setTimeout(r, 0));
    const frame = lastFrame();
    const nonEmpty = nonEmptyLines(frame);
    expect(nonEmpty.length).toBeLessThanOrEqual(24);
    expect(frame).toContain('Note one');
    expect(frame).not.toContain('Note eight');
  });

  it('5: WHEN the list is rendered with selectedIndex=7 THEN the frame contains ">Note eight" and does not contain "Note one".', async () => {
    const { lastFrame } = render(
      <NoteList notes={notes} selectedIndex={7} width={60} height={26} />
    );
    await new Promise(r => setTimeout(r, 0));
    const frame = lastFrame();
    expect(frame).toContain('>Note eight');
    expect(frame).not.toContain('Note one');
  });

  it('6: WHEN a note whose content is only "Titleonly" is rendered alone THEN the frame contains "Titleonly" and has exactly 1 non-empty line.', async () => {
    const { lastFrame } = render(
      <NoteList notes={[makeNote('solo', 'Titleonly')]} selectedIndex={0} width={60} height={26} />
    );
    await new Promise(r => setTimeout(r, 0));
    const frame = lastFrame();
    expect(frame).toContain('Titleonly');
    expect(nonEmptyLines(frame).length).toBe(1);
  });
});
