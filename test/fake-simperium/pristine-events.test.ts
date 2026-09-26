/**
 * Tests that verify the fake-server tests use unpatched Simperium events.
 * The published simperium@1.1.4 never emits 'auth' or 'ready' on the client:
 * those exist only because two lines were added by hand inside node_modules.
 * This test file verifies we listen for what the unpatched library does emit.
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'fs';
import createClient from 'simperium';
import { FakeSimperiumServer } from './server';
import { InMemoryBucket } from '../../vendor/simplenote/state/simperium/functions/in-memory-bucket';
import { InMemoryGhost } from '../../vendor/simplenote/state/simperium/functions/in-memory-ghost';

const TEST_TIMEOUT = 3000;

describe('pristine events', () => {
  let server: FakeSimperiumServer;

  afterEach(() => {
    server.stop();
  });

  it('1: WHEN a client with the token test-token opens the bucket note THEN within 2 s its collected message frames include exactly 0:auth:test@example.com and none of them starts with 0:auth:{', async () => {
    server = new FakeSimperiumServer();
    const { url } = await server.start();

    const client = createClient('test-app', 'test-token', {
      url,
      objectStoreProvider: () => new InMemoryBucket(),
      ghostStoreProvider: () => new InMemoryGhost(),
    });

    try {
      const notes = client.bucket('note');

      const frames: string[] = [];
      client.on('message', (frame: string) => frames.push(frame));

      await new Promise<void>((resolve, reject) => {
        const timeout = setTimeout(() => {
          reject(new Error('Timeout waiting for auth frame'));
        }, 2000);

        const checkFrames = () => {
          const authFrame = frames.find(f => f === '0:auth:test@example.com');
          const badFrame = frames.find(f => f.startsWith('0:auth:{'));
          
          if (authFrame) {
            clearTimeout(timeout);
            expect(authFrame).toBe('0:auth:test@example.com');
            expect(badFrame).toBeUndefined();
            resolve();
          }
        };

        // Check immediately and on each message
        checkFrames();
        client.on('message', checkFrames);
      });
    } finally {
      client.end();
    }
  }, TEST_TIMEOUT);

  it('2: WHEN client 1 has indexed the 2 seeded notes note1 and note2 and client 2 shares its ghost store THEN the channel of client 2\'s bucket emits ready within 2 s and, 200 ms later, its bucket has emitted index 0 times', async () => {
    server = new FakeSimperiumServer();
    const { url } = await server.start();

    // Seed server with 2 notes
    server.seedBucket('test-app', 'note', [
      { id: 'note1', data: { title: 'Note 1' } },
      { id: 'note2', data: { title: 'Note 2' } },
    ]);

    // Shared ghost store for both clients
    const sharedGhostStore = new InMemoryGhost();

    // First client: index and save CV to shared store
    const client1 = createClient('test-app', 'test-token', {
      url,
      objectStoreProvider: () => new InMemoryBucket(),
      ghostStoreProvider: () => sharedGhostStore,
    });

    try {
      const notes1 = client1.bucket('note');

      // Wait for indexing to complete
      await new Promise<void>((resolve, reject) => {
        const timeout = setTimeout(() => {
          reject(new Error('Timeout waiting for first index'));
        }, TEST_TIMEOUT);

        notes1.on('index', () => {
          clearTimeout(timeout);
          resolve();
        });
      });

      // Create second client with the SAME ghost store (which has the CV from client 1)
      const client2 = createClient('test-app', 'test-token', {
        url,
        objectStoreProvider: () => new InMemoryBucket(),
        ghostStoreProvider: () => sharedGhostStore,
      });

      try {
        const notes2 = client2.bucket('note');

        let indexCount = 0;
        notes2.on('index', () => indexCount++);

        await new Promise<void>((resolve, reject) => {
          const timeout = setTimeout(() => {
            reject(new Error('Timeout waiting for ready event'));
          }, 2000);

          notes2.channel.on('ready', () => {
            clearTimeout(timeout);
            // Wait 200ms and verify index was not emitted
            setTimeout(() => {
              expect(indexCount).toBe(0);
              resolve();
            }, 200);
          });
        });
      } finally {
        client2.end();
      }
    } finally {
      client1.end();
    }
  }, TEST_TIMEOUT);

  it('3: WHEN a client with the token bad-token opens the bucket note THEN it emits unauthorized within 2 s and no collected frame matches /^0:auth:[^ {]/', async () => {
    server = new FakeSimperiumServer();
    const { url } = await server.start();

    const client = createClient('test-app', 'bad-token', {
      url,
      objectStoreProvider: () => new InMemoryBucket(),
      ghostStoreProvider: () => new InMemoryGhost(),
    });

    try {
      client.bucket('note');

      const frames: string[] = [];
      client.on('message', (frame: string) => frames.push(frame));

      await new Promise<void>((resolve, reject) => {
        const timeout = setTimeout(() => {
          reject(new Error('Timeout waiting for unauthorized'));
        }, 2000);

        client.on('unauthorized', () => {
          clearTimeout(timeout);
          // Verify no auth frame with plain text (non-JSON) was received
          const badFrame = frames.find(f => /^0:auth:[^{]/.test(f));
          expect(badFrame).toBeUndefined();
          resolve();
        });
      });
    } finally {
      client.end();
    }
  }, TEST_TIMEOUT);

  it('4: WHEN test/fake-simperium/server.test.ts is read as text THEN /\.on\(.auth./ and /client2\.on\(.ready./ do not match it and /^\\s*it\(.\d+:/gm matches exactly 10 times', async () => {
    const text = fs.readFileSync('test/fake-simperium/server.test.ts', 'utf8');

    // Check that patched event listeners are not used
    const authPattern = /\.on\(.auth./;
    const client2ReadyPattern = /client2\.on\(.ready./;
    
    expect(text).not.toMatch(authPattern);
    expect(text).not.toMatch(client2ReadyPattern);

    // Check that there are exactly 10 it() blocks
    const itPattern = /^\s*it\('\d+:/gm;
    const matches = text.match(itPattern);
    expect(matches).toBeDefined();
    expect(matches?.length).toBe(10);
  });
});
