/**
 * #143: readDraft keeps reading until it has the whole file or EOF.
 *
 * The short read is a stub of node:fs readSync (vi.mock of the module, since an
 * ESM namespace cannot be spied on) that hands back at most 3 bytes per call and
 * is otherwise the real readSync. The tests observe only the public surface:
 * recoverDrafts and the text of the note it restores.
 */
import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, statSync, truncateSync, writeFileSync, chmodSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

const stub = vi.hoisted(() => ({
  maxPerCall: 0, // 0 = pass through
  calls: 0,
  limit: 200, // bounds a runaway loop: the stub throws, so no test can hang
  afterFirstCall: null as null | (() => void),
}));

vi.mock('node:fs', async (importOriginal) => {
  const actual = await importOriginal<typeof import('node:fs')>();
  const readSync = (fd: number, buf: Buffer, off: number, len: number, pos: number) => {
    if (stub.maxPerCall === 0) return actual.readSync(fd, buf, off, len, pos);
    stub.calls++;
    if (stub.calls > stub.limit) throw new Error('readSync called too often');
    const n = actual.readSync(fd, buf, off, Math.min(len, stub.maxPerCall), pos);
    if (stub.calls === 1) stub.afterFirstCall?.();
    return n;
  };
  return { ...actual, readSync };
});

import { MAX_DRAFT_BYTES, draftsDir, recoverDrafts, setDraftsDir } from '../../src/core/editor-drafts';
import type { TooLargeDraft } from '../../src/core/editor-drafts';
import { makeStore } from '../../src/core/store';

const cleanup: string[] = [];
beforeEach(() => {
  const account = mkdtempSync(join(tmpdir(), 'editor-drafts-short-'));
  cleanup.push(account);
  setDraftsDir(join(account, 'drafts'));
  stub.maxPerCall = 3;
  stub.calls = 0;
  stub.afterFirstCall = null;
});
afterEach(() => {
  stub.maxPerCall = 0;
  stub.afterFirstCall = null;
  for (const d of cleanup.splice(0)) rmSync(d, { recursive: true, force: true });
  setDraftsDir(null);
});

function writeDraft(folderName: string, file: string, data: string): { folder: string; file: string } {
  const folder = join(draftsDir(), folderName);
  mkdirSync(folder, { recursive: true, mode: 0o700 });
  chmodSync(folder, 0o700);
  const full = join(folder, file);
  writeFileSync(full, data, { mode: 0o600 });
  chmodSync(full, 0o600);
  return { folder, file: full };
}

const noteContents = (store: ReturnType<typeof makeStore>): string[] =>
  [...store.getState().data.notes.values()].map((n) => n.content);

const TEXT = 'first line\nsecond é line ✓ end\nthird line';

describe('#143 readDraft reads the whole draft', () => {
  it('1: WHEN readSync returns at most `3` bytes per call on a draft larger than `3` bytes THEN recoverDrafts restores the full text of the draft', () => {
    writeDraft('snote-short', 'a.md', TEXT);
    const store = makeStore({ stubClient: {} });
    expect(recoverDrafts(store)).toBe(1);
    expect(stub.calls).toBeGreaterThan(3);
    expect(noteContents(store)).toEqual([TEXT]);
  });

  it('2: WHEN a draft is restored through short reads THEN the restored text is byte-identical to the file on disk, a draft of `54` bytes', () => {
    const d = writeDraft('snote-bytes', 'b.md', 'café ✓ '.repeat(5) + 'done');
    const onDisk = readFileSync(d.file);
    expect(onDisk.length).toBe(54);
    const store = makeStore({ stubClient: {} });
    expect(recoverDrafts(store)).toBe(1);
    const [restored] = noteContents(store);
    expect(Buffer.from(restored, 'utf-8').equals(onDisk)).toBe(true);
    expect(stub.calls).toBeGreaterThan(10);
  });

  it('3: WHEN a draft of `1048577` bytes is over the cap THEN it is not read (`0` readSync calls), reported as too large, and still on disk', () => {
    const big = writeDraft('snote-big', 'big.md', 'a'.repeat(MAX_DRAFT_BYTES + 1));
    const store = makeStore({ stubClient: {} });
    const tooLarge: TooLargeDraft[] = [];
    expect(recoverDrafts(store, draftsDir(), tooLarge)).toBe(0);
    expect(stub.calls).toBe(0);
    expect(noteContents(store)).toEqual([]);
    expect(tooLarge).toEqual([{ folder: big.folder, bytes: 1048577 }]);
    expect(statSync(big.file).size).toBe(1048577);
  });

  it('4: WHEN the file shrinks to `6` bytes after the first short read THEN the loop stops at EOF and restores the `6` bytes that remain', () => {
    const d = writeDraft('snote-shrink', 'c.md', 'abcdefghijklmnopqrstuvwxyz');
    stub.afterFirstCall = () => truncateSync(d.file, 6);
    const store = makeStore({ stubClient: {} });
    expect(recoverDrafts(store)).toBe(1);
    expect(noteContents(store)).toEqual(['abcdef']);
    expect(stub.calls).toBeLessThan(20);
  });
});
