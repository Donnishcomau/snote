import { describe, it, expect, vi } from 'vitest';
import { render } from 'ink-testing-library';
import React from 'react';
import { Login } from '../../src/tui/Login';

describe('T70 Login screen: password instead of emailed code', () => {
  it('1: WHEN Login is rendered once with passwordLogin and once without it (then a@b.co and \\t written) THEN frame 1 contains Tab: log in with a password; frame 2 contains Email: a@b.co and neither that text nor Password:', async () => {
    const requestCode = vi.fn().mockResolvedValue(undefined);
    const completeLogin = vi.fn().mockResolvedValue('tok');
    const onLoggedIn = vi.fn();
    const passwordLogin = vi.fn().mockResolvedValue('tok');

    // Frame 1: with passwordLogin
    const { lastFrame: lastFrame1, unmount: unmount1 } = render(
      <Login
        width={80}
        height={24}
        requestCode={requestCode}
        completeLogin={completeLogin}
        onLoggedIn={onLoggedIn}
        passwordLogin={passwordLogin}
      />
    );

    await new Promise((r) => setTimeout(r, 50));
    let frame1 = lastFrame1();
    expect(frame1).toContain('Tab: log in with a password');

    // Write email and tab
    unmount1();

    // Frame 2: without passwordLogin
    const { lastFrame: lastFrame2, stdin: stdin2, unmount: unmount2 } = render(
      <Login
        width={80}
        height={24}
        requestCode={requestCode}
        completeLogin={completeLogin}
        onLoggedIn={onLoggedIn}
      />
    );

    await new Promise((r) => setTimeout(r, 50));
    stdin2.write('a@b.co');
    await new Promise((r) => setTimeout(r, 50));
    stdin2.write('\t');
    await new Promise((r) => setTimeout(r, 50));
    const frame2 = lastFrame2();
    expect(frame2).toContain('Email: a@b.co');
    expect(frame2).not.toContain('Tab: log in with a password');
    expect(frame2).not.toContain('Password:');

    unmount2();
  });

  it('2: WHEN the password step is reached THEN the frame contains Password login for a@b.co and Password: and no *, and requestCode was not called', async () => {
    const requestCode = vi.fn().mockResolvedValue(undefined);
    const completeLogin = vi.fn().mockResolvedValue('tok');
    const onLoggedIn = vi.fn();
    const passwordLogin = vi.fn().mockResolvedValue('tok');

    const { stdin, lastFrame, unmount } = render(
      <Login
        width={80}
        height={24}
        requestCode={requestCode}
        completeLogin={completeLogin}
        onLoggedIn={onLoggedIn}
        passwordLogin={passwordLogin}
      />
    );

    await new Promise((r) => setTimeout(r, 50));

    // Reach password step: type email, then tab
    stdin.write('a@b.co');
    await new Promise((r) => setTimeout(r, 50));
    stdin.write('\t');
    await new Promise((r) => setTimeout(r, 50));

    const frame = lastFrame();
    expect(frame).toContain('Password login for a@b.co');
    expect(frame).toContain('Password:');
    expect(frame).not.toContain('*');
    expect(requestCode).not.toHaveBeenCalled();

    unmount();
  });

  it('3: WHEN the password step is reached and s3cretX then \\x7f are written THEN the frame contains Password: ******, does not contain ******* and does not contain s3cret', async () => {
    const requestCode = vi.fn().mockResolvedValue(undefined);
    const completeLogin = vi.fn().mockResolvedValue('tok');
    const onLoggedIn = vi.fn();
    const passwordLogin = vi.fn().mockResolvedValue('tok');

    const { stdin, lastFrame, unmount } = render(
      <Login
        width={80}
        height={24}
        requestCode={requestCode}
        completeLogin={completeLogin}
        onLoggedIn={onLoggedIn}
        passwordLogin={passwordLogin}
      />
    );

    await new Promise((r) => setTimeout(r, 50));

    // Reach password step
    stdin.write('a@b.co');
    await new Promise((r) => setTimeout(r, 50));
    stdin.write('\t');
    await new Promise((r) => setTimeout(r, 50));

    // Type password
    stdin.write('s3cretX');
    await new Promise((r) => setTimeout(r, 50));
    // Backspace removes one char → 6 chars
    stdin.write('\x7f');
    await new Promise((r) => setTimeout(r, 50));

    const frame = lastFrame();
    expect(frame).toContain('Password: ******');
    expect(frame).not.toContain('*******');
    expect(frame).not.toContain('s3cret');

    unmount();
  });

  it('4: WHEN the password step is reached, s3cret, one space and \\r are written and passwordLogin resolves tok THEN it was called once with a@b.co and the 7 characters s3cret plus space, and onLoggedIn once with email a@b.co, token tok', async () => {
    const requestCode = vi.fn().mockResolvedValue(undefined);
    const completeLogin = vi.fn().mockResolvedValue('tok');
    const onLoggedIn = vi.fn();
    const passwordLogin = vi.fn().mockResolvedValue('tok');

    const { stdin, lastFrame, unmount } = render(
      <Login
        width={80}
        height={24}
        requestCode={requestCode}
        completeLogin={completeLogin}
        onLoggedIn={onLoggedIn}
        passwordLogin={passwordLogin}
      />
    );

    await new Promise((r) => setTimeout(r, 50));

    // Reach password step
    stdin.write('a@b.co');
    await new Promise((r) => setTimeout(r, 50));
    stdin.write('\t');
    await new Promise((r) => setTimeout(r, 50));

    // Type password + space + Enter
    stdin.write('s3cret');
    await new Promise((r) => setTimeout(r, 50));
    stdin.write(' ');
    await new Promise((r) => setTimeout(r, 50));
    stdin.write('\r');
    await new Promise((r) => setTimeout(r, 50));

    expect(passwordLogin).toHaveBeenCalledTimes(1);
    expect(passwordLogin).toHaveBeenCalledWith('a@b.co', 's3cret ');
    expect(onLoggedIn).toHaveBeenCalledTimes(1);
    expect(onLoggedIn).toHaveBeenCalledWith({
      email: 'a@b.co',
      token: 'tok',
    });

    unmount();
  });

  it('5: WHEN passwordLogin rejects s3cret with new Error(401 invalid login) and then \\u001b is written THEN first the frame has Error: 401 invalid login, Password: and no *; after Escape it has Email: a@b.co and neither Password: nor Error:', async () => {
    const requestCode = vi.fn().mockResolvedValue(undefined);
    const completeLogin = vi.fn().mockResolvedValue('tok');
    const onLoggedIn = vi.fn();
    const passwordLogin = vi.fn().mockRejectedValue(new Error('401 invalid login'));

    const { stdin, lastFrame, unmount } = render(
      <Login
        width={80}
        height={24}
        requestCode={requestCode}
        completeLogin={completeLogin}
        onLoggedIn={onLoggedIn}
        passwordLogin={passwordLogin}
      />
    );

    await new Promise((r) => setTimeout(r, 50));

    // Reach password step
    stdin.write('a@b.co');
    await new Promise((r) => setTimeout(r, 50));
    stdin.write('\t');
    await new Promise((r) => setTimeout(r, 50));

    // Type password + Enter → reject
    stdin.write('s3cret');
    await new Promise((r) => setTimeout(r, 50));
    stdin.write('\r');
    await new Promise((r) => setTimeout(r, 50));

    let frame = lastFrame();
    expect(frame).toContain('Error: 401 invalid login');
    expect(frame).toContain('Password:');
    expect(frame).not.toContain('*');

    // Escape → back to email
    stdin.write('\u001b');
    await new Promise((r) => setTimeout(r, 50));

    frame = lastFrame();
    expect(frame).toContain('Email: a@b.co');
    expect(frame).not.toContain('Password:');
    expect(frame).not.toContain('Error:');

    unmount();
  });

  it('6: WHEN with passwordLogin passed \\t is written on the empty email, and in a reached password step \\r on the empty password THEN the first frame has no Password:, passwordLogin was never called and the second frame has no Error:', async () => {
    const requestCode = vi.fn().mockResolvedValue(undefined);
    const completeLogin = vi.fn().mockResolvedValue('tok');
    const onLoggedIn = vi.fn();
    const passwordLogin = vi.fn().mockResolvedValue('tok');

    const { stdin, lastFrame, unmount } = render(
      <Login
        width={80}
        height={24}
        requestCode={requestCode}
        completeLogin={completeLogin}
        onLoggedIn={onLoggedIn}
        passwordLogin={passwordLogin}
      />
    );

    await new Promise((r) => setTimeout(r, 50));

    // Tab on empty email → should NOT go to password step
    stdin.write('\t');
    await new Promise((r) => setTimeout(r, 50));

    let frame = lastFrame();
    expect(frame).not.toContain('Password:');
    expect(passwordLogin).not.toHaveBeenCalled();

    // Now manually reach password step by typing email then tab
    stdin.write('a@b.co');
    await new Promise((r) => setTimeout(r, 50));
    stdin.write('\t');
    await new Promise((r) => setTimeout(r, 50));

    // Enter on empty password → should do nothing, no error
    stdin.write('\r');
    await new Promise((r) => setTimeout(r, 50));

    frame = lastFrame();
    expect(frame).not.toContain('Error:');

    unmount();
  });
});
