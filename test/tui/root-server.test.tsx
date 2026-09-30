import { describe, it, expect, beforeEach, afterEach, vi, type Mock } from 'vitest';
import { render } from 'ink-testing-library';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import React from 'react';

import { Root } from '../../src/tui/Root';
import { makeStore } from '../../src/core/store';
import { loadToken, saveToken } from '../../src/core/token';
import type { Store } from 'redux';
import type { State } from '../../src/core/store';
import type { Auth } from '../../src/tui/Root';

const waitFor = async (fn: () => boolean | Promise<boolean>, ms = 1500) => {
  const end = Date.now() + ms;
  while (!(await fn()) && Date.now() < end) await new Promise((r) => setTimeout(r, 10));
};

const makeStoreForSpy = () =>
  vi.fn(
    (_auth: Auth, _onLogout: () => void) =>
      (makeStore({ stubClient: {} }) as Store<State>)
  );

describe('T289 saved sync token is only sent to the server it was issued for', () => {
  let dir: string;
  let requestCode: Mock;
  let completeLogin: Mock;
  let passwordLogin: Mock;

  beforeEach(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'snote-root-server-'));
    requestCode = vi.fn().mockResolvedValue(undefined);
    completeLogin = vi.fn().mockResolvedValue('tok2');
    passwordLogin = vi.fn().mockResolvedValue('tok9');
  });

  afterEach(() => {
    try {
      fs.rmSync(dir, { recursive: true, force: true });
    } catch {
      // ignore
    }
  });

  it("1: WHEN saveToken(dir, { email: 'a@b.co', token: 'realtok', server: 'ws://good.example' }) is called and <Root dataDir={dir} server=\"ws://evil.example\" makeStoreFor={spy} .../> renders and 50 ms pass THEN spy was never called and the frame contains `Email:`", async () => {
    await saveToken(dir, { email: 'a@b.co', token: 'realtok', server: 'ws://good.example' });
    const spy = makeStoreForSpy();
    const { lastFrame, unmount } = render(
      <Root
        dataDir={dir}
        server="ws://evil.example"
        width={80}
        height={24}
        makeStoreFor={spy}
        requestCode={requestCode}
        completeLogin={completeLogin}
        passwordLogin={passwordLogin}
      />
    );

    await new Promise((r) => setTimeout(r, 50));

    expect(spy).not.toHaveBeenCalled();
    expect(lastFrame()).toContain('Email:');

    unmount();
  });

  it("2: WHEN the same saved token (`server: 'ws://good.example'`) is used and <Root dataDir={dir} server=\"ws://good.example\" makeStoreFor={spy} .../> renders and 50 ms pass THEN spy was called once with `{ email: 'a@b.co', token: 'realtok', server: 'ws://good.example' }` as its first argument and the frame does not contain `Email:`", async () => {
    await saveToken(dir, { email: 'a@b.co', token: 'realtok', server: 'ws://good.example' });
    const spy = makeStoreForSpy();
    const { lastFrame, unmount } = render(
      <Root
        dataDir={dir}
        server="ws://good.example"
        width={80}
        height={24}
        makeStoreFor={spy}
        requestCode={requestCode}
        completeLogin={completeLogin}
        passwordLogin={passwordLogin}
      />
    );

    await new Promise((r) => setTimeout(r, 50));

    expect(spy).toHaveBeenCalledTimes(1);
    expect(spy.mock.calls[0][0]).toEqual({
      email: 'a@b.co',
      token: 'realtok',
      server: 'ws://good.example',
    });
    expect(lastFrame()).not.toContain('Email:');

    unmount();
  });

  it('3: WHEN a token saved with no `server` field (production) is used and <Root dataDir={dir} server={undefined} makeStoreFor={spy} .../> renders and 50 ms pass THEN spy was called once and the frame does not contain `Email:`', async () => {
    await saveToken(dir, { email: 'a@b.co', token: 'realtok' });
    const spy = makeStoreForSpy();
    const { lastFrame, unmount } = render(
      <Root
        dataDir={dir}
        server={undefined}
        width={80}
        height={24}
        makeStoreFor={spy}
        requestCode={requestCode}
        completeLogin={completeLogin}
        passwordLogin={passwordLogin}
      />
    );

    await new Promise((r) => setTimeout(r, 50));

    expect(spy).toHaveBeenCalledTimes(1);
    expect(lastFrame()).not.toContain('Email:');

    unmount();
  });

  it("4: WHEN `dir` is empty, <Root dataDir={dir} server=\"ws://new.example\" makeStoreFor={makeStoreFor} requestCode={requestCode} completeLogin={completeLogin} passwordLogin={passwordLogin} .../> renders (`passwordLogin` resolves `'tok9'`), and `a@b.co`, `\\t`, `hunter2secret`, `\\r` are written to stdin THEN await loadToken(dir) resolves `{ email: 'a@b.co', token: 'tok9', server: 'ws://new.example' }`", async () => {
    const makeStoreFor = vi.fn(
      (_auth: Auth, _onLogout: () => void) =>
        (makeStore({ stubClient: {} }) as Store<State>)
    );
    const { stdin, unmount } = render(
      <Root
        dataDir={dir}
        server="ws://new.example"
        width={80}
        height={24}
        makeStoreFor={makeStoreFor}
        requestCode={requestCode}
        completeLogin={completeLogin}
        passwordLogin={passwordLogin}
      />
    );

    await new Promise((r) => setTimeout(r, 50));

    stdin.write('a@b.co');
    await new Promise((r) => setTimeout(r, 50));
    stdin.write('\t');
    await new Promise((r) => setTimeout(r, 50));
    stdin.write('hunter2secret');
    await new Promise((r) => setTimeout(r, 50));
    stdin.write('\r');

    let saved: Awaited<ReturnType<typeof loadToken>> = null;
    await waitFor(async () => {
      saved = await loadToken(dir);
      return saved !== null;
    });

    expect(saved).toEqual({
      email: 'a@b.co',
      token: 'tok9',
      server: 'ws://new.example',
    });

    unmount();
  });
});
