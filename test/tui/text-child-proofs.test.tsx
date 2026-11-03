/**
 * Proof tests for 4 allowlist entries of eslint.text-child.mjs. Each test feeds a hostile value to a source
 * the allowlist trusts and asserts both the clean text present and every raw byte absent, so an empty or errored render cannot pass.
 * One `it()` per numbered line (tests 1 to 5).
 */
import { describe, it, expect, afterEach } from 'vitest';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { pathToFileURL } from 'node:url';
import React from 'react';
import { render } from 'ink-testing-library';

import type { Note, SystemTag } from '@vendor/types';
import { makeStore } from '../../src/core/store';
import { recordBlogSend } from '../../src/core/blog-sent';
import { signOutByServer } from '../../src/core/token';
import { App } from '../../src/tui/App';
import { TagEditor } from '../../src/tui/TagEditor';
import { TagPane } from '../../src/tui/TagPane';
import { waitForFrame, waitForInput } from '../helpers/ink-waits';

const noop = () => {};

describe('#419 Text child sources: a hostile value reaches the screen clean', () => {
  const cleanup: Array<() => void> = [];
  afterEach(() => {
    while (cleanup.length) cleanup.pop()!();
  });

  it('1: WHEN `<TagPane>` is rendered with tags [`a\\x1b[31mb`, `c\\u202ed`], selectedIndex 0, width 20, height 10 THEN the frame contains `ab` and `cd` and contains neither `\\x1b` nor `\\u202e`', () => {
    const r = render(
      <TagPane tags={['a\u001b[31mb', 'c‮d']} selectedIndex={0} focused={false} width={20} height={10} />,
    );
    cleanup.push(() => r.unmount());
    const frame = r.lastFrame() ?? '';
    expect(frame).toContain('ab');
    expect(frame).toContain('cd');
    expect(frame).not.toContain('\u001b');
    expect(frame).not.toContain('‮');
  });

  it('2: WHEN `<TagEditor tags={[]} allTags={[`ab\\x1b[31mcd\\u202eef`]} ...>` gets `a` then `b` on stdin THEN the frame contains `tags: + abcdef` and contains neither `\\x1b` nor `\\u202e`', async () => {
    const r = render(
      <TagEditor tags={[]} allTags={['ab\u001b[31mcd‮ef']} onAdd={noop} onRemove={noop} onClose={noop} />,
    );
    cleanup.push(() => r.unmount());
    await waitForInput(r.stdin);
    r.stdin.write('a');
    await waitForFrame(r.lastFrame, 'tags: + a');
    r.stdin.write('b');
    const frame = await waitForFrame(r.lastFrame, 'tags: + abcdef');
    expect(frame).toContain('tags: + abcdef');
    expect(frame).not.toContain('\u001b');
    expect(frame).not.toContain('‮');
  });

  it('3: WHEN `signOutByServer(root, dir)` is called on a temp root whose folder `dir` is named `evil\\x1b[31mred@example.com` and holds a kept `unsynced.json` THEN it returns a string that contains `kept in evilred@example.com.` and contains no `\\x1b`', () => {
    const root = mkdtempSync(join(tmpdir(), 'text-child-proof3-'));
    cleanup.push(() => rmSync(root, { recursive: true, force: true }));
    const dir = join(root, 'evil\u001b[31mred@example.com');
    mkdirSync(dir);
    writeFileSync(join(dir, 'unsynced.json'), '{"n1":{"c":1}}');
    const notice = signOutByServer(root, dir);
    expect(notice).not.toBeNull();
    expect(notice!).toContain('kept in evilred@example.com.');
    expect(notice!).not.toContain('\u001b');
  });

  it('4: WHEN the App shows a note whose blog record has sentAt `\\u202e\\x1b[2J\\u200b2026-10-01T00:00:00.000Z` and url `https://x/\\x1b[46mB\\x1b[0m\\x1b]52;c;QQ\\x07\\nnext` THEN the frame contains `Sent as draft`, `2026-10-01` and `https://x/B next` and contains none of `\\x1b`, `\\u202e`, `\\u200b`, `\\u0007`', async () => {
    const base = mkdtempSync(join(tmpdir(), 'text-child-proof4-'));
    const dir = join(base, 'snote');
    mkdirSync(dir, { recursive: true });
    const prev = process.env.XDG_DATA_HOME;
    process.env.XDG_DATA_HOME = base;
    cleanup.push(() => {
      if (prev === undefined) delete process.env.XDG_DATA_HOME;
      else process.env.XDG_DATA_HOME = prev;
      rmSync(base, { recursive: true, force: true });
    });
    recordBlogSend(dir, 'n1', {
      postId: 'p1',
      url: 'https://x/\u001b[46mB\u001b[0m\u001b]52;c;QQ\u0007\nnext',
      sentAt: '‮\u001b[2J​2026-10-01T00:00:00.000Z',
    });
    const store = makeStore({ stubClient: {} });
    const note: Note = {
      content: 'Blog note',
      systemTags: ['published'] as SystemTag[],
      tags: [],
      deleted: false,
      creationDate: 1000,
      modificationDate: 1000,
    } as never;
    store.dispatch({ type: 'IMPORT_NOTE_WITH_ID', noteId: 'n1' as never, note: note as never });
    const r = render(<App store={store} width={80} height={24} />);
    cleanup.push(() => r.unmount());
    const frame = await waitForFrame(r.lastFrame, 'https://x/B next');
    expect(frame).toContain('Sent as draft');
    expect(frame).toContain('2026-10-01');
    expect(frame).toContain('https://x/B next');
    for (const bad of ['\u001b', '‮', '​', '\u0007']) expect(frame).not.toContain(bad);
  });

  it('5: WHEN the allowlist entry of `src/tui/StatusBar.tsx` for `p.text` in eslint.text-child.mjs is read THEN its source names `v<VERSION>`, `padding` and `ellipsis`', async () => {
    type Entry = { file: string; expr: string; source: string; proof: string };
    const { TEXT_CHILD_ALLOWLIST } = (await import(
      pathToFileURL(join(process.cwd(), 'eslint.text-child.mjs')).href
    )) as { TEXT_CHILD_ALLOWLIST: Entry[] };
    const entry = TEXT_CHILD_ALLOWLIST.find((e) => e.file === 'src/tui/StatusBar.tsx' && e.expr === 'p.text');
    expect(entry).toBeDefined();
    expect(entry!.source).toContain('v<VERSION>');
    expect(entry!.source).toContain('padding');
    expect(entry!.source).toContain('ellipsis');
  });
});
