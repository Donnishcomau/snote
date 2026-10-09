/** F162: the login screen draws pasted email/code through sanitizeForTerminal; values sent stay as typed. */
import { describe, it, expect, vi } from 'vitest';
import { render } from 'ink-testing-library';
import React from 'react';
import { Login } from '../../src/tui/Login';
import { waitForFrame, waitForInput } from '../helpers/ink-waits';

const RAW = 'a\x1b[45mb@c.co‮d';
const SAFE = 'ab@c.co' + 'd';

function setup() {
  const requestCode = vi.fn().mockResolvedValue(undefined);
  const completeLogin = vi.fn().mockResolvedValue('tok');
  const passwordLogin = vi.fn().mockResolvedValue('tok');
  const onLoggedIn = vi.fn();
  const r = render(
    <Login width={80} height={24} requestCode={requestCode} completeLogin={completeLogin}
      passwordLogin={passwordLogin} onLoggedIn={onLoggedIn} />,
  );
  return { requestCode, completeLogin, passwordLogin, ...r };
}
const clean = (f: string) => !f.includes('\x1b[45m') && !f.includes('‮');

describe('login paste sanitised (F162)', () => {
  it('1: WHEN `a\\x1b[45mb@c.co‮d` is pasted into the email step THEN the frame contains `Email: ab@c.cod` and neither `\\x1b[45m` nor `‮`', async () => {
    const { stdin, lastFrame } = setup();
    await waitForInput(stdin);
    stdin.write(RAW);
    const f = await waitForFrame(lastFrame, (x) => x.includes('Email: ' + SAFE) && clean(x));
    expect(f).toContain('Email: ' + SAFE);
    expect(clean(f)).toBe(true);
  });

  it('2: WHEN `a\\x1b[45mb@c.co‮d` is pasted and Enter is written THEN requestCode is not called, the frame contains `Error: Email or code has control or hidden characters` and neither raw sequence', async () => {
    const { stdin, lastFrame, requestCode } = setup();
    await waitForInput(stdin);
    stdin.write(RAW);
    await waitForFrame(lastFrame, 'Email: ' + SAFE);
    stdin.write('\r');
    const f = await waitForFrame(lastFrame, (x) => x.includes('Error: Email or code has control or hidden characters') && clean(x));
    expect(f).toContain('Error: Email or code has control or hidden characters');
    expect(clean(f)).toBe(true);
    expect(requestCode).not.toHaveBeenCalled();
  });

  it('3: WHEN the code `1\\x1b[45m2‮3` is pasted in the code step THEN the frame contains `Code: 123` and neither raw sequence, and Enter does not call completeLogin', async () => {
    const { stdin, lastFrame, completeLogin } = setup();
    await waitForInput(stdin);
    stdin.write('a@b.co');
    await waitForFrame(lastFrame, 'Email: a@b.co');
    stdin.write('\r');
    await waitForFrame(lastFrame, 'Code sent to a@b.co');
    stdin.write('1\x1b[45m2‮3');
    const f = await waitForFrame(lastFrame, (x) => x.includes('Code: 123') && clean(x));
    expect(f).toContain('Code: 123');
    stdin.write('\r');
    const g = await waitForFrame(lastFrame, (x) => x.includes('Error: Email or code has') && clean(x));
    expect(g).toContain('Code: 123');
    expect(completeLogin).not.toHaveBeenCalled();
  });

  it('4: WHEN a password `pw‮x` is pasted in the password step THEN the frame contains `Password: ******` and no `pw`, `\\x1b[45m` or `‮`, and passwordLogin gets exactly that password', async () => {
    const { stdin, lastFrame, passwordLogin } = setup();
    await waitForInput(stdin);
    stdin.write('a@b.co');
    await waitForFrame(lastFrame, 'Email: a@b.co');
    stdin.write('\t');
    await waitForFrame(lastFrame, 'Password:');
    const pw = 'pw‮x';
    stdin.write(pw);
    const f = await waitForFrame(lastFrame, (x) => x.includes('Password: ' + '*'.repeat(pw.length)) && !x.includes('pw') && clean(x));
    expect(f).toContain('Password: ' + '*'.repeat(pw.length));
    expect(f).not.toContain('pw');
    stdin.write('\r');
    await vi.waitFor(() => expect(passwordLogin).toHaveBeenCalledWith('a@b.co', pw));
  });

  it('5: WHEN the plain email `me@x.org` is typed THEN the frame contains `Email: me@x.org` and Enter calls requestCode with `me@x.org`', async () => {
    const { stdin, lastFrame, requestCode } = setup();
    await waitForInput(stdin);
    stdin.write('me@x.org');
    const f = await waitForFrame(lastFrame, 'Email: me@x.org');
    expect(f).toContain('Email: me@x.org');
    stdin.write('\r');
    await vi.waitFor(() => expect(requestCode).toHaveBeenCalledWith('me@x.org'));
  });

  it('6: WHEN the hostile email `a\\x1b[45mb@c.co‮d` is pasted, Tab and a password `pw1` and Enter are written THEN passwordLogin is not called and the frame contains `Error: Email or code has control or hidden characters`', async () => {
    const { stdin, lastFrame, passwordLogin } = setup();
    await waitForInput(stdin);
    stdin.write(RAW);
    await waitForFrame(lastFrame, 'Email: ' + SAFE);
    stdin.write('\t');
    await waitForFrame(lastFrame, 'Password:');
    stdin.write('pw1');
    await waitForFrame(lastFrame, 'Password: ***');
    stdin.write('\r');
    const f = await waitForFrame(lastFrame, (x) => x.includes('Error: Email or code has control or hidden characters') && clean(x));
    expect(f).toContain('Error: Email or code has control or hidden characters');
    expect(passwordLogin).not.toHaveBeenCalled();
  });

  it('7: WHEN the plain email `a@b.co`, Tab, password `pw1` and Enter are written THEN passwordLogin is called with `a@b.co` and `pw1`', async () => {
    const { stdin, lastFrame, passwordLogin } = setup();
    await waitForInput(stdin);
    stdin.write('a@b.co');
    await waitForFrame(lastFrame, 'Email: a@b.co');
    stdin.write('\t');
    await waitForFrame(lastFrame, 'Password:');
    stdin.write('pw1');
    await waitForFrame(lastFrame, 'Password: ***');
    stdin.write('\r');
    await vi.waitFor(() => expect(passwordLogin).toHaveBeenCalledWith('a@b.co', 'pw1'));
  });
});
