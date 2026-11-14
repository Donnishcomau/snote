/**
 * #600: the sign-up link is the one OSC 8 hyperlink snote writes. The output
 * guard keeps exactly its two sequences, only whole and not in plain output;
 * every other OSC 8 is still dropped. #603: the Skryf token prompt names where
 * to register.
 */
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render } from 'ink-testing-library';
import React from 'react';

import { SIGNUP_URL, SIGNUP_LINK, signupLink } from '../../src/core/hyperlink';
import { stripUnsafeOutput, setPlainOutput } from '../../src/core/output-guard';
import { sanitizeForTerminal } from '../../src/core/sanitize';
import { Login } from '../../src/tui/Login';
import { BlogSendDialog } from '../../src/tui/blog-send-dialog';
import { DEFAULT_BLOG_ORIGIN } from '../../src/core/blog-origin';
import { waitForFrame, waitForInput } from '../helpers/ink-waits';

const LINK = '\x1b]8;;https://app.simplenote.com/signup/\x1b\\https://app.simplenote.com/signup/\x1b]8;;\x1b\\';
const savedTTY = process.stdout.isTTY;
afterEach(() => {
  setPlainOutput(false);
  process.stdout.isTTY = savedTTY;
});

const login = () =>
  render(<Login width={80} height={24} requestCode={vi.fn().mockResolvedValue(undefined)} completeLogin={vi.fn()} onLoggedIn={vi.fn()} passwordLogin={vi.fn()} />);

describe('#600 the sign-up link (OSC 8)', () => {
  it('1: WHEN signupLink(true) and signupLink(false) are built THEN the first is exactly the OSC 8 link to and showing https://app.simplenote.com/signup/ and the second is the plain URL', () => {
    expect(SIGNUP_URL).toBe('https://app.simplenote.com/signup/');
    expect(signupLink(true)).toBe(LINK);
    expect(signupLink(false)).toBe('https://app.simplenote.com/signup/');
  });

  it('2: WHEN the output guard filters `a` + the link + `b` THEN it keeps every byte; WHEN plain output is on THEN it keeps only `a`, the URL and `b`', () => {
    expect(stripUnsafeOutput('a' + LINK + 'b')).toBe('a' + LINK + 'b');
    setPlainOutput(true);
    expect(stripUnsafeOutput('a' + LINK + 'b')).toBe('ahttps://app.simplenote.com/signup/b');
  });

  it('3: WHEN the guard filters an OSC 8 to `https://evil.test/` (ST-ended), one to the sign-up URL ended by BEL, the sign-up open cut one byte short, and the sign-up open around other text THEN each is dropped and only the text stays', () => {
    expect(stripUnsafeOutput('a\x1b]8;;https://evil.test/\x1b\\x\x1b]8;;\x1b\\b')).toBe('axb');
    expect(stripUnsafeOutput('a\x1b]8;;https://app.simplenote.com/signup/\x07x\x1b]8;;\x07b')).toBe('axb');
    expect(stripUnsafeOutput('a\x1b]8;;https://app.simplenote.com/signup\x1b\\x')).toBe('ax');
    expect(stripUnsafeOutput('a\x1b]8;;https://app.simplenote.com/signup/\x1b\\x\x1b]8;;\x1b\\b')).toBe('axb');
  });

  it('4: WHEN note text holding the exact sign-up link is sanitised for the screen THEN no ESC is left (untrusted text never carries the link)', () => {
    expect(sanitizeForTerminal('a' + LINK + 'b')).not.toContain('\x1b');
    expect(SIGNUP_LINK).toBe(LINK);
  });

  it('5: WHEN the login email step renders on a terminal (stdout isTTY) THEN the line is `No account? Sign up at ` + the link, on one line; WHEN not a terminal THEN it is the plain URL', async () => {
    process.stdout.isTTY = true;
    const tty = login();
    await waitForInput(tty.stdin);
    const frame = await waitForFrame(tty.lastFrame, 'No account?');
    expect(frame.split('\n').find((l) => l.includes('No account?'))).toBe('  No account? Sign up at ' + LINK);
    tty.unmount();
    process.stdout.isTTY = false as never;
    const pipe = login();
    expect(await waitForFrame(pipe.lastFrame, 'No account?')).toContain('No account? Sign up at https://app.simplenote.com/signup/');
    pipe.unmount();
  });

  it('6: WHEN an email is typed and Enter goes to the code step on a terminal THEN no OSC 8 is drawn', async () => {
    process.stdout.isTTY = true;
    const r = login();
    await waitForInput(r.stdin);
    r.stdin.write('a@b.co');
    await waitForFrame(r.lastFrame, 'a@b.co');
    r.stdin.write('\r');
    const frame = await waitForFrame(r.lastFrame, 'Code sent to');
    expect(frame).not.toContain('\x1b]8');
    r.unmount();
  });
});

describe('#603 the Skryf token prompt says where to register', () => {
  it('7: WHEN the token prompt shows for the default origin at width 80 THEN its line names skryf.art/register and https://skryf.art/settings/keys within 80 columns; for another origin it is `Blog token`', async () => {
    const r = render(<BlogSendDialog phase={{ kind: 'token', origin: DEFAULT_BLOG_ORIGIN }} setNoticeError={vi.fn()} request={vi.fn()} />);
    const frame = await waitForFrame(r.lastFrame, 'Skryf token');
    const line = frame.split('\n').find((l) => l.includes('Skryf token')) ?? '';
    expect(line).toContain('Skryf token (new? skryf.art/register, key: https://skryf.art/settings/keys):');
    expect([...line.trimEnd()].length).toBeLessThanOrEqual(80);
    r.unmount();
    const other = render(<BlogSendDialog phase={{ kind: 'token', origin: 'https://blog.example' }} setNoticeError={vi.fn()} request={vi.fn()} />);
    const f2 = await waitForFrame(other.lastFrame, 'Blog token');
    expect(f2).not.toContain('skryf.art/register');
    other.unmount();
  });
});
