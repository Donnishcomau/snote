/**
 * Issue #30 L5b: the bar's update click only asks. `snote --ask-update` drops `update-ask.request` (O_EXCL, 0600, no
 * link followed) for the running snote, and the running snote's watcher counts only a regular file made during its
 * session. With the update check off that snote offers nothing, so the ask opens nothing (test/tui/update-ask-bar test 8). Logout removes the file. BarWidget.qml runs no setup or install for it.
 */
import { spawn, type ChildProcess } from 'node:child_process';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { describe, it, expect, beforeEach, afterEach } from 'vitest';

import { main } from '../../src/cli/main';
import { UPDATE_ASK_FILE, watchNewRequests } from '../../src/core/new-request';
import { logout } from '../../src/core/token';

// Poll with a 10 ms step; every asserted value sits inside the condition.
const waitFor = async (cond: () => boolean, timeoutMs = 2500): Promise<void> => {
  const start = Date.now();
  while (!cond()) {
    if (Date.now() - start > timeoutMs) throw new Error('timed out waiting for condition');
    await new Promise((r) => setTimeout(r, 10));
  }
};

describe('issue #30 L5b the bar update click only asks', () => {
  let dir: string;
  let acct: string;
  let logged: string[];
  let child: ChildProcess | undefined;
  let stop: (() => void) | undefined;
  const io = { log: (text: string) => logged.push(text) };

  beforeEach(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'snote-askupd-'));
    acct = path.join(dir, 'a@b.c');
    logged = [];
  });

  afterEach(() => {
    stop?.();
    stop = undefined;
    child?.kill();
    child = undefined;
    fs.rmSync(dir, { recursive: true, force: true });
  });

  // Fixture: auth.json {"email":"a@b.c","token":"t"} and a live `sleep` pid in `<dir>/a@b.c/instance.lock`.
  const liveInstance = (): void => {
    fs.writeFileSync(path.join(dir, 'auth.json'), JSON.stringify({ email: 'a@b.c', token: 't' }));
    fs.mkdirSync(acct, { recursive: true });
    child = spawn('sleep', ['30'], { stdio: 'ignore' });
    child.unref();
    fs.writeFileSync(path.join(acct, 'instance.lock'), String(child.pid));
  };

  it("1: WHEN main(['--ask-update','--data-dir',dir]) runs with auth.json and a live-pid lock in `<dir>/a@b.c/` THEN it resolves `0`, `logged` is empty, `<dir>/a@b.c/update-ask.request` is a regular file with mode 0600 and `new-note.request` does not exist", async () => {
    liveInstance();
    const code = await main(['--ask-update', '--data-dir', dir], io);
    const st = fs.existsSync(path.join(acct, 'update-ask.request')) ? fs.lstatSync(path.join(acct, 'update-ask.request')) : null;
    expect({ code, logged, file: st?.isFile(), mode: st && st.mode & 0o777, note: fs.existsSync(path.join(acct, 'new-note.request')) }).toEqual({ code: 0, logged: [], file: true, mode: 0o600, note: false });
  });

  it("2: WHEN it runs with auth.json but no lock file in `<dir>/a@b.c/` THEN it resolves `3`, `logged` is empty and `<dir>/a@b.c` gains no `update-ask.request`", async () => {
    fs.writeFileSync(path.join(dir, 'auth.json'), JSON.stringify({ email: 'a@b.c', token: 't' }));
    fs.mkdirSync(acct);
    const code = await main(['--ask-update', '--data-dir', dir], io);
    expect({ code, logged, ask: fs.readdirSync(acct).includes('update-ask.request') }).toEqual({ code: 3, logged: [], ask: false });
  });

  it("3: WHEN `<dir>/a@b.c/update-ask.request` is already a symlink to `<dir>/target` THEN `--ask-update` resolves `3`, the link is still a link and `<dir>/target` does not exist", async () => {
    liveInstance();
    fs.symlinkSync(path.join(dir, 'target'), path.join(acct, 'update-ask.request'));
    const code = await main(['--ask-update', '--data-dir', dir], io);
    expect({ code, link: fs.lstatSync(path.join(acct, 'update-ask.request')).isSymbolicLink(), target: fs.existsSync(path.join(dir, 'target')) }).toEqual({ code: 3, link: true, target: false });
  });

  it('4: WHEN the update-ask watcher starts with `update-ask.request` already there THEN the file is gone as soon as the watcher returns and calls nothing; after it a symlink named `update-ask.request` and a regular one dated 5 s before the start call nothing, a `new-note.request` calls nothing, and a new regular `update-ask.request` calls it once', async () => {
    const reqPath = path.join(dir, UPDATE_ASK_FILE);
    const gone = (): boolean => { try { fs.lstatSync(reqPath); return false; } catch { return true; } };
    fs.writeFileSync(reqPath, '1');
    let calls = 0;
    // The watcher sweeps a link named update-ask.request without a call, so the link gone is the positive signal that it
    // has run since the write before; the calls count is read at that moment.
    const callsOnceLinkSwept = async (): Promise<number> => {
      fs.symlinkSync(path.join(dir, 'elsewhere'), reqPath);
      await waitFor(gone);
      return calls;
    };
    stop = watchNewRequests(dir, () => (calls += 1), { pollMs: 20, file: UPDATE_ASK_FILE });
    expect({ gone: gone(), calls }).toEqual({ gone: true, calls: 0 });
    expect(await callsOnceLinkSwept()).toBe(0);
    fs.writeFileSync(reqPath, '1');
    const old = (Date.now() - 5000) / 1000;
    fs.utimesSync(reqPath, old, old);
    await waitFor(gone);
    fs.writeFileSync(path.join(dir, 'new-note.request'), '1');
    expect(await callsOnceLinkSwept()).toBe(0);
    fs.writeFileSync(reqPath, '1');
    await waitFor(() => gone() && calls > 0);
    expect({ calls: await callsOnceLinkSwept(), note: fs.existsSync(path.join(dir, 'new-note.request')) }).toEqual({ calls: 1, note: true });
  });

  it('5: WHEN a folder holds `update-ask.request` and `logout(dir)` runs THEN no `update-ask.request` is left and `keep.txt` (text `mine`) is unchanged', async () => {
    fs.writeFileSync(path.join(dir, 'update-ask.request'), '1');
    fs.writeFileSync(path.join(dir, 'keep.txt'), 'mine');
    await logout(dir);
    expect({ ask: fs.existsSync(path.join(dir, 'update-ask.request')), keep: fs.readFileSync(path.join(dir, 'keep.txt'), 'utf8') }).toEqual({ ask: false, keep: 'mine' });
  });

  it('6: WHEN BarWidget.qml is read THEN `askUpdate()` runs the shim with `--ask-update` then `omarchy-launch-or-focus-tui snote` and none of `setupCommand`, `bar-update`, `omarchy plugin update`, `curl` and `git `, and the left click calls it only when snote is installed, current and announces an update', () => {
    const qml = fs.readFileSync(path.resolve(__dirname, '../../BarWidget.qml'), 'utf8');
    const fn = qml.slice(qml.indexOf('function askUpdate()'), qml.indexOf('// notes-action:begin'));
    expect({
      runs: fn.includes(`root.bar.run("'" + root.shellEscapeSingleQuoted(root.snoteShim) + "' --ask-update; omarchy-launch-or-focus-tui snote")`),
      banned: ['setupCommand', 'bar-update', 'updateScript', 'omarchy plugin update', 'curl', 'git '].filter((w) => fn.includes(w)),
      click: qml.includes('      if (root.snoteAvailable && !root.snoteStale && root.announced !== "") { root.askUpdate(); return }\n      root.launchOrHint()'),
    }).toEqual({ runs: true, banned: [], click: true });
  });
});
