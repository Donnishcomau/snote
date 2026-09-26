import { describe, it, expect, afterEach, vi } from 'vitest';
import { render } from 'ink-testing-library';
import React from 'react';
import { createRequire } from 'module';
import { pathToFileURL } from 'url';
import path from 'path';

import { NoteList } from '../../src/tui/NoteList';
import { TagPane } from '../../src/tui/TagPane';
import { Preview } from '../../src/tui/Preview';
import { makeNote } from './fixtures';

const delay = (ms: number) => new Promise((r) => setTimeout(r, ms));

const inkPkgDir = path.dirname(
  path.dirname(createRequire(import.meta.url).resolve('ink')),
);
const inkChalk = (
  await import(
    pathToFileURL(path.join(inkPkgDir, 'node_modules/chalk/source/index.js')).href
  )
).default;

describe('T256 Pane headers recede (bold + muted, not full brightness)', () => {
  let savedLevel: number;

  beforeEach(() => {
    savedLevel = inkChalk.level;
    inkChalk.level = 3;
  });

  afterEach(() => {
    inkChalk.level = savedLevel;
  });

  it('1: WHEN <NoteList notes={[]} selectedIndex={0} width={40} height={10} /> is rendered with chalk forced to level 3 THEN the frame contains Notes and does not contain \\u001b[1mNotes and does not contain \\u001b[90mNotes', async () => {
    const { lastFrame } = render(
      <NoteList notes={[]} selectedIndex={0} width={40} height={10} />,
    );
    await delay(0);
    const frame = lastFrame() ?? '';
    expect(frame).toContain('Notes');
    expect(frame).not.toContain('\u001b[1mNotes');
    expect(frame).not.toContain('\u001b[90mNotes');
  });

  it('2: WHEN <TagPane tags={["home"]} selectedIndex={0} focused={false} width={20} height={5} /> is rendered with chalk forced THEN the frame contains Tags and does not contain \\u001b[1mTags and does not contain \\u001b[90mTags', async () => {
    const { lastFrame } = render(
      <TagPane tags={['home']} selectedIndex={0} focused={false} width={20} height={5} />,
    );
    await delay(0);
    const frame = lastFrame() ?? '';
    expect(frame).toContain('Tags');
    expect(frame).not.toContain('\u001b[1mTags');
    expect(frame).not.toContain('\u001b[90mTags');
  });

  it('3: WHEN <Preview note={null} width={80} height={24} /> is rendered with chalk forced THEN the frame contains \\u001b[39mPreview and does not contain \\u001b[1mPreview and does not contain \\u001b[90mPreview', async () => {
    const { lastFrame } = render(
      <Preview note={null} width={80} height={24} />,
    );
    await delay(0);
    const frame = lastFrame() ?? '';
    // The header is now default foreground and not bold. The sibling
    // <Divider> emits \u001b[90m first, so Ink emits a bare \u001b[39m
    // reset right before "Preview" and no re-emission of style.
    expect(frame).toContain('\u001b[39mPreview');
    expect(frame).not.toContain('\u001b[1mPreview');
    expect(frame).not.toContain('\u001b[90mPreview');
  });

  it('4: WHEN <Preview note={makeNote("g", "Groceries\\n\\nbody", {})} width={80} height={24} focused={false} /> is rendered with chalk forced THEN the frame contains \\u001b[39mPreview: \\u001b[1mGroceries\\u001b[22m', async () => {
    const { lastFrame } = render(
      <Preview note={makeNote('g', 'Groceries\n\nbody', {})} width={80} height={24} focused={false} />,
    );
    await delay(0);
    const frame = lastFrame() ?? '';
    // "Preview: " is unstyled (bare \u001b[39m reset after the Divider's
    // gray │), while {title} keeps its own bold.
    expect(frame).toContain('\u001b[39mPreview: \u001b[1mGroceries\u001b[22m');
  });

  it('5: WHEN the same note is rendered with focused={true} and chalk forced THEN the frame does not contain \\u001b[90m anywhere', async () => {
    const { lastFrame } = render(
      <Preview note={makeNote('g', 'Groceries\n\nbody', {})} width={80} height={24} focused={true} />,
    );
    await delay(0);
    const frame = lastFrame() ?? '';
    // In focused (inverse) mode the Preview header uses inverse + bold,
    // NOT gray.  The only \u001b[90m in the frame comes from the Divider's │
    // which is shared with every Preview render; we assert that the
    // *Preview header text* does not carry \u001b[90m — it uses \u001b[7m
    // (inverse) instead.
    const headerLine = frame.split('\n').find(l => l.includes('Preview: Groceries'));
    expect(headerLine).toBeDefined();
    // Find the substring between │ and the end: │\u001b[39m\u001b[7m\u001b[1mPreview...
    const pipeIdx = headerLine!.indexOf('│');
    const headerText = headerLine!.substring(pipeIdx);
    // The text after │ starts with \u001b[39m (reset from divider),
    // then \u001b[7m (inverse), \u001b[1m (bold), "Preview: Groceries"...
    // There must be NO \u001b[90m in that portion (no gray).
    expect(headerText).toContain('\u001b[7m');  // inverse is active
    expect(headerText).toContain('\u001b[1m');  // bold is active
    expect(headerText).not.toContain('\u001b[90m');  // no gray on header text
  });
});
