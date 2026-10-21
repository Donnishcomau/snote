/**
 * T538R-4 (F227, F224): the per-read rule at the blog-send question and in
 * the prompts.
 *
 * The send-to-blog question (and its resend form) is a y/n confirm of the
 * read gate: only a read that is exactly one key answers it, and a later key
 * of a read never answers it after an earlier key opened it. In a prompt the
 * read ends at Enter; the rest is dropped with the status line `Several keys
 * at once: only the first was used`. Each `stdin.write` below is one read.
 */
import { describe, it, expect } from 'vitest';
import { render } from 'ink-testing-library';
import React from 'react';
import { createServer } from 'node:http';
import { mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import type { AddressInfo } from 'node:net';

import { makeStore } from '../../src/core/store';
import { App } from '../../src/tui/App';
import { waitForFrame, waitForInput } from '../helpers/ink-waits';
import type { EntityId, TagName } from '@vendor/types';

const eid = (id: string): EntityId => id as unknown as EntityId;
const strip = (s: string | undefined): string => (s ?? '').replace(/\u001b\[[0-9;]*m/g, '');
const settle = () => new Promise((res) => setTimeout(res, 200));
const SEVERAL = 'Several keys at once: only the first was used';
const SEND = 'Send this note to your blog as a draft?';
const RESEND = 'Already sent as a draft. Send again as a new draft?';

async function at(content: string, tags: string[] = []) {
  const store = makeStore({ stubClient: {} });
  store.dispatch({
    type: 'IMPORT_NOTE_WITH_ID',
    noteId: eid('t1'),
    note: { content, systemTags: [], tags: tags as unknown as TagName[], deleted: false, modificationDate: 2000, creationDate: 2000 },
  });
  const r = render(<App store={store} width={80} height={24} />);
  await waitForInput(r.stdin);
  await waitForFrame(r.lastFrame, (f) => strip(f).includes(content.split('\n')[0]));
  const t1 = () => store.getState().data.notes.get(eid('t1'));
  const untouched = () => JSON.stringify(t1()?.systemTags) === '[]' && t1()?.deleted === false;
  const seen = (text: string) => waitForFrame(r.lastFrame, (f) => strip(f).includes(text));
  return { ...r, t1, untouched, seen };
}

/** A blog on localhost that counts the drafts it receives; blog.json in a temp data dir. */
async function withBlog(run: (hits: () => number, dir: string) => Promise<void>): Promise<void> {
  let hits = 0;
  const server = createServer((req, res) => {
    hits += 1;
    req.resume();
    req.on('end', () => {
      res.writeHead(201, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ id: 'p1', url: 'https://blog.example/write/p1' }));
    });
  });
  await new Promise<void>((ok) => server.listen(0, '127.0.0.1', () => ok()));
  const base = mkdtempSync(join(tmpdir(), 'read-gate-prompts-'));
  const dir = join(base, 'snote');
  mkdirSync(dir, { recursive: true });
  const origin = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  writeFileSync(join(dir, 'blog.json'), JSON.stringify({ origin, token: 'tok' }));
  const prev = process.env.XDG_DATA_HOME;
  process.env.XDG_DATA_HOME = base;
  try {
    await run(() => hits, dir);
  } finally {
    if (prev === undefined) delete process.env.XDG_DATA_HOME;
    else process.env.XDG_DATA_HOME = prev;
    server.close();
    rmSync(base, { recursive: true, force: true });
  }
}

