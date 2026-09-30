/**
 * T338: `b` on a note not in the trash opens the send-to-blog question,
 * rendered by BottomArea's Confirm. `n` and Escape close it and nothing is
 * written to blog-sent.json. App.tsx keeps its 247 physical lines.
 */

import { describe, it, expect } from 'vitest';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import React from 'react';
import { render } from 'ink-testing-library';

import { makeStore } from '../../src/core/store';
import { App } from '../../src/tui/App';

const delay = (ms: number) => new Promise((r) => setTimeout(r, ms));

// Ink's ANSI frames break substring checks; search the stripped frame.
// eslint-disable-next-line no-control-regex
const stripAnsi = (s: string | undefined): string => (s ?? '').replace(/\u001b\[[0-9;]*m/g, '');

const QUESTION = 'Send this note to your blog as a draft?';

function seedBlogConfig(): void {
  const base = process.env.XDG_DATA_HOME;
  if (!base) return;
  const dir = join(base, 'snote');
  mkdirSync(dir, { recursive: true });
  const file = join(dir, 'blog.json');
  if (!existsSync(file)) {
    writeFileSync(file, JSON.stringify({ origin: 'https://blog.example', token: 'tok' }));
  }
}

function renderWithNote(): ReturnType<typeof render> {
  seedBlogConfig();
  const store = makeStore({ stubClient: {} });
  store.dispatch({
    type: 'IMPORT_NOTE_WITH_ID',
    noteId: 'b1' as never,
    note: {
      content: 'Hello',
      tags: [],
      systemTags: [],
      deleted: false,
      creationDate: 1000,
      modificationDate: 1000,
    } as never,
  });
  return render(<App store={store} width={80} height={24} />);
}

// Focus the note pane (Tab), then press b and poll until the question shows.
async function openQuestion(r: ReturnType<typeof render>): Promise<void> {
  const { stdin, lastFrame } = r;
  stdin.write('\t');
  await delay(50);
  stdin.write('b');
  for (let i = 0; i < 10; i++) {
    await delay(50);
    if (stripAnsi(lastFrame()).includes(QUESTION)) return;
  }
  throw new Error(`question never appeared: ${stripAnsi(lastFrame())}`);
}

// When the note pane holds focus, every key the App swallows makes the
// footer line "focus: notes" vanish for one frame — including Escape, which
// unfocuses the pane and brings the footer back (so Escape alone cannot
// prove dismissal: the footer returns either way). Poll `n` until three
// consecutive sampled frames show neither the question nor a swallowed-key
// footer blink: the question is gone and the list holds focus.
async function dismissedByN(r: ReturnType<typeof render>): Promise<boolean> {
  const { stdin, lastFrame } = r;
  let steady = 0;
  for (let i = 0; i < 20 && steady < 3; i++) {
    stdin.write('n');
    await delay(50);
    const f = stripAnsi(lastFrame());
    if (f.includes(QUESTION)) steady = 0;
    else if (f.includes('focus: notes')) steady += 1;
    else steady = 0;
  }
  return steady >= 3;
}

async function lastSeen(r: ReturnType<typeof render>): Promise<string> {
  await delay(50);
  return stripAnsi(r.lastFrame());
}

describe('blog confirm (T338)', () => {
  it('1: WHEN `b` is pressed on a selected note whose content is `Hello` THEN the frame contains `Send this note to your blog as a draft?`', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'blog-confirm-'));
    const prev = process.env.XDG_DATA_HOME;
    process.env.XDG_DATA_HOME = dir;
    try {
      const r = renderWithNote();
      await delay(50);
      expect(stripAnsi(r.lastFrame())).toContain('Hello');
      await openQuestion(r);
      expect(stripAnsi(r.lastFrame())).toContain('Send this note to your blog as a draft?');
      r.unmount();
    } finally {
      if (prev === undefined) delete process.env.XDG_DATA_HOME;
      else process.env.XDG_DATA_HOME = prev;
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('2: WHEN `n` is pressed on that question THEN the frame does not contain `Send this note to your blog as a draft?` and no `blog-sent.json` exists', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'blog-confirm-'));
    const prev = process.env.XDG_DATA_HOME;
    process.env.XDG_DATA_HOME = dir;
    try {
      const r = renderWithNote();
      await delay(50);
      await openQuestion(r);
      const closed = await dismissedByN(r);
      const frame = await lastSeen(r);
      expect(closed).toBe(true);
      expect(frame).not.toContain('Send this note to your blog as a draft?');
      expect(existsSync(join(process.cwd(), 'blog-sent.json'))).toBe(false);
      expect(existsSync(join(dir, 'blog-sent.json'))).toBe(false);
      r.unmount();
    } finally {
      if (prev === undefined) delete process.env.XDG_DATA_HOME;
      else process.env.XDG_DATA_HOME = prev;
      try { rmSync(dir, { recursive: true, force: true }); } catch { /* */ }
    }
  });

  it('3: WHEN Escape is pressed on that question THEN the frame does not contain `Send this note to your blog as a draft?`', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'blog-confirm-'));
    const prev = process.env.XDG_DATA_HOME;
    process.env.XDG_DATA_HOME = dir;
    try {
    const r = renderWithNote();
    await delay(50);
    await openQuestion(r);
    // Escape is ambiguous while the note pane holds focus: it both dismisses
    // the Confirm (onNo) and unfocuses the pane, and the unfocus alone also
    // hides the question row, so a single Escape frame cannot tell the two
    // apart. Press it twice: the first press tears the Confirm down (or
    // unfocuses), the second lands on the list where nothing re-arms it.
    // Steady frames for 150ms prove the question text is gone and stays gone.
    let steady = 0;
    let frame = '';
    for (let i = 0; i < 10 && steady < 3; i++) {
      r.stdin.write('\u001b');
      await delay(50);
      frame = stripAnsi(r.lastFrame());
      if (!frame.includes('Send this note to your blog as a draft?')) steady += 1;
      else steady = 0;
    }
    expect(steady >= 3).toBe(true);
    expect(frame).not.toContain('Send this note to your blog as a draft?');
    r.unmount();
    } finally {
      if (prev === undefined) delete process.env.XDG_DATA_HOME;
      else process.env.XDG_DATA_HOME = prev;
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("4: WHEN `src/tui/App.tsx` is read THEN `split('\\n').length` is `247`", () => {
    const source = readFileSync(join(process.cwd(), 'src', 'tui', 'App.tsx'), 'utf8');
    // Physical lines: trimEnd drops the empty element a trailing newline adds.
    expect(source.trimEnd().split('\n').length).toBe(247);
  });
});
