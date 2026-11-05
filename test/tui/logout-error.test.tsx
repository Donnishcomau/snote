/**
 * #635: a logout that fails part way (here: the account folder's state.json
 * cannot be removed, EACCES) is shown on the login screen as
 * `could not log out: EACCES`; it never becomes an unhandled rejection, which
 * main.tsx turns into a crash.
 */
import { afterEach, beforeEach, describe, expect, it, vi, type Mock } from 'vitest';
import { render } from 'ink-testing-library';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import React from 'react';

import { saveToken, loadToken } from '../../src/core/token';
import { Root, type Auth } from '../../src/tui/Root';
import { makeStore } from '../../src/core/store';
import { waitForInput, waitForFrame } from '../helpers/ink-waits';
import type { Store } from 'redux';
import type { State } from '../../src/core/store';

const STUCK = path.join('a@b.co', 'state.json');

vi.mock('../../src/core/secure-fs', async (importOriginal) => {
  const real = await importOriginal<typeof import('../../src/core/secure-fs')>();
  return {
    ...real,
    secureUnlink: (p: string): void => {
      if (p.endsWith(STUCK)) throw Object.assign(new Error(`EACCES: permission denied, unlink '${p}'`), { code: 'EACCES' });
      real.secureUnlink(p);
    },
  };
});

describe('#635 a failed logout is shown, not an unhandled rejection', () => {
  let tmp: string;
  let dir: string;
  let onLogout: (() => void) | null;
  let makeStoreFor: Mock;
  const rejections: unknown[] = [];
  const onRejection = (r: unknown): void => {
    rejections.push(r);
  };

  beforeEach(async () => {
    tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'snote-635-'));
    dir = path.join(tmp, 'data');
    fs.mkdirSync(path.join(dir, 'a@b.co'), { recursive: true });
    fs.writeFileSync(path.join(dir, STUCK), '{}');
    await saveToken(dir, { email: 'a@b.co', token: 'tok' });
    onLogout = null;
    makeStoreFor = vi.fn((_auth: Auth, cb: () => void) => {
      onLogout = cb;
      const s = makeStore({ stubClient: {} });
      s.dispatch({ type: 'CREATE_NOTE_WITH_ID', noteId: 'n1' as never, note: { content: 'Root note', systemTags: [], tags: [] } });
      return s as Store<State>;
    });
    rejections.length = 0;
    process.on('unhandledRejection', onRejection);
  });

  afterEach(() => {
    process.off('unhandledRejection', onRejection);
    fs.rmSync(tmp, { recursive: true, force: true });
  });

  const show = () =>
    render(
      <Root dataDir={dir} width={80} height={24} makeStoreFor={makeStoreFor} requestCode={vi.fn().mockResolvedValue(undefined)} completeLogin={vi.fn().mockResolvedValue('tok2')} />
    );

  it('1: WHEN the user logs out (L then y) and the account folder\'s state.json cannot be removed (EACCES) THEN the login screen shows `Error: could not log out: EACCES`, loadToken(dir) is null and no unhandled rejection was seen', async () => {
    const { stdin, lastFrame, unmount } = show();
    await waitForInput(stdin);
    await waitForFrame(lastFrame, 'Root note');
    stdin.write('L');
    await waitForFrame(lastFrame, 'log out and delete local data?');
    stdin.write('y');
    const frame = await waitForFrame(lastFrame, (f) => f.includes('Email:') && f.includes('Error: could not log out: EACCES'));
    expect(frame).toContain('Error: could not log out: EACCES');
    expect(await loadToken(dir)).toBeNull();
    expect(rejections).toEqual([]);
    unmount();
  });

  it('2: WHEN the server forces a sign-out (the store\'s logout callback, not the user\'s), nothing is kept and the full logout fails the same way THEN the login screen shows `could not log out: EACCES` and no unhandled rejection was seen', async () => {
    const { stdin, lastFrame, unmount } = show();
    await waitForInput(stdin);
    await waitForFrame(lastFrame, 'Root note');
    expect(onLogout).not.toBeNull();
    onLogout!();
    const frame = await waitForFrame(lastFrame, (f) => f.includes('Email:') && f.includes('could not log out: EACCES'));
    expect(frame).toContain('could not log out: EACCES');
    expect(rejections).toEqual([]);
    unmount();
  });
});
