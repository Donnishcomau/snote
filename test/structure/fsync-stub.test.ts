/**
 * #656: test/setup.ts replaces fs.fsyncSync with a counted no-op in every test process (a slow disk flush blocked the
 * event loop for seconds and timed out the fake-server tests). This pins that the stub is in force for both import forms,
 * and that src/core/secure-fs.ts still fsyncs every file it writes (nothing else pins that call).
 */
import fs, { fsyncSync } from 'node:fs';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { secureWriteFileSync } from '../../src/core/secure-fs';

type Stub = { calls: number; snoteFsyncStub?: true };
const dirs: string[] = [];
afterEach(() => { for (const d of dirs.splice(0)) rmSync(d, { recursive: true, force: true }); });

describe('#656 fsync is a counted no-op in tests, and secure-fs still calls it', () => {
  it('1: WHEN a test file runs THEN fs.fsyncSync and the named fsyncSync import are the test/setup.ts stub', () => {
    expect({ def: (fs.fsyncSync as unknown as Stub).snoteFsyncStub, named: (fsyncSync as unknown as Stub).snoteFsyncStub }).toEqual({ def: true, named: true });
  });

  it('2: WHEN secureWriteFileSync writes a file THEN the stub counts exactly 1 call and the file holds the data', () => {
    const d = mkdtempSync(join(tmpdir(), 'snote-fsync-stub-'));
    dirs.push(d);
    const before = (fs.fsyncSync as unknown as Stub).calls;
    secureWriteFileSync(join(d, 'a.json'), '{"a":1}');
    expect({ calls: (fs.fsyncSync as unknown as Stub).calls - before, data: readFileSync(join(d, 'a.json'), 'utf8') }).toEqual({ calls: 1, data: '{"a":1}' });
  });
});
