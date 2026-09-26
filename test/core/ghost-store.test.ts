import { describe, it, expect, afterEach, vi } from 'vitest';
import { tmpdir } from 'node:os';
import { readdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

import { FileGhostStore } from '../../src/core/ghost-store.js';

function makeTempDir(): string {
  return mkdtempSync(join(tmpdir(), 'snote-ghost-'));
}

describe('FileGhostStore', () => {
  afterEach(() => {
    // cleanup handled per-test with rmSync
  });

  it("WHEN put('a', 2, { x: 1 }) and setChangeVersion('cv9') have resolved and a NEW FileGhostStore(dir, 'note') is constructed THEN its getChangeVersion() resolves 'cv9' and get('a') resolves { key: 'a', version: 2, data: { x: 1 } }", async () => {
    const dir = makeTempDir();
    try {
      const store = new FileGhostStore(dir, 'note');
      await store.put('a', 2, { x: 1 } as any);
      await store.setChangeVersion('cv9');

      const store2 = new FileGhostStore(dir, 'note');
      expect(await store2.getChangeVersion()).toBe('cv9');
      const result = await store2.get('a');
      expect(result).toEqual({ key: 'a', version: 2, data: { x: 1 } });
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("WHEN get('missing') is called on an empty store THEN it resolves { key: 'missing', data: {} }", async () => {
    const dir = makeTempDir();
    try {
      const store = new FileGhostStore(dir, 'note');
      const result = await store.get('missing');
      expect(result.key).toBe('missing');
      expect(result.data).toEqual({});
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("WHEN remove('a') has resolved and a new instance is constructed THEN eachGhost visits no ghost with key 'a'", async () => {
    const dir = makeTempDir();
    try {
      const store = new FileGhostStore(dir, 'note');
      await store.put('a', 1, { foo: 'bar' } as any);
      await store.remove('a');

      const store2 = new FileGhostStore(dir, 'note');
      let visited = false;
      store2.eachGhost((ghost) => {
        if (ghost.key === 'a') visited = true;
      });
      expect(visited).toBe(false);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("WHEN two stores are made with bucket names 'note' and 'tag' in the same dir THEN a put in one is not visible in the other and two files exist", async () => {
    const dir = makeTempDir();
    try {
      const noteStore = new FileGhostStore(dir, 'note');
      const tagStore = new FileGhostStore(dir, 'tag');

      await noteStore.put('n1', 1, { a: 1 } as any);
      await tagStore.put('t1', 1, { b: 2 } as any);

      const noteResult = await noteStore.get('t1');
      expect(noteResult.key).toBe('t1');
      expect(noteResult.data).toEqual({});

      const tagResult = await tagStore.get('n1');
      expect(tagResult.key).toBe('n1');
      expect(tagResult.data).toEqual({});

      const files = readdirSync(dir);
      expect(files.filter((f) => f.startsWith('ghosts-'))).toHaveLength(2);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("WHEN the file contains the text 'not json' THEN constructing the store does not throw and getChangeVersion() resolves ''", async () => {
    const dir = makeTempDir();
    try {
      writeFileSync(join(dir, 'ghosts-note.json'), 'not json');
      const store = new FileGhostStore(dir, 'note');
      expect(await store.getChangeVersion()).toBe('');
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("WHEN any write has finished THEN no file ending in .tmp remains in the dir", async () => {
    const dir = makeTempDir();
    try {
      const store = new FileGhostStore(dir, 'note');
      await store.put('a', 1, { x: 1 } as any);
      await store.setChangeVersion('cv1');
      await store.flush();

      const files = readdirSync(dir);
      expect(files.filter((f) => f.endsWith('.tmp'))).toHaveLength(0);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
