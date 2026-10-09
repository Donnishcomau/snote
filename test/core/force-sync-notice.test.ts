/**
 * T486: one press of force sync shows at most one problem notice,
 * however many steps failed. `store.forceSync` collects the outcome of
 * every bucket step and every pending-note re-send of that press and
 * publishes a single summary notice when at least one step failed.
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { FakeSimperiumServer } from '../fake-simperium/server';
import { makeStore, waitForNotes, type SyncConfig } from '../../src/core/store';
import {
  onProblem,
  resetProblemSignal,
} from '../../src/core/problem-signal';
import type { EntityId } from '@vendor/types';

const APP_ID = 'test-app';
const TOKEN = 'test-token';
const USERNAME = 'test@example.com';

// Helper to create branded types for testing (idiom: test/core/store.test.ts)
const eid = (id: string): EntityId => id as unknown as EntityId;

// Only the part of the live sync client that these tests touch:
// the bucket list, a bucket's name, its channel's ghost store, and
// the note bucket's touch().
interface TestBucket {
  name?: string;
  channel?: {
    store?: { getChangeVersion?: () => Promise<string | undefined> };
  };
  touch?: (id: string) => Promise<unknown>;
}
interface TestClient {
  buckets?: TestBucket[];
}

const noteData = () => ({
  content: 'Original',
  creationDate: Date.now(),
  deleted: 0,
  modificationDate: Date.now(),
  systemTags: [],
  tags: [],
});

// Poll for the notice; every asserted value sits inside the wait itself.
async function pollUntil(cond: () => boolean): Promise<boolean> {
  for (let i = 0; i < 40 && !cond(); i++) {
    await new Promise((r) => setTimeout(r, 50));
  }
  return cond();
}

// Poll a fixed short span (steps may settle with zero notices).
async function pollSpan(ms: number): Promise<void> {
  for (let t = 0; t < ms; t += 50) {
    await new Promise((r) => setTimeout(r, 50));
  }
}

describe('T486 one press of force sync publishes at most one notice', () => {
  let server: FakeSimperiumServer;
  let notices: string[];
  let unsubscribe: (() => void) | undefined;

  beforeEach(async () => {
    resetProblemSignal();
    notices = [];
    server = new FakeSimperiumServer();
    await server.start();
    // One real note per id so the index completes and waitForNotes resolves.
    server.seedBucket(APP_ID, 'note', [
      { id: 'note1', data: noteData() },
      { id: 'note2', data: noteData() },
      { id: 'note3', data: noteData() },
    ]);
  });

  afterEach(async () => {
    unsubscribe?.();
    unsubscribe = undefined;
    resetProblemSignal();
    // Let in-flight frames settle, then stop the server.
    await new Promise<void>((resolveDone) => {
      setTimeout(() => {
        server.stop();
        resolveDone();
      }, 100);
    });
  });

  const connect = async () => {
    const config: SyncConfig = {
      appId: APP_ID,
      token: TOKEN,
      username: USERNAME,
      clientOptions: { url: server.url },
      noteEditDelayMs: 10,
    };
    const store = makeStore({ sync: config });
    await waitForNotes(store, 2500);
    return store;
  };

  // Three pinned notes: the middleware debounces a local touch() per note,
  // which stands each one in pendingNotes. Wait past the debounce so the
  // middleware's own touch() has already run before a test patches it.
  const makePendingNotes = async (store: ReturnType<typeof makeStore>) => {
    for (const noteId of ['n1', 'n2', 'n3']) {
      store.dispatch({
        type: 'PIN_NOTE',
        noteId: eid(noteId),
        shouldPin: true,
      });
    }
    await new Promise((r) => setTimeout(r, 300));
  };

  it('1: WHEN two buckets\' change-version reads reject and three pending-note re-sends reject and `forceSync()` is called once THEN, after the steps settle, exactly `1` notice was published and it starts with `force sync: 5 step(s) failed (`', async () => {
    const store = await connect();
    await makePendingNotes(store);

    // store.client is the same client object forceSync iterates over;
    // one cast here reaches its buckets.
    const client = store.client as TestClient;
    const noteBucket = client.buckets?.find((b) => b?.name === 'note');
    const tagBucket = client.buckets?.find((b) => b?.name === 'tag');
    noteBucket!.channel!.store = {
      getChangeVersion: () => Promise.reject(new Error('boom')),
    };
    tagBucket!.channel!.store = {
      getChangeVersion: () => Promise.reject(new Error('boom')),
    };
    // three notes stand in pendingNotes (sent but never acknowledged) and
    // each re-send rejects, so the press has 5 failed steps in total
    store.dispatch({ type: 'SUBMIT_PENDING_CHANGE', entityId: eid('n1'), ccid: 'cc1' });
    store.dispatch({ type: 'SUBMIT_PENDING_CHANGE', entityId: eid('n2'), ccid: 'cc2' });
    store.dispatch({ type: 'SUBMIT_PENDING_CHANGE', entityId: eid('n3'), ccid: 'cc3' });
    noteBucket!.touch = () => Promise.reject(new Error('boom'));

    unsubscribe = onProblem((line) => notices.push(line));
    store.forceSync!();

    const arrived = await pollUntil(
      () =>
        notices.length === 1 &&
        notices[0].startsWith('force sync: 5 step(s) failed (')
    );
    await pollSpan(200);

    expect(arrived).toBe(true);
    expect(notices).toHaveLength(1);
    expect(notices[0].startsWith('force sync: 5 step(s) failed (')).toBe(true);
  });

  it('2: WHEN one note stands in pendingNotes and every step succeeds and `forceSync()` is called once THEN the note bucket\'s `touch` was called `1` time and `0` notices were published', async () => {
    const store = await connect();
    await makePendingNotes(store);

    const client = store.client as TestClient;
    const noteBucket = client.buckets?.find((b) => b?.name === 'note');
    // n1 was sent but never acknowledged, so it stays in pendingNotes;
    // n2 and n3 were sent and acknowledged, so the reducer dropped them.
    store.dispatch({ type: 'SUBMIT_PENDING_CHANGE', entityId: eid('n1'), ccid: 'cc1' });
    store.dispatch({ type: 'SUBMIT_PENDING_CHANGE', entityId: eid('n2'), ccid: 'cc2' });
    store.dispatch({ type: 'ACKNOWLEDGE_PENDING_CHANGE', entityId: eid('n2'), ccid: 'cc2' });
    store.dispatch({ type: 'SUBMIT_PENDING_CHANGE', entityId: eid('n3'), ccid: 'cc3' });
    store.dispatch({ type: 'ACKNOWLEDGE_PENDING_CHANGE', entityId: eid('n3'), ccid: 'cc3' });
    expect(Object.keys(store.getState().simperium.pendingNotes)).toEqual(['n1']);

    // record every id forceSync re-sends, resolving so the step succeeds
    const touched: string[] = [];
    noteBucket!.touch = (id: string) => {
      touched.push(id);
      return Promise.resolve();
    };

    unsubscribe = onProblem((line) => notices.push(line));
    store.forceSync!();

    const resent = await pollUntil(
      () => touched.length === 1 && touched[0] === 'n1' && notices.length === 0
    );
    await pollSpan(200);

    expect(resent).toBe(true);
    expect(touched).toEqual(['n1']);
    expect(notices).toHaveLength(0);
  });

  it('3: WHEN the live client\'s `buckets` is `undefined` and `forceSync()` is called THEN it returns `undefined` without throwing and `0` notices were published', async () => {
    const store = await connect();

    // The client stays live but has no buckets to iterate, so
    // forceSync's bucket loops run over nothing.
    (store.client as TestClient).buckets = undefined;

    unsubscribe = onProblem((line) => notices.push(line));

    let result: unknown = 'not-called';
    expect(() => {
      result = store.forceSync!();
    }).not.toThrow();
    expect(result).toBeUndefined();

    await pollSpan(200);
    expect(notices).toHaveLength(0);
  });

  it('4: WHEN the file `test/core/force-sync-notice.test.ts` is read THEN it contains no `as never` and no `: any`', () => {
    const text = readFileSync(
      join(process.cwd(), 'test', 'core', 'force-sync-notice.test.ts'),
      'utf8'
    );
    expect(text.length).toBeGreaterThan(1000);
    // This test's own title line names the two strings, so drop it.
    const body = text
      .split('\n')
      .filter((line) => !line.includes("it('4:"))
      .join('\n');
    // Spelled from fragments so this check does not match its own lines.
    expect(body.includes('as ' + 'never')).toBe(false);
    expect(body.includes(': ' + 'any')).toBe(false);
  });
});
