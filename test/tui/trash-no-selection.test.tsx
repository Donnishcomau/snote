/**
 * Issue #11 — Trash (`d`) silently ignored once on the real service.
 *
 * Live flow: Root over a real account store against the fake server
 * (honest-sync.test.tsx pattern) — the note list arrives asynchronously
 * after the first frame, exactly as on the real service. The empty-list
 * case is a store with no notes, where nothing is selected.
 */
import { describe, it, expect, afterEach, vi } from 'vitest';
import { render } from 'ink-testing-library';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import React from 'react';

import { FakeSimperiumServer } from '../fake-simperium/server';
import { accountStore } from '../../src/cli/main';
import { makeStore } from '../../src/core/store';
import { saveToken } from '../../src/core/token';
import { App } from '../../src/tui/App';
import { Root } from '../../src/tui/Root';
import type { Auth } from '../../src/tui/Root';
import { waitForFrame, waitForInput } from '../helpers/ink-waits';
import type { Store } from 'redux';
import type { State } from '../../src/core/store';
import type { EntityId } from '@vendor/types';

const EMAIL = 'test@example.com';
const appId = 'test-app';

const eid = (id: string): EntityId => id as unknown as EntityId;

const noteData = (content: string) => ({
  content,
  creationDate: 1_000,
  modificationDate: 1_000,
  deleted: 0,
  systemTags: [],
  tags: [],
});

/** Poll until true; throws on timeout so it composes with expect. */
async function pollUntil(cond: () => boolean, what: string, ms = 5000, frame?: () => string | undefined): Promise<void> {
  await vi.waitFor(() => {
    if (!cond()) throw new Error(`pollUntil: ${what}; frame: ${JSON.stringify(frame?.())}`);
  }, { timeout: ms, interval: 10 });
}

let server: FakeSimperiumServer | null = null;
let dir = '';

afterEach(async () => {
  const s = server;
  server = null;
  if (dir) {
    fs.rmSync(dir, { recursive: true, force: true });
    dir = '';
  }
  if (s) {
    await new Promise((r) => setTimeout(r, 50));
    s.stop();
  }
});

/**
 * Root over a real account store; the fake server seeds `contents` as the
 * note list, which arrives over the wire after the first frame (the real
 * service). Resolves once the frame shows them.
 */
async function startLive(contents: string[]) {
  server = new FakeSimperiumServer();
  await server.start();
  server.seedBucket(
    appId,
    'note',
    contents.map((content, i) => ({ id: `n${i + 1}`, data: noteData(content), version: 1 })),
  );
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'snote-i11-'));
  await saveToken(dir, { email: EMAIL, token: 'test-token', server: server.url });
  let built: ReturnType<typeof accountStore> | null = null;
  const makeStoreFor = vi.fn((auth: Auth, onLogout: () => void) => {
    built = accountStore(
      { dataDir: dir, appId, server: server!.url, authWatchdogMs: 600000 },
      auth,
      onLogout,
    );
    return built.store as never;
  });
  const r = render(
    <Root
      dataDir={dir}
      server={server.url}
      width={80}
      height={24}
      makeStoreFor={makeStoreFor}
      requestCode={vi.fn().mockResolvedValue(undefined)}
      completeLogin={vi.fn().mockResolvedValue('test-token')}
      passwordLogin={vi.fn().mockResolvedValue('test-token')}
    />,
  );
  await waitForInput(r.stdin);
  await waitForFrame(r.lastFrame, (f) => contents.every((c) => f.includes(c)));
  return { r, store: () => (built as unknown as ReturnType<typeof accountStore>).store };
}

function stopLive(r: { unmount(): void }, getStore: () => Store<State>): void {
  r.unmount();
  try {
    (getStore() as Store<State> & { stopSync?: () => void }).stopSync?.();
  } catch {
    /* already ended */
  }
}

describe('issue #11: trash (d) never fails silently', () => {
  it('1: WHEN `d` is pressed on a selected note THEN the note moves to the trash', { timeout: 20000 }, async () => {
    const { r, store } = await startLive(['First live note', 'Second live note']);

    // Row 0 (`First live note`) carries the selection marker; press `d` on it.
    r.stdin.write('d');

    await pollUntil(() => {
      const frame = r.lastFrame() ?? '';
      const note = store().getState().data.notes.get(eid('n1'));
      return Boolean(note?.deleted) && frame.includes('1 note') && !frame.includes('2 notes') && !frame.includes('First live note');
    }, 'note n1 deleted and the frame shows only the second note');

    const frame = r.lastFrame() ?? '';
    const note = store().getState().data.notes.get(eid('n1'));
    expect(note?.deleted).toBe(true);
    expect(frame).toContain('1 note');
    expect(frame).not.toContain('2 notes');
    expect(frame).not.toContain('First live note');
    expect(frame).toContain('Second live note');
    stopLive(r, store);
  });

  it('2: WHEN `d` is pressed with nothing selected THEN snote tells the user instead of failing silently', { timeout: 8000 }, async () => {
    const store = makeStore({ stubClient: {} });
    const { stdin, lastFrame, unmount } = render(<App store={store} width={80} height={24} />);
    await waitForInput(stdin);
    await waitForFrame(lastFrame, '0 notes');

    stdin.write('d');

    const frame = await waitForFrame(lastFrame, 'Nothing selected');
    expect(frame).toContain('Nothing selected');
    expect(store.getState().data.notes.size).toBe(0);
    unmount();
  });

  it('3: WHEN the live test is repeated THEN no ignored `d` is found', { timeout: 20000 }, async () => {
    const { r, store } = await startLive(['Alpha note', 'Bravo note']);

    // Repeat the live `d` test: every press must trash one note, starting at
    // the first. A `d` that goes ignored stalls the frame and fails the wait.
    // Each press trashes the note under the marker: first Alpha (the marker
    // sits on row 0), then Bravo (the only row left after the 1st press).
    const presses = ['Alpha note', 'Bravo note'];
    const seen: string[] = [];
    for (const gone of presses) {
      r.stdin.write('d');
      await pollUntil(() => {
        const frame = r.lastFrame() ?? '';
        return frame.includes('note') && !frame.includes(gone);
      }, `frame lost '${gone}' after this d (deleted: ${['n1', 'n2'].map((id) => store().getState().data.notes.get(eid(id))?.deleted).join(',')})`, 5000, r.lastFrame);
      seen.push(gone);
    }

    await pollUntil(() => {
      const frame = r.lastFrame() ?? '';
      const states = ['n1', 'n2'].map((id) => store().getState().data.notes.get(eid(id))?.deleted);
      return frame.includes('0 notes') && states.every((d) => Boolean(d));
    }, 'both notes trashed and the frame shows 0 notes');

    expect(seen).toEqual(['Alpha note', 'Bravo note']);
    const frame = r.lastFrame() ?? '';
    expect(frame).toContain('0 notes');
    for (const id of ['n1', 'n2']) {
      expect(store().getState().data.notes.get(eid(id))?.deleted).toBe(true);
    }
    stopLive(r, store);
  });
});
