/**
 * T491: the login screen shows where to create a Simplenote account.
 * On the email step only, one muted line points new users at the signup URL.
 */
import { describe, it, expect, vi } from 'vitest';
import { render } from 'ink-testing-library';
import React from 'react';

import { Login } from '../../src/tui/Login';
import { waitForFrame, waitForInput } from '../helpers/ink-waits';

const SIGNUP_LINE = 'No account? Sign up at https://app.simplenote.com/signup/';

const renderLogin = (width: number, height: number) =>
  render(
    <Login
      width={width}
      height={height}
      requestCode={vi.fn().mockResolvedValue(undefined)}
      completeLogin={vi.fn()}
      onLoggedIn={vi.fn()}
      passwordLogin={vi.fn()}
    />,
  );

describe('login-signup line', () => {
  it("1: WHEN <Login width={80} height={24} ... /> is rendered THEN the frame contains `No account? Sign up at https://app.simplenote.com/signup/`", async () => {
    const { lastFrame, stdin, unmount } = renderLogin(80, 24);
    await waitForInput(stdin);

    const frame = await waitForFrame(lastFrame, SIGNUP_LINE);
    expect(frame).toContain('No account? Sign up at https://app.simplenote.com/signup/');

    unmount();
  });

  it("2: WHEN `a@b.co` and Enter are written (the code step) THEN the frame does not contain `app.simplenote.com/signup`", async () => {
    const { lastFrame, stdin, unmount } = renderLogin(80, 24);
    await waitForInput(stdin);

    stdin.write('a@b.co');
    await waitForFrame(lastFrame, 'a@b.co');

    stdin.write('\r');
    const frame = await waitForFrame(lastFrame, 'Code sent to a@b.co');
    expect(frame).not.toContain('app.simplenote.com/signup');

    unmount();
  });

  it("3: WHEN Tab is written on the email step (the password step) THEN the frame does not contain `app.simplenote.com/signup`", async () => {
    const { lastFrame, stdin, unmount } = renderLogin(80, 24);
    await waitForInput(stdin);

    // Tab only switches to the password step once an email is entered.
    stdin.write('a@b.co');
    await waitForFrame(lastFrame, 'Email: a@b.co');

    stdin.write('\t');
    const frame = await waitForFrame(lastFrame, 'Password login for a@b.co');
    expect(frame).not.toContain('app.simplenote.com/signup');

    unmount();
  });

  it('4: WHEN rendered at width 40 THEN no line of the frame is longer than 40 characters', async () => {
    const { lastFrame, stdin, unmount } = renderLogin(40, 24);
    await waitForInput(stdin);

    await waitForFrame(
      lastFrame,
      (frame) => frame.includes('Tab: log in with a password') && frame.includes('Simplenote login'),
    );
    const frame = lastFrame() ?? '';
    const lines = frame.split('\n');
    expect(lines.length).toBeGreaterThan(1);
    for (const line of lines) {
      expect(line.length).toBeLessThanOrEqual(40);
    }

    unmount();
  });
});
