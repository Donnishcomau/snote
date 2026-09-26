import { describe, it, expect } from 'vitest';
import { mkdtempSync, rmSync, readdirSync, existsSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { FileGhostStore } from '../../src/core/ghost-store.js';

// `root` is a fresh fs.mkdtempSync folder and `dir` is `<root>/acct/deep`,
// which does NOT exist.
function makeMissingDir(): string {
  const root = mkdtempSync(join(tmpdir(), 'snote-ghost-missing-'));
  return join(root, 'acct', 'deep');
}

describe('FileGhostStore: missing dir never crashes', () => {
  it('1: WHEN new FileGhostStore(dir, note) is constructed and await store.put(a, 1, { x: 1 }) and await store.flush() run THEN nothing throws, fs.existsSync(dir) went from false to true, and a new FileGhostStore(dir, note) resolves get(a) with version 1', async () => {
    const dir = makeMissingDir();
    expect(existsSync(dir)).toBe(false);

    const store = new FileGhostStore(dir, 'note');
    await store.put('a', 1, { x: 1 } as any);
    await store.flush();

    expect(existsSync(dir)).toBe(true);

    const store2 = new FileGhostStore(dir, 'note');
    const result = await store2.get('a');
    expect(result.version).toBe(1);

    rmSync(join(dir, '..', '..'), { recursive: true, force: true });
  });

  it('2: WHEN after line 1 steps, fs.rmSync(dir, recursive: true) runs and then await store.put(b, 1, { x: 2 }) and await store.flush() run THEN nothing throws and fs.existsSync(dir) is false', async () => {
    const root = mkdtempSync(join(tmpdir(), 'snote-ghost-missing-'));
    const dir = join(root, 'acct', 'deep');
    expect(existsSync(dir)).toBe(false);

    const store = new FileGhostStore(dir, 'note');
    await store.put('a', 1, { x: 1 } as any);
    await store.flush();
    expect(existsSync(dir)).toBe(true);

    // wipe the folder
    rmSync(dir, { recursive: true, force: true });
    expect(existsSync(dir)).toBe(false);

    // put + flush on a wiped folder must not recreate it
    await store.put('b', 1, { x: 2 } as any);
    await store.flush();

    expect(existsSync(dir)).toBe(false);

    rmSync(root, { recursive: true, force: true });
  });

  it('3: WHEN await store.setChangeVersion(cv1) runs on a store whose dir never existed THEN nothing throws and the file ghosts-note.json in dir contains cv1', async () => {
    const dir = makeMissingDir();
    expect(existsSync(dir)).toBe(false);

    const store = new FileGhostStore(dir, 'note');
    await store.setChangeVersion('cv1');

    expect(existsSync(dir)).toBe(true);
    const filePath = join(dir, 'ghosts-note.json');
    expect(existsSync(filePath)).toBe(true);
    const raw = readFileSync(filePath, 'utf8');
    const file = JSON.parse(raw);
    expect(file.cv).toBe('cv1');

    rmSync(join(dir, '..', '..'), { recursive: true, force: true });
  });

  it('4: WHEN await store.remove(zzz) runs on a store whose dir never existed THEN nothing throws', async () => {
    const dir = makeMissingDir();
    expect(existsSync(dir)).toBe(false);

    const store = new FileGhostStore(dir, 'note');
    await store.remove('zzz');

    // nothing throws

    rmSync(join(dir, '..', '..'), { recursive: true, force: true });
  });
});