describe('T538R-4 the blog-send question and the prompts', () => {
  it('1: WHEN the note pane of t1 shows `Send this note to your blog as a draft? y/n` and `y\\x1b[B` arrives as one read THEN the blog receives 0 drafts and the frame still contains `Send this note to your blog as a draft? y/n`', async () => {
    await withBlog(async (hits) => {
      const a = await at('hello world');
      a.stdin.write('\t');
      await a.seen('focus: preview');
      a.stdin.write('b');
      await a.seen(SEND);
      a.stdin.write('y\x1b[B');
      await settle();
      const frame = await a.seen(`${SEND} y/n`);
      expect(hits()).toBe(0);
      expect(strip(frame)).toContain(`${SEND} y/n`);
    });
  });

  it('2: WHEN t1 was already sent, the note pane shows `Already sent as a draft. Send again as a new draft? y/n` and `\\x1by` arrives as one read THEN the blog receives 0 drafts and the frame still contains `Already sent as a draft. Send again as a new draft? y/n`', async () => {
    await withBlog(async (hits, dir) => {
      writeFileSync(join(dir, 'blog-sent.json'), JSON.stringify({ t1: { postId: 'p0', url: 'https://blog.example/write/p0', sentAt: '2026-10-20T00:00:00.000Z' } }));
      const a = await at('hello world');
      a.stdin.write('\t');
      await a.seen('focus: preview');
      a.stdin.write('b');
      await a.seen(RESEND);
      a.stdin.write('\x1by');
      await settle();
      const frame = await a.seen(`${RESEND} y/n`);
      expect(hits()).toBe(0);
      expect(strip(frame)).toContain(`${RESEND} y/n`);
    });
  });

  it('3: WHEN the note pane of t1 is focused and `by` arrives as one read THEN the blog receives 0 drafts and the frame contains `Send this note to your blog as a draft? y/n`', async () => {
    await withBlog(async (hits) => {
      const a = await at('hello world');
      a.stdin.write('\t');
      await a.seen('focus: preview');
      a.stdin.write('by');
      await a.seen(SEND);
      await settle();
      const frame = await a.seen(`${SEND} y/n`);
      expect(hits()).toBe(0);
      expect(strip(frame)).toContain(`${SEND} y/n`);
    });
  });

  it("4: WHEN every file under `src/` is read THEN each file that tests input for y in any spelling (`=== 'y'`, `'y' ===`, `case 'y':`, single, double or back quotes, either case), other than `src/tui/app-keys.ts` (the list's copy-link key), contains `useReadGate({ confirm`, and `src/tui/blog-send-ask.ts` is one of them", () => {
    const ySite = /(={2,3}\s*['"`]y['"`])|(['"`]y['"`]\s*={2,3})|(case\s+['"`]y['"`]\s*:)/i;
    const files = (readdirSync('src', { recursive: true }) as string[]).filter((f) => /\.tsx?$/.test(f)).map((f) => join('src', f));
    const ySites = files.filter((f) => ySite.test(readFileSync(f, 'utf8')) && f !== join('src', 'tui', 'app-keys.ts'));
    const outside = ySites.filter((f) => !readFileSync(f, 'utf8').includes('useReadGate({ confirm'));
    expect(ySite.test("if ('y' === input)") && ySite.test('case "Y":') && ySite.test('input == `y`')).toBe(true);
    expect(ySites).toContain(join('src', 'tui', 'blog-send-ask.ts'));
    expect(outside).toEqual([]);
  });

  it('5: WHEN the note pane of t1 `Groceries\\n- [ ] milk` shows `new check item` and `soy\\rPd` arrives as one read THEN t1 holds content `Groceries\\n- [ ] milk\\n- [ ] soy`, system tags `[]` and deleted `false`, and the frame contains `Several keys at once: only the first was used`', async () => {
    const a = await at('Groceries\n- [ ] milk');
    a.stdin.write('\t');
    await a.seen('focus: preview');
    a.stdin.write('a');
    await a.seen('new check item');
    a.stdin.write('soy\rPd');
    const frame = await waitForFrame(a.lastFrame, (f) => strip(f).includes(SEVERAL) && a.t1()?.content === 'Groceries\n- [ ] milk\n- [ ] soy' && a.untouched());
    expect(a.t1()?.content).toBe('Groceries\n- [ ] milk\n- [ ] soy');
    expect(a.t1()?.systemTags).toEqual([]);
    expect(a.t1()?.deleted).toBe(false);
    expect(strip(frame)).toContain(SEVERAL);
  });

  it('6: WHEN note t1 carries tag `food`, the tags pane shows `rename tag: food` and `z\\rPd` arrives as one read THEN t1 has tags `["foodz"]`, system tags `[]` and deleted `false`, and the frame contains `Several keys at once: only the first was used`', async () => {
    const a = await at('hello world', ['food']);
    a.stdin.write('t');
    await a.seen('food');
    a.stdin.write('j');
    await a.seen('>food');
    a.stdin.write('R');
    await a.seen('rename tag: food');
    a.stdin.write('z\rPd');
    const frame = await waitForFrame(a.lastFrame, (f) => strip(f).includes(SEVERAL) && JSON.stringify(a.t1()?.tags) === '["foodz"]' && a.untouched());
    expect(a.t1()?.tags).toEqual(['foodz']);
    expect(a.t1()?.systemTags).toEqual([]);
    expect(a.t1()?.deleted).toBe(false);
    expect(strip(frame)).toContain(SEVERAL);
  });
});
