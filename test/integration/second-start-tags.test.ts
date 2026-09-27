/**
 * T199: CRASH source — after a restart with saved data no tag without a
 * name may enter `data.tags`, and saved named tags come back.
 *
 * A development setup crashed on every second start because the simperium
 * `tag` bucket answered `data: undefined` for a tag hash the local state did
 * not know (a tag only attached to a locally created note, never created as
 * a tag-bucket object). The sync library's `touch` then fed that `undefined`
 * into `TAG_BUCKET_UPDATE` and the vendored reducer stored it verbatim.
 */
import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import React from 'react';
import { render } from 'ink-testing-library';

import { FakeSimperiumServer } from '../fake-simperium/server';
import { buildStore } from '../../src/cli/main';
import { loadState } from '../../src/core/persistence';
import { tagRows } from '../../src/core/collection';
import { App } from '../../src/tui/App';

type AnyStore = ReturnType<typeof buildStore>['store'];

const waitFor = async (cond: () => boolean, timeoutMs = 2500) => {
  const start = Date.now();
  while (!cond()) {
    if (Date.now() - start > timeoutMs) {
      throw new Error('timed out waiting for condition');
    }
    await new Promise((r) => setTimeout(r, 50));
  }
};

const named = (tag: unknown): boolean =>
  typeof (tag as { name?: unknown })?.name === 'string' &&
  (tag as { name: string }).name !== '';

describe('T199 second start keeps named tags', () => {
  let server: FakeSimperiumServer;
  let dir: string;
  let stopSaving: (() => void) | undefined;
  let secondStore: AnyStore | null = null;

  const build = () => {
    const result = buildStore(
      {
        dataDir: dir,
        appId: 'test-app',
        server: server.url,
        noteEditDelayMs: 10,
      },
      { email: 'test@example.com', token: 'test-token' },
      () => {}
    );
    stopSaving = result.stopSaving;
    return result;
  };

  const noteData = (content: string, now: number, tags: string[]) => ({
    content,
    creationDate: now,
    modificationDate: now,
    deleted: 0,
    systemTags: [],
    tags,
  });

  beforeAll(async () => {
    // keep the sync library's own timers (2 s note-edit delay) from
    // stacking up over the two sessions and blowing the 3 s test timeout
    vi.useFakeTimers({ shouldAdvanceTime: true });

    server = new FakeSimperiumServer();
    await server.start();
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'snote-t199-'));

    const now = Date.now();
    server.seedBucket('test-app', 'note', [
      { id: 'n1', data: noteData('One', now, ['home']), version: 1 },
      { id: 'n2', data: noteData('Two', now, ['work']), version: 1 },
    ]);
    server.seedBucket('test-app', 'tag', [
      { id: 'home', data: { name: 'home', index: 0 }, version: 1 },
      { id: 'work', data: { name: 'work', index: 1 }, version: 1 },
      { id: 'ideas', data: { name: 'ideas', index: 2 }, version: 1 },
    ]);

    // first run: notes + tags sync in; then create n3 offline
    const first = build();
    const store = first.store;
    await waitFor(
      () =>
        store.getState().data.notes.size === 2 &&
        store.getState().data.tags.size === 3
    );

    store.dispatch({
      type: 'CREATE_NOTE_WITH_ID',
      noteId: 'n3' as never,
      note: {
        content: 'made offline',
        creationDate: Date.now(),
        modificationDate: Date.now(),
        deleted: 0,
        systemTags: [],
        tags: ['ideas'],
      } as never,
    });

    await waitFor(() => !!server.getObject('test-app', 'note', 'n3'));
    // let the offline tag touch reach the store before we persist,
    // so the saved state is what the first run truly ended with
    await new Promise((r) => setTimeout(r, 400));
    // flush state.json (debounced saver) and close the first session
    first.stopSaving();
    stopSaving = undefined;

    // second run on the same dir
    const second = build();
    secondStore = second.store;
    await new Promise((r) => setTimeout(r, 1000));
  });

  afterAll(async () => {
    vi.useRealTimers();
    stopSaving?.();
    stopSaving = undefined;
    await new Promise<void>((resolve) => {
      setTimeout(() => {
        server.stop();
        resolve();
      }, 100);
    });
    fs.rmSync(dir, { recursive: true, force: true });
  });

  const tagsOfSecond = () => secondStore!.getState().data.tags;

  it('1: WHEN the first run is done THEN loadState(dir).data.tags.size is 3 and it has the key home with name home', async () => {
    const saved = loadState(dir);
    const tags = saved!.data.tags as Map<string, { name?: string }>;
    expect(tags.size).toBe(3);
    expect(tags.get('home')?.name).toBe('home');
  });

  it('2: WHEN after the first run build() runs a second time on the same dir and 1 s has passed THEN every value of data.tags has a non-empty string name, data.tags.size is 3, and data.notes.size is 3', async () => {
    await waitFor(
      () =>
        [...tagsOfSecond().values()].every(named) &&
        tagsOfSecond().size === 3 &&
        secondStore!.getState().data.notes.size === 3
    );

    const tags = tagsOfSecond();
    const allNamed = [...tags.values()].every(named);
    expect(allNamed).toBe(true);
    expect(tags.size).toBe(3);
    expect(secondStore!.getState().data.notes.size).toBe(3);
  });

  it('3: WHEN on that second store tagRows(state.data.tags) is called THEN it returns an array of length 3 that includes home, work and ideas and no undefined', async () => {
    await waitFor(
      () =>
        tagRows(tagsOfSecond()).length === 3 &&
        tagRows(tagsOfSecond()).includes('home' as never) &&
        tagRows(tagsOfSecond()).includes('work' as never) &&
        tagRows(tagsOfSecond()).includes('ideas' as never) &&
        !tagRows(tagsOfSecond()).includes(undefined as never)
    );

    const rows = tagRows(tagsOfSecond());
    expect(rows.length).toBe(3);
    expect(rows).toContain('home');
    expect(rows).toContain('work');
    expect(rows).toContain('ideas');
    expect(rows).not.toContain(undefined);
  });

  it('4: WHEN <App store={secondStore} width={120} height={32} /> is rendered THEN the frame contains All notes, home, ideas and made offline, and does not contain undefined', async () => {
    await waitFor(
      () =>
        secondStore!.getState().data.notes.size === 3 &&
        tagsOfSecond().size === 3
    );

    // React.createElement instead of JSX: the Gate names this file .ts,
    // and esbuild only parses JSX inside .tsx files.
    const { lastFrame, unmount } = render(
      React.createElement(App, {
        store: secondStore as never,
        width: 120,
        height: 32,
      })
    );
    await new Promise((r) => setTimeout(r, 200));

    const frame = lastFrame() ?? '';
    expect(frame).toContain('All notes');
    expect(frame).toContain('home');
    expect(frame).toContain('ideas');
    expect(frame).toContain('made offline');
    expect(frame).not.toContain('undefined');
    unmount();
  });
});
