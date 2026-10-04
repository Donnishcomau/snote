import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { describe, it, expect, beforeEach, afterEach } from 'vitest';

import { makeStore } from '../../src/core/store';
import { buildStatus, writeStatusFile } from '../../src/core/status-file';
import type { Status } from '../../src/core/status-file';

import type { EntityId } from '@vendor/types';

// Helper to create branded types for testing
const eid = (id: string): EntityId => id as unknown as EntityId;

const seed = (
  entries: { id: string; content: string; modified: number; deleted?: boolean }[]
) => {
  const store = makeStore({ stubClient: {} });
  for (const e of entries) {
    store.dispatch({
      type: 'CREATE_NOTE_WITH_ID',
      noteId: eid(e.id),
      note: {
        content: e.content,
        deleted: e.deleted ?? false,
        modificationDate: e.modified,
        creationDate: e.modified - 1,
        systemTags: [],
        tags: [],
      },
    } as never);
  }
  return store.getState();
};

describe('status-file', () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'snote-status-'));
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it("1: WHEN buildStatus runs on live notes `Groceries` (modified 3000), `Beta` (2000), `Alpha` (1000) and deleted `Gone` (9000) THEN count is 3, last is { title: 'Groceries', modified: 3000 }, synced null", () => {
    const state = seed([
      { id: 'n-groceries', content: 'Groceries', modified: 3000 },
      { id: 'n-beta', content: 'Beta', modified: 2000 },
      { id: 'n-alpha', content: 'Alpha', modified: 1000 },
      { id: 'n-gone', content: 'Gone', modified: 9000, deleted: true },
    ]);

    const status = buildStatus(state, null);

    expect(status.count).toBe(3);
    expect(status.last).toEqual({ title: 'Groceries', modified: 3000 });
    expect(status.synced).toBe(null);
  });

  it("2: WHEN the newest live note's content is `Gro\\u001b[31mc\\u0007eries\\nbody` THEN last.title is `Groceries`", () => {
    const state = seed([
      { id: 'n-new', content: 'Gro\u001b[31mc\u0007eries\nbody', modified: 5000 },
      { id: 'n-old', content: 'Older', modified: 1000 },
    ]);

    const status = buildStatus(state, null);

    expect(status.last!.title).toBe('Groceries');
  });

  it("3: WHEN the newest live note's content is 100 times `x` THEN last.title is 39 `x` followed by `…` (length `40`)", () => {
    const state = seed([{ id: 'n-long', content: 'x'.repeat(100), modified: 5000 }]);

    const status = buildStatus(state, null);

    expect(status.last!.title).toBe('x'.repeat(39) + '…');
    expect(status.last!.title.length).toBe(40);
  });

  it("4: WHEN buildStatus runs on an empty store and on a store holding only a deleted note THEN both return count 0 and last null", () => {
    const empty = buildStatus(seed([]), null);
    const onlyDeleted = buildStatus(
      seed([{ id: 'n-gone', content: 'Gone', modified: 9000, deleted: true }]),
      null
    );

    expect(empty.count).toBe(0);
    expect(empty.last).toBe(null);
    expect(onlyDeleted.count).toBe(0);
    expect(onlyDeleted.last).toBe(null);
  });

  it("5: WHEN writeStatusFile writes into a new nested directory, and again over a status.json that had mode 0644 THEN the file has mode 0o600, parses back to the status, and the directory holds only status.json", () => {
    const status: Status = {
      version: 1,
      count: 2,
      last: { title: 'Groceries', modified: 3000 },
      synced: '2026-10-04T12:00:00.000Z',
    };

    // first write: a directory that does not exist yet
    const nested = path.join(tmpDir, 'snote', 'widget');
    writeStatusFile(nested, status);

    const nestedFile = path.join(nested, 'status.json');
    expect(fs.statSync(nestedFile).mode & 0o777).toBe(0o600);
    expect(JSON.parse(fs.readFileSync(nestedFile, 'utf8'))).toEqual(status);
    expect(fs.readdirSync(nested)).toEqual(['status.json']);

    // second write: over an existing file that had mode 0644
    fs.chmodSync(nestedFile, 0o644);
    expect(fs.statSync(nestedFile).mode & 0o777).toBe(0o644);

    writeStatusFile(nested, status);

    expect(fs.statSync(nestedFile).mode & 0o777).toBe(0o600);
    expect(JSON.parse(fs.readFileSync(nestedFile, 'utf8'))).toEqual(status);
    expect(fs.readdirSync(nested)).toEqual(['status.json']);
  });

  it("6: WHEN the written file is parsed THEN its keys sorted equal ['count', 'last', 'synced', 'version'] and the raw text does not contain `token`", () => {
    const status: Status = {
      version: 1,
      count: 1,
      last: { title: 'Groceries', modified: 3000 },
      synced: '2026-10-04T12:00:00.000Z',
    };

    writeStatusFile(tmpDir, status);

    const raw = fs.readFileSync(path.join(tmpDir, 'status.json'), 'utf8');
    expect(Object.keys(JSON.parse(raw)).sort()).toEqual([
      'count',
      'last',
      'synced',
      'version',
    ]);
    expect(raw).not.toContain('token');
  });
});
