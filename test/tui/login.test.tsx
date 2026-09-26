import { describe, it, expect, vi } from 'vitest';
import { render } from 'ink-testing-library';
import React from 'react';
import { Login } from '../../src/tui/Login';

describe('T30 Login screen', () => {
  it("1: WHEN the component is rendered THEN the frame contains 'Simplenote login' and 'Email:', contains neither 'Code:' nor 'Error:', and none of the three mocks was called", async () => {
    const requestCode = vi.fn().mockResolvedValue(undefined);
    const completeLogin = vi.fn().mockResolvedValue('tok');
    const onLoggedIn = vi.fn();

    const { lastFrame, unmount } = render(
      <Login
        width={80}
        height={24}
        requestCode={requestCode}
        completeLogin={completeLogin}
        onLoggedIn={onLoggedIn}
      />
    );

    await new Promise((r) => setTimeout(r, 50));

    const frame = lastFrame();
    expect(frame).toContain('Simplenote login');
    expect(frame).toContain('Email:');
    expect(frame).not.toContain('Code:');
    expect(frame).not.toContain('Error:');
    expect(requestCode).not.toHaveBeenCalled();
    expect(completeLogin).not.toHaveBeenCalled();
    expect(onLoggedIn).not.toHaveBeenCalled();

    unmount();
  });

  it("2: WHEN 'a@b.co' then '\\r' are written and requestCode resolves THEN requestCode was called once with 'a@b.co', the frame contains 'Code sent to a@b.co' and 'Code:', and completeLogin was not called", async () => {
    const requestCode = vi.fn().mockResolvedValue(undefined);
    const completeLogin = vi.fn().mockResolvedValue('tok');
    const onLoggedIn = vi.fn();

    const { stdin, lastFrame, unmount } = render(
      <Login
        width={80}
        height={24}
        requestCode={requestCode}
        completeLogin={completeLogin}
        onLoggedIn={onLoggedIn}
      />
    );

    await new Promise((r) => setTimeout(r, 50));

    stdin.write('a@b.co');
    await new Promise((r) => setTimeout(r, 50));
    stdin.write('\r');
    await new Promise((r) => setTimeout(r, 50));

    const frame = lastFrame();
    expect(requestCode).toHaveBeenCalledTimes(1);
    expect(requestCode).toHaveBeenCalledWith('a@b.co');
    expect(frame).toContain('Code sent to a@b.co');
    expect(frame).toContain('Code:');
    expect(completeLogin).not.toHaveBeenCalled();

    unmount();
  });

  it("3: WHEN requestCode rejects once with new Error('HTTP 500 boom') and '\\r' is written twice after 'a@b.co' THEN after the first the frame has 'Error: HTTP 500 boom' and 'Email: a@b.co' and no 'Code:'; after the second it has 'Code:' and no 'Error:'", async () => {
    const requestCode = vi
      .fn()
      .mockRejectedValueOnce(new Error('HTTP 500 boom'))
      .mockResolvedValue(undefined);
    const completeLogin = vi.fn().mockResolvedValue('tok');
    const onLoggedIn = vi.fn();

    const { stdin, lastFrame, unmount } = render(
      <Login
        width={80}
        height={24}
        requestCode={requestCode}
        completeLogin={completeLogin}
        onLoggedIn={onLoggedIn}
      />
    );

    await new Promise((r) => setTimeout(r, 50));

    // Write email
    stdin.write('a@b.co');
    await new Promise((r) => setTimeout(r, 50));

    // First Enter → requestCode rejects
    stdin.write('\r');
    await new Promise((r) => setTimeout(r, 50));
    let frame = lastFrame();
    expect(frame).toContain('Error: HTTP 500 boom');
    expect(frame).toContain('Email: a@b.co');
    expect(frame).not.toContain('Code:');

    // Second Enter → requestCode resolves (second call)
    stdin.write('\r');
    await new Promise((r) => setTimeout(r, 50));
    frame = lastFrame();
    expect(frame).toContain('Code:');
    expect(frame).not.toContain('Error:');

    unmount();
  });

  it("4: WHEN step code is reached, 'ABC123' then '\\r' are written and completeLogin resolves 'tok' THEN completeLogin was called once with 'a@b.co' and 'ABC123', and onLoggedIn once with email 'a@b.co' and token 'tok'", async () => {
    const requestCode = vi.fn().mockResolvedValue(undefined);
    const completeLogin = vi.fn().mockResolvedValue('tok');
    const onLoggedIn = vi.fn();

    const { stdin, lastFrame, unmount } = render(
      <Login
        width={80}
        height={24}
        requestCode={requestCode}
        completeLogin={completeLogin}
        onLoggedIn={onLoggedIn}
      />
    );

    await new Promise((r) => setTimeout(r, 50));

    // Reach code step
    stdin.write('a@b.co');
    await new Promise((r) => setTimeout(r, 50));
    stdin.write('\r');
    await new Promise((r) => setTimeout(r, 50));

    // Type code and submit
    stdin.write('ABC123');
    await new Promise((r) => setTimeout(r, 50));
    stdin.write('\r');
    await new Promise((r) => setTimeout(r, 50));

    expect(completeLogin).toHaveBeenCalledTimes(1);
    expect(completeLogin).toHaveBeenCalledWith('a@b.co', 'ABC123');
    expect(onLoggedIn).toHaveBeenCalledTimes(1);
    expect(onLoggedIn).toHaveBeenCalledWith({
      email: 'a@b.co',
      token: 'tok',
    });

    unmount();
  });

  it("5: WHEN step code is reached, 'ABC123' then '\\r' are written and completeLogin rejects with new Error('401 bad code') THEN the frame contains 'Error: 401 bad code' and 'Code:', does not contain 'ABC123', and onLoggedIn was not called", async () => {
    const requestCode = vi.fn().mockResolvedValue(undefined);
    const completeLogin = vi.fn().mockRejectedValue(new Error('401 bad code'));
    const onLoggedIn = vi.fn();

    const { stdin, lastFrame, unmount } = render(
      <Login
        width={80}
        height={24}
        requestCode={requestCode}
        completeLogin={completeLogin}
        onLoggedIn={onLoggedIn}
      />
    );

    await new Promise((r) => setTimeout(r, 50));

    // Reach code step
    stdin.write('a@b.co');
    await new Promise((r) => setTimeout(r, 50));
    stdin.write('\r');
    await new Promise((r) => setTimeout(r, 50));

    // Type code and submit
    stdin.write('ABC123');
    await new Promise((r) => setTimeout(r, 50));
    stdin.write('\r');
    await new Promise((r) => setTimeout(r, 50));

    const frame = lastFrame();
    expect(frame).toContain('Error: 401 bad code');
    expect(frame).toContain('Code:');
    expect(frame).not.toContain('ABC123');
    expect(onLoggedIn).not.toHaveBeenCalled();

    unmount();
  });

  it("6: WHEN 'abc' then '\\x7f' four times are written in step email (one write each) THEN after the first the frame contains 'Email: ab' and not 'Email: abc'; after the fourth it contains 'Email:' and not 'Email: a'", async () => {
    const requestCode = vi.fn().mockResolvedValue(undefined);
    const completeLogin = vi.fn().mockResolvedValue('tok');
    const onLoggedIn = vi.fn();

    const { stdin, lastFrame, unmount } = render(
      <Login
        width={80}
        height={24}
        requestCode={requestCode}
        completeLogin={completeLogin}
        onLoggedIn={onLoggedIn}
      />
    );

    await new Promise((r) => setTimeout(r, 50));

    // Write 'abc'
    stdin.write('abc');
    await new Promise((r) => setTimeout(r, 50));

    // After first backspace → 'ab'
    stdin.write('\x7f');
    await new Promise((r) => setTimeout(r, 50));
    let frame = lastFrame();
    expect(frame).toContain('Email: ab');
    expect(frame).not.toContain('Email: abc');

    // After second backspace → 'a'
    stdin.write('\x7f');
    await new Promise((r) => setTimeout(r, 50));

    // After third backspace → ''
    stdin.write('\x7f');
    await new Promise((r) => setTimeout(r, 50));

    // After fourth backspace → '' (no 'a')
    stdin.write('\x7f');
    await new Promise((r) => setTimeout(r, 50));
    frame = lastFrame();
    expect(frame).toContain('Email:');
    expect(frame).not.toContain('Email: a');

    unmount();
  });
});
