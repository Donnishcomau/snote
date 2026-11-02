// #294: direct proofs for two R7 comment claims that no other test reaches:
// TagEditor draws the rest of a server-supplied suggestion sanitised, and
// recordAccountId leaves account.json at mode 0600 whatever the umask or
// the mode of an older file.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render } from 'ink-testing-library';
import React from 'react';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';

import { recordAccountId } from '../../src/core/account-id';
import { TagEditor } from '../../src/tui/TagEditor';
import { waitForFrame, waitForInput } from '../helpers/ink-waits';

let prevUmask = 0;
let dir = '';

beforeEach(() => {
  prevUmask = process.umask(0o022);
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'snote-r7-294-'));
});

afterEach(() => {
  process.umask(prevUmask);
  fs.rmSync(dir, { recursive: true, force: true });
});

describe('R7 claims proved directly (#294)', () => {
  it('9: WHEN `TagEditor` renders with `tags=[]`, `allTags=[\'a\\x1b[45mbc‮d\']` and `a` is typed THEN the frame contains `tags: + abcd`, contains neither `\\x1b[45m` nor `‮`, and a following `\\r` calls `onAdd` once with the raw `a` (the suggestion is only drawn, never added)', async () => {
    const onAdd = vi.fn();
    const { stdin, lastFrame } = render(
      React.createElement(TagEditor, { tags: [], allTags: ['a\x1b[45mbc‮d'], onAdd, onRemove: vi.fn(), onClose: vi.fn() }),
    );
    await waitForInput(stdin);
    stdin.write('a');
    await waitForFrame(
      lastFrame,
      (f) => f.includes('tags: + abcd') && !f.includes('\x1b[45m') && !f.includes('‮'),
    );
    stdin.write('\r');
    await vi.waitFor(
      () => {
        expect(onAdd).toHaveBeenCalledTimes(1);
        expect(onAdd).toHaveBeenCalledWith('a');
      },
      { timeout: 2000, interval: 10 },
    );
  });

  it('10: WHEN `recordAccountId` runs under umask `022` on a new empty folder THEN `account.json` is a regular file with mode `0o600` and parses to `{"v":1,"email":"a@b.co","server":"default"}`', () => {
    recordAccountId(dir, 'a@b.co');
    const p = path.join(dir, 'account.json');
    const st = fs.lstatSync(p);
    expect(st.isFile()).toBe(true);
    expect(st.mode & 0o777).toBe(0o600);
    expect(JSON.parse(fs.readFileSync(p, 'utf8'))).toEqual({ v: 1, email: 'a@b.co', server: 'default' });
  });

  it('11: WHEN `recordAccountId` runs under umask `022` on a folder whose `account.json` is a regular file of mode `0o644` holding `not json` THEN `account.json` afterwards has mode `0o600` and parses to the email `a@b.co`, and the folder holds no `account.json.tmp`', () => {
    const p = path.join(dir, 'account.json');
    fs.writeFileSync(p, 'not json', { mode: 0o644 });
    fs.chmodSync(p, 0o644);
    expect(fs.statSync(p).mode & 0o777).toBe(0o644);
    recordAccountId(dir, 'a@b.co');
    const st = fs.lstatSync(p);
    expect(st.isFile()).toBe(true);
    expect(st.mode & 0o777).toBe(0o600);
    expect((JSON.parse(fs.readFileSync(p, 'utf8')) as { email: string }).email).toBe('a@b.co');
    expect(fs.existsSync(path.join(dir, 'account.json.tmp'))).toBe(false);
  });
});
