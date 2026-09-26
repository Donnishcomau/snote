import { describe, it, expect, vi } from 'vitest';
import { render } from 'ink-testing-library';
import React from 'react';
import { Login } from '../../src/tui/Login';

describe('T110 Login screen edge keys', () => {
  it("1: WHEN step code is reached, '987' then '\\r' were rejected by completeLogin with new Error('401 bad code'), '12' is typed and '\\u001b' is written THEN the frame contains 'Email: a@b.co' and none of 'Code:', 'Error:', '12'", async () => {
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

    // Type '987' and submit → reject
    stdin.write('987');
    await new Promise((r) => setTimeout(r, 50));
    stdin.write('\r');
    await new Promise((r) => setTimeout(r, 50));

    // Type '12'
    stdin.write('12');
    await new Promise((r) => setTimeout(r, 50));

    // Press Escape
    stdin.write('\u001b');
    await new Promise((r) => setTimeout(r, 50));

    const frame = lastFrame();
    expect(frame).toContain('Email: a@b.co');
    expect(frame).not.toContain('Code:');
    expect(frame).not.toContain('Error:');
    expect(frame).not.toContain('12');

    unmount();
  });

  it("2: WHEN after that Escape '\\r' is written again THEN requestCode was called 2 times, both with 'a@b.co', and the frame contains 'Code:' and not '12'", async () => {
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

    // Type '987' and submit → reject
    stdin.write('987');
    await new Promise((r) => setTimeout(r, 50));
    stdin.write('\r');
    await new Promise((r) => setTimeout(r, 50));

    // Type '12'
    stdin.write('12');
    await new Promise((r) => setTimeout(r, 50));

    // Press Escape → back to email
    stdin.write('\u001b');
    await new Promise((r) => setTimeout(r, 50));

    // Write Enter again → should trigger requestCode
    stdin.write('\r');
    await new Promise((r) => setTimeout(r, 50));

    const frame = lastFrame();
    expect(requestCode).toHaveBeenCalledTimes(2);
    expect(requestCode).toHaveBeenCalledWith('a@b.co');
    expect(frame).toContain('Code:');
    expect(frame).not.toContain('12');

    unmount();
  });

  it("3: WHEN 'ab' then '\\u001b' are written in step email THEN the frame contains 'Email: ab', requestCode was not called, and a following 'c' gives 'Email: abc'", async () => {
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

    // Type 'ab'
    stdin.write('ab');
    await new Promise((r) => setTimeout(r, 50));

    let frame = lastFrame();
    expect(frame).toContain('Email: ab');
    expect(requestCode).not.toHaveBeenCalled();

    // Press Escape in email step → does nothing
    stdin.write('\u001b');
    await new Promise((r) => setTimeout(r, 50));

    // Type 'c'
    stdin.write('c');
    await new Promise((r) => setTimeout(r, 50));

    frame = lastFrame();
    expect(frame).toContain('Email: abc');

    unmount();
  });

  it("4: WHEN '\\r' is written on the empty email field, and again after three spaces were typed THEN requestCode was not called and the frame contains 'Email:' and neither 'Code:' nor 'Error:'", async () => {
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

    // Enter on empty email
    stdin.write('\r');
    await new Promise((r) => setTimeout(r, 50));
    expect(requestCode).not.toHaveBeenCalled();

    // Type three spaces
    stdin.write('   ');
    await new Promise((r) => setTimeout(r, 50));

    // Enter again (all spaces = empty after trim)
    stdin.write('\r');
    await new Promise((r) => setTimeout(r, 50));

    expect(requestCode).not.toHaveBeenCalled();
    const frame = lastFrame();
    expect(frame).toContain('Email:');
    expect(frame).not.toContain('Code:');
    expect(frame).not.toContain('Error:');

    unmount();
  });

  it("5: WHEN step code is reached and '\\r' is written on the empty code field THEN completeLogin and onLoggedIn were not called and the frame contains 'Code:' and not 'Error:'", async () => {
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

    // Enter on empty code field
    stdin.write('\r');
    await new Promise((r) => setTimeout(r, 50));

    expect(completeLogin).not.toHaveBeenCalled();
    expect(onLoggedIn).not.toHaveBeenCalled();
    const frame = lastFrame();
    expect(frame).toContain('Code:');
    expect(frame).not.toContain('Error:');

    unmount();
  });

  it("6: WHEN 'ab', '\\x01', '\\t', then ' x@y.z ' with a space on both sides, then '\\r' are written THEN the frame contained 'Email: ab x@y.z' before Enter and requestCode was called once with 'ab x@y.z'", async () => {
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

    // Type 'ab'
    stdin.write('ab');
    await new Promise((r) => setTimeout(r, 50));

    // Ctrl+A → should be ignored
    stdin.write('\x01');
    await new Promise((r) => setTimeout(r, 50));

    // Tab → should be ignored
    stdin.write('\t');
    await new Promise((r) => setTimeout(r, 50));

    // Type ' x@y.z ' (spaces on both sides)
    stdin.write(' x@y.z ');
    await new Promise((r) => setTimeout(r, 50));

    let frame = lastFrame();
    expect(frame).toContain('Email: ab x@y.z');

    // Enter to submit
    stdin.write('\r');
    await new Promise((r) => setTimeout(r, 50));

    expect(requestCode).toHaveBeenCalledTimes(1);
    expect(requestCode).toHaveBeenCalledWith('ab x@y.z');

    unmount();
  });
});
