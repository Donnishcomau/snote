import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render } from 'ink-testing-library';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import React from 'react';

import { Root } from '../../src/tui/Root';
import { waitForFrame, waitForInput } from '../helpers/ink-waits';
import { saveToken } from '../../src/core/token';
import { acquireInstanceLock } from '../../src/core/instance-lock';
import { blogStatusLine } from '../../src/core/blog-status';
import { hostileText } from '../fixtures/hostile';

const FORBIDDEN =
  /[\u0000-\u0008\u000b-\u001f\u007f-\u009f\u200b\u200c\u200e\u200f\u202a-\u202e\u2066-\u2069\u2028\u2029]/;
// Only SGR colour codes come out of a frame before the check.
const stripSgr = (s: string): string => s.replace(/\u001b\[[0-9;]*m/g, '');
const clean = (s: string): boolean => !FORBIDDEN.test(stripSgr(s)) && !s.includes('\u001b]');

describe('#413 Ink sinks: fails when lock-file, start-error or blog-sent text reaches a frame unsanitised', () => {
  let dir: string;

  beforeEach(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'snote-413-'));
  });
  afterEach(() => {
    fs.rmSync(dir, { recursive: true, force: true });
  });

  const rootProps = (makeStoreFor: () => never) => ({
    dataDir: dir,
    width: 200,
    height: 24,
    makeStoreFor,
    requestCode: vi.fn().mockResolvedValue(undefined),
    completeLogin: vi.fn().mockResolvedValue('tok2'),
    passwordLogin: vi.fn().mockResolvedValue('ptok'),
  });

  it('1: WHEN `instance.lock` in a temp dir holds `String(process.ppid)` followed by `hostileText(\'X\')` and acquireInstanceLock(dir) is called THEN it throws a message that contains `it holds the instance lock` and `(pid ` + String(process.ppid) + `)` (the pid followed at once by the closing bracket) and holds no FORBIDDEN character', () => {
    fs.writeFileSync(path.join(dir, 'instance.lock'), String(process.ppid) + hostileText('X'));
    let msg = '';
    try {
      acquireInstanceLock(dir);
    } catch (e) {
      msg = (e as Error).message;
    }
    expect(msg).toContain('it holds the instance lock');
    expect(msg).toContain('(pid ' + String(process.ppid) + ')');
    expect(FORBIDDEN.test(msg)).toBe(false);
  });

  it('2: WHEN Root renders (width 200, height 24) on a temp dir with a saved token for `a@b.co` and makeStoreFor throws `another snote is already using /d (pid 7) — it holds the instance lock` followed by `hostileText(\'L\')` THEN once the frame shows `already using /d` it holds no FORBIDDEN character and no `ESC ]`', async () => {
    await saveToken(dir, { email: 'a@b.co', token: 'tok' });
    const { lastFrame, unmount } = render(
      <Root
        {...rootProps(() => {
          throw new Error('another snote is already using /d (pid 7) — it holds the instance lock' + hostileText('L'));
        })}
      />,
    );
    await waitForFrame(lastFrame, (f) => f.includes('already using /d') && clean(f));
    expect(clean(lastFrame() ?? '')).toBe(true);
    unmount();
  });

  it('3: WHEN Root renders (width 200, height 24) on an empty temp dir, passwordLogin resolves `ptok`, makeStoreFor throws `boom` followed by `hostileText(\'E\')`, and `a@b.co`, Tab, `pw`, Enter are written THEN once the frame shows `Error: boom` it holds no FORBIDDEN character and no `ESC ]`', async () => {
    const { stdin, lastFrame, unmount } = render(
      <Root
        {...rootProps(() => {
          throw new Error('boom' + hostileText('E'));
        })}
      />,
    );
    await waitForInput(stdin);
    await waitForFrame(lastFrame, 'Email:');
    stdin.write('a@b.co');
    await waitForFrame(lastFrame, 'Email: a@b.co');
    stdin.write('\t');
    await waitForFrame(lastFrame, 'Password login for a@b.co');
    stdin.write('pw');
    await waitForFrame(lastFrame, 'Password: **');
    stdin.write('\r');
    await waitForFrame(lastFrame, (f) => f.includes('Error: boom') && clean(f));
    expect(clean(lastFrame() ?? '')).toBe(true);
    unmount();
  });

  it('4: WHEN blogStatusLine gets sentAt `\u202e\\x1b[2J\u200b2026-10-01T00:00:00.000Z` and url `https://x/p` THEN it returns exactly `Sent as draft · 2026-10-01 · https://x/p`', () => {
    expect(
      blogStatusLine({ sentAt: '\u202e\x1b[2J\u200b2026-10-01T00:00:00.000Z', url: 'https://x/p' }),
    ).toBe('Sent as draft · 2026-10-01 · https://x/p');
  });

  it('5: WHEN blogStatusLine gets sentAt `2026-09-28T00:00:00.000Z` and url `https://x/p`, and acquireInstanceLock is called on a temp dir whose `instance.lock` holds only `String(process.ppid)` THEN the line is `Sent as draft · 2026-09-28 · https://x/p` and the refusal contains `(pid ` + String(process.ppid) + `)`', () => {
    expect(blogStatusLine({ sentAt: '2026-09-28T00:00:00.000Z', url: 'https://x/p' })).toBe(
      'Sent as draft · 2026-09-28 · https://x/p',
    );
    fs.writeFileSync(path.join(dir, 'instance.lock'), String(process.ppid));
    let msg = '';
    try {
      acquireInstanceLock(dir);
    } catch (e) {
      msg = (e as Error).message;
    }
    expect(msg).toContain('(pid ' + String(process.ppid) + ')');
  });
});
