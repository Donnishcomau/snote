import { afterEach, describe, expect, it, vi } from 'vitest';
import * as fs from 'node:fs';

vi.mock('node:fs', async (importOriginal) => {
  const actual = await importOriginal<typeof import('node:fs')>();
  const track = (kind: string, p: fs.PathLike | fs.PathOrFileDescriptor): void => {
    const box = (globalThis as { __starOps?: string[] | null }).__starOps;
    if (!box || typeof p === 'number' || !String(p).endsWith('star-prompt.json')) return;
    box.push(kind);
  };
  const readFileSync = ((p: fs.PathOrFileDescriptor, opts?: never) => {
    track('read', p);
    return actual.readFileSync(p, opts);
  }) as typeof actual.readFileSync;
  const renameSync = ((from: fs.PathLike, to: fs.PathLike) => {
    track('write', to);
    return actual.renameSync(from, to);
  }) as typeof actual.renameSync;
  return {
    ...actual,
    readFileSync,
    renameSync,
    lstatSync(p: fs.PathLike, opts?: fs.StatOptions) {
      track('lstat', p);
      const st = actual.lstatSync(p, opts);
      const foreign = (globalThis as { __starForeign?: string }).__starForeign ?? '';
      if (foreign !== '' && String(p) === foreign) {
        return new Proxy(st, {
          get(target, prop, receiver) {
            if (prop === 'uid') return 65534;
            const v: unknown = Reflect.get(target, prop, receiver);
            return typeof v === 'function' ? (v as (...a: unknown[]) => unknown).bind(target) : v;
          },
        });
      }
      return st;
    },
  };
});
import * as os from 'node:os';
import * as path from 'node:path';
import React from 'react';
import { render } from 'ink-testing-library';

import {
  AGE_MS,
  GH_CANDIDATES,
  MIN_DAYS,
  MIN_LAUNCHES,
  PROMPT_NO_GH,
  QUIET_MS,
  RESULT_BROWSER,
  RESULT_GH_FAILED,
  RESULT_OPENED,
  eligible,
  attachStarUi,
  openLineForTest,
  armStar,
  recordLaunch,
  resetStarPrompt,
  resolveGh,
  runBounded,
  setForcedGh,
  setPageOpener,
  setStarBoot,
  setStarNow,
  setStarRun,
  starAsk,
  starConsent,
  starNo,
  starPromptPath,
  starShows,
  starYes,
  takeStarResult,
  tryOpen,
  type StarSnap,
} from '../../src/core/star-prompt';
import { allowUpdateOffer, handOffRequested, requestHandOff, resetUpdateOffer } from '../../src/core/update-offer';
import { publishBanner, resetBanner } from '../../src/core/update-banner';
import { UpdateAsk, bindStarRuntime, openUpdateAskOnU, pokeStar, resetUpdateAskSeen, updateAskOpen, updateAskSeen } from '../../src/tui/update-ask';
attachStarUi({ poke: pokeStar, askOpen: updateAskOpen, askSeen: updateAskSeen, bind: bindStarRuntime, handed: () => handOffRequested() !== null });

const DAY = 86400000;
const URL = 'https://github.com/Donnishcomau/snote';
let t = 2_000_000_000;
let dir = '';
const extras: string[] = [];

function snap(over: Partial<StarSnap> = {}): StarSnap {
  return { now: t, startedAt: t - AGE_MS - 1, quietAt: null, busy: false, syncError: false, conflict: false, unsent: false, off: false, ...over };
}
function fresh(): string {
  const d = fs.mkdtempSync(path.join(os.tmpdir(), 'snote-971-'));
  fs.writeFileSync(path.join(d, 'auth.json'), '{}\n', { mode: 0o600 });
  fs.mkdirSync(path.join(d, 'user@example.com'));
  return d;
}
function writeEligible(folder: string, over: Partial<{ launches: number; firstLaunch: number; asked: boolean }> = {}): void {
  const state = { launches: MIN_LAUNCHES, firstLaunch: t - MIN_DAYS * DAY, asked: false, ...over };
  const file = starPromptPath(folder);
  fs.writeFileSync(file, JSON.stringify(state), { mode: 0o600 });
}
function readState(folder: string): { launches: number; firstLaunch: number; asked: boolean } {
  return JSON.parse(fs.readFileSync(starPromptPath(folder), 'utf8')) as { launches: number; firstLaunch: number; asked: boolean };
}
function script(file: string, body: string, mode: number): void {
  fs.writeFileSync(file, body, { mode });
}

afterEach(() => {
  resetStarPrompt();
  resetUpdateAskSeen();
  resetUpdateOffer();
  resetBanner();
  delete process.env.SNOTE_STAR_PROMPT;
  delete process.env.SNOTE_API_KEY;
  delete process.env.SNOTE_BLOG_ORIGIN;
  delete process.env.STAR_REC;
  (globalThis as { __starForeign?: string }).__starForeign = '';
  (globalThis as { __starOps?: string[] | null }).__starOps = null;
  if (dir) {
    try { fs.chmodSync(dir, 0o755); } catch { /* already gone */ }
    fs.rmSync(dir, { recursive: true, force: true });
    dir = '';
  }
  for (const extra of extras) {
    try { fs.chmodSync(extra, 0o755); } catch { /* already gone */ }
    fs.rmSync(extra, { recursive: true, force: true });
  }
  extras.length = 0;
});

describe('star prompt', () => {
  it('1: WHEN launches, days, asked or the switch block THEN eligibility is false; eight launches and seven days is true; the first launch file is mode 0600 and not eligible', () => {
    dir = fresh();
    setStarNow(() => t);
    setStarBoot(t - AGE_MS - 1);
    expect(recordLaunch(dir, t)).toBe(true);
    const file = starPromptPath(dir);
    expect(file).toBe(path.join(dir, 'star-prompt.json'));
    expect(fs.existsSync(path.join(dir, 'user@example.com', 'star-prompt.json'))).toBe(false);
    expect(fs.readFileSync(file, 'utf8')).toBe(`{"launches":1,"firstLaunch":${t},"asked":false}`);
    expect(fs.statSync(file).mode & 0o777).toBe(0o600);
    expect(fs.readFileSync(path.join(process.cwd(), 'src/core/token.ts'), 'utf8').includes('star-prompt.json')).toBe(false);
    expect(eligible(readState(dir), snap())).toBe(false);
    const young = { launches: MIN_LAUNCHES, firstLaunch: t, asked: false };
    expect(eligible(young, snap())).toBe(false);
    const few = { launches: 1, firstLaunch: t - (MIN_DAYS + 1) * DAY, asked: false };
    expect(eligible(few, snap())).toBe(false);
    expect(eligible({ ...few, launches: MIN_LAUNCHES, asked: true }, snap())).toBe(false);
    const ready = { launches: MIN_LAUNCHES, firstLaunch: t - MIN_DAYS * DAY, asked: false };
    expect(eligible(ready, snap())).toBe(true);
    expect(eligible(ready, snap({ off: true }))).toBe(false);
    process.env.SNOTE_STAR_PROMPT = 'off';
    const again = fresh();
    extras.push(again);
    expect(recordLaunch(again, t)).toBe(false);
    expect(fs.existsSync(starPromptPath(again))).toBe(false);
    fs.rmSync(again, { recursive: true, force: true });
    delete process.env.SNOTE_STAR_PROMPT;
    expect(tryOpen(dir, snap())).toBe(false);
  });

  it('2: WHEN the file is a symlink, oversized, not an object, an unknown key or a wrong type THEN it is treated as asked and nothing is written', () => {
    dir = fresh();
    setStarNow(() => t);
    const target = path.join(dir, 'target.json');
    fs.writeFileSync(target, 'SECRET');
    fs.symlinkSync(target, starPromptPath(dir));
    expect(recordLaunch(dir, t)).toBe(false);
    expect(tryOpen(dir, snap())).toBe(false);
    expect(fs.readFileSync(target, 'utf8')).toBe('SECRET');
    expect(fs.lstatSync(starPromptPath(dir)).isSymbolicLink()).toBe(true);
    fs.unlinkSync(starPromptPath(dir));
    fs.mkdirSync(starPromptPath(dir));
    expect(recordLaunch(dir, t)).toBe(false);
    expect(fs.statSync(starPromptPath(dir)).isDirectory()).toBe(true);
    fs.rmdirSync(starPromptPath(dir));
    const bad = (body: string): void => {
      fs.writeFileSync(starPromptPath(dir), body);
      const before = fs.readFileSync(starPromptPath(dir), 'utf8');
      expect(recordLaunch(dir, t)).toBe(false);
      expect(tryOpen(dir, snap())).toBe(false);
      expect(fs.readFileSync(starPromptPath(dir), 'utf8')).toBe(before);
    };
    bad('x'.repeat(513));
    bad('null');
    bad('[]');
    bad('{"launches":1,"firstLaunch":1,"asked":false,"extra":1}');
    bad('{"launches":"1","firstLaunch":1,"asked":false}');
    bad('{"launches":-1,"firstLaunch":1,"asked":false}');
  });

  it('3: WHEN the line opens THEN asked is true before any key; a second arm does not open it; a read-only folder does not open it', () => {
    dir = fresh();
    t = 2_000_000_000;
    setStarNow(() => t);
    setStarBoot(t - AGE_MS - 1);
    setForcedGh(null);
    writeEligible(dir);
    expect(tryOpen(dir, snap())).toBe(true);
    expect(readState(dir).asked).toBe(true);
    expect(starShows().length).toBeGreaterThan(0);
    resetStarPrompt();
    setStarNow(() => t);
    setStarBoot(t - AGE_MS - 1);
    setForcedGh(null);
    recordLaunch(dir, t);
    tryOpen(dir, snap());
    expect(starShows()).toBe('');
    const ro = fresh();
    extras.push(ro);
    writeEligible(ro);
    fs.chmodSync(ro, 0o555);
    resetStarPrompt();
    setStarNow(() => t);
    setStarBoot(t - AGE_MS - 1);
    setForcedGh(null);
    expect(tryOpen(ro, snap())).toBe(false);
    expect(starShows()).toBe('');
    expect(readState(ro).asked).toBe(false);
    fs.chmodSync(ro, 0o755);
    fs.rmSync(ro, { recursive: true, force: true });
  });

  it('4: WHEN a fake gh in a path with a space runs THEN auth and star argv, host, env and file trust match the rules', async () => {
    dir = fresh();
    expect(GH_CANDIDATES.every((c) => path.isAbsolute(c))).toBe(true);
    const space = path.join(dir, 'dir with space');
    fs.mkdirSync(space);
    const rec = path.join(dir, 'rec');
    const decoyMark = path.join(dir, 'decoy-ran');
    const body = [
      '#!/bin/sh',
      'rec="$STAR_REC"',
      'printf "0=%s\\n" "$0" >> "$rec"',
      'if [ -t 0 ]; then printf "stdin=tty\\n" >> "$rec"; elif [ -c /dev/fd/0 ] && [ /dev/fd/0 -ef /dev/null ]; then printf "stdin=null\\n" >> "$rec"; else printf "stdin=other\\n" >> "$rec"; fi',
      'printf "argv=" >> "$rec"',
      'printf "%s|" "$@" >> "$rec"',
      'printf "\\n" >> "$rec"',
      'env >> "$rec"',
      'printf "%s\\n" "---" >> "$rec"',
      'exit 0',
      '',
    ].join('\n');
    const good = path.join(space, 'gh');
    const bad = path.join(space, 'bad-gh');
    const foreign = path.join(space, 'foreign-gh');
    script(good, body, 0o755);
    script(bad, body, 0o775);
    fs.chmodSync(bad, 0o775);
    script(foreign, '#!/bin/sh\nexit 0\n', 0o755);
    (globalThis as { __starForeign?: string }).__starForeign = fs.realpathSync(foreign);
    expect(resolveGh([foreign, good])).toBe(fs.realpathSync(good));
    (globalThis as { __starForeign?: string }).__starForeign = '';
    expect(resolveGh([bad, good])).toBe(fs.realpathSync(good));
    const link = path.join(dir, 'gh-link');
    fs.symlinkSync(good, link);
    expect(resolveGh([link])).toBe(fs.realpathSync(good));
    const decoyDir = path.join(dir, 'decoy');
    fs.mkdirSync(decoyDir);
    script(path.join(decoyDir, 'gh'), `#!/bin/sh\necho ran > ${JSON.stringify(decoyMark)}\n`, 0o755);
    const oldPath = process.env.PATH;
    try {
      process.env.PATH = `${decoyDir}:${oldPath ?? ''}`;
      process.env.STAR_REC = rec;
      process.env.SNOTE_API_KEY = 'secret';
      process.env.SNOTE_BLOG_ORIGIN = 'http://example.test';
      setForcedGh(fs.realpathSync(good));
      setPageOpener(null);
      setStarRun(null);
      setStarNow(() => t);
      openLineForTest(true);
      t += 1000;
      starAsk('s', false);
      await vi.waitFor(() => expect(starConsent()).toBe(true));
      expect({ consent: starConsent(), rec: fs.existsSync(rec) }).toEqual({ consent: true, rec: true });
      t += 1000;
      await starYes();
      const raw = fs.readFileSync(rec, 'utf8');
      const blocks = raw.split('---\n').filter((b) => b.includes('argv='));
      expect(blocks).toHaveLength(2);
      const argv = (b: string): string => (b.split('\n').find((l) => l.startsWith('argv=')) ?? '').slice(5);
      expect(argv(blocks[0])).toBe('auth|status|--hostname|github.com|');
      expect(argv(blocks[1])).toBe('api|--hostname|github.com|-X|PUT|user/starred/Donnishcomau/snote|');
      for (const b of blocks) {
        expect(b).toContain(`0=${fs.realpathSync(good)}`);
        expect(b).toContain('stdin=null');
        expect(b).toContain('GH_PROMPT_DISABLED=1');
        expect(b).toContain('GH_NO_UPDATE_NOTIFIER=1');
        expect(b).toContain('NO_COLOR=1');
        expect(b.split('\n').some((l) => l.startsWith('SNOTE_'))).toBe(false);
      }
      expect(fs.existsSync(decoyMark)).toBe(false);
    } finally {
      process.env.PATH = oldPath;
    }
  });

  it('5: WHEN the fake gh outlives the injected timeout THEN the call resolves as a failure and the child has exited', async () => {
    dir = fresh();
    const pidfile = path.join(dir, 'pid');
    const sleeper = path.join(dir, 'sleep.sh');
    script(sleeper, '#!/bin/sh\necho $$ > "$1"\nexec sleep 30\n', 0o755);
    let code: number | 'pending' = 'pending';
    void runBounded(sleeper, [pidfile], 80).then((c) => { code = c; });
    await vi.waitFor(() => expect(fs.existsSync(pidfile) || code !== 'pending').toBe(true));
    if (!fs.existsSync(pidfile)) {
      expect(code).toBe(1);
      return;
    }
    await vi.waitFor(() => expect(code).toBe(1), { timeout: 1500 });
    const pid = Number(fs.readFileSync(pidfile, 'utf8'));
    let alive = true;
    try { process.kill(pid, 0); } catch { alive = false; }
    expect(alive).toBe(false);
  });

  it('6: WHEN no gh candidate exists THEN s opens the page with the url argv; a missing opener shows the browser line; auth and star failures open the page once', async () => {
    dir = fresh();
    setStarNow(() => t);
    const calls: { file: string; args: string[]; detached: boolean }[] = [];
    const run = (auth: number, star: number) => {
      calls.length = 0;
      setStarRun(async (file, args, _timeout, detached) => {
        calls.push({ file, args: [...args], detached });
        if (args[0] === 'auth') return auth;
        if (args[0] === 'api') return star;
        return 0;
      });
    };
    const hold = async (line: string, check: () => void): Promise<void> => {
      let got = '';
      await vi.waitFor(() => {
        check();
        const next = takeStarResult();
        if (next !== '') got = next;
        expect(got).toBe(line);
      }, { timeout: 1500 });
    };
    setForcedGh(null);
    setPageOpener(null);
    run(0, 0);
    openLineForTest(false);
    t += 500;
    starAsk('s', false);
    await hold(RESULT_BROWSER, () => {
      expect(starShows()).toBe('');
      expect(calls).toEqual([]);
    });
    resetStarPrompt();
    setStarNow(() => t);
    setForcedGh(null);
    setPageOpener('/usr/bin/xdg-open');
    run(0, 0);
    openLineForTest(false);
    t += 500;
    starAsk('s', false);
    await hold(RESULT_OPENED, () => {
      expect(calls).toHaveLength(1);
      expect(calls[0]).toEqual({ file: '/usr/bin/xdg-open', args: [URL], detached: true });
    });
    resetStarPrompt();
    setStarNow(() => t);
    setForcedGh('/usr/bin/gh');
    setPageOpener('/usr/bin/xdg-open');
    run(1, 0);
    openLineForTest(true);
    t += 500;
    starAsk('s', false);
    await hold(RESULT_GH_FAILED, () => {
      expect(calls.filter((c) => c.detached)).toHaveLength(1);
      expect(calls.filter((c) => c.args[0] === 'api')).toEqual([]);
      expect(calls.find((c) => c.detached)?.args).toEqual([URL]);
    });
    resetStarPrompt();
    setStarNow(() => t);
    setForcedGh('/usr/bin/gh');
    setPageOpener('/usr/bin/xdg-open');
    run(0, 1);
    openLineForTest(true);
    t += 500;
    starAsk('s', false);
    await vi.waitFor(() => expect(starConsent()).toBe(true), { timeout: 1500 });
    t += 500;
    await starYes();
    let failed = '';
    await vi.waitFor(() => {
      expect(calls.filter((c) => c.args[0] === 'api')).toHaveLength(1);
      expect(calls.filter((c) => c.detached)).toHaveLength(1);
      expect(calls.find((c) => c.detached)?.args).toEqual([URL]);
      const next = takeStarResult();
      if (next !== '') failed = next;
      expect(failed).toBe(RESULT_GH_FAILED);
    }, { timeout: 1500 });
    starNo();
  });

  it('6b: WHEN the page opener has started THEN the result line is set while it is still running; a non-executable opener shows the browser line', async () => {
    dir = fresh();
    const dead: number[] = [];
    const end = (pid: number): void => {
      try { process.kill(pid, 'SIGKILL'); } catch { /* already gone */ }
      dead.push(pid);
    };
    const hang = (pidfile: string): string => {
      const file = path.join(dir, path.basename(pidfile) + '.sh');
      script(file, `#!/bin/sh\necho $$ > ${JSON.stringify(pidfile)}\nexec sleep 30\n`, 0o755);
      return file;
    };
    const alive = (pid: number): boolean => {
      try { process.kill(pid, 0); return true; } catch { return false; }
    };
    const opened = async (file: string, line: string): Promise<number> => {
      let pid = 0;
      let got = '';
      await vi.waitFor(() => {
        const n = Number(fs.readFileSync(file, 'utf8'));
        expect(Number.isInteger(n)).toBe(true);
        expect(n).toBeGreaterThan(0);
        expect(alive(n)).toBe(true);
        const next = takeStarResult();
        if (next !== '') got = next;
        expect(got).toBe(line);
        pid = n;
      }, { timeout: 1500 });
      return pid;
    };
    setStarNow(() => t);
    setStarRun(null);
    setForcedGh(null);
    const pidNoGh = path.join(dir, 'pid-nogh');
    setPageOpener(hang(pidNoGh));
    openLineForTest(false);
    t += 500;
    starAsk('s', false);
    const pidA = await opened(pidNoGh, RESULT_OPENED);
    end(pidA);
    resetStarPrompt();
    setStarNow(() => t);
    setStarRun(null);
    const gh = path.join(dir, 'gh');
    script(gh, '#!/bin/sh\nexit 1\n', 0o755);
    setForcedGh(gh);
    const pidFail = path.join(dir, 'pid-fail');
    setPageOpener(hang(pidFail));
    openLineForTest(true);
    t += 500;
    starAsk('s', false);
    const pidB = await opened(pidFail, RESULT_GH_FAILED);
    end(pidB);
    resetStarPrompt();
    setStarNow(() => t);
    setStarRun(null);
    setForcedGh(null);
    const blocked = path.join(dir, 'not-exec');
    script(blocked, '#!/bin/sh\nexit 0\n', 0o644);
    setPageOpener(blocked);
    openLineForTest(false);
    t += 500;
    starAsk('s', false);
    let browser = '';
    await vi.waitFor(() => {
      const next = takeStarResult();
      if (next !== '') browser = next;
      expect(browser).toBe(RESULT_BROWSER);
      for (const pid of dead) expect(alive(pid)).toBe(false);
    }, { timeout: 1500 });
  });

  it('11: WHEN age, quiet, update state or a blocking notice holds THEN the line stays closed; WHEN all clear THEN it opens', () => {
    dir = fresh();
    t = 2_000_000_000;
    setStarNow(() => t);
    setStarBoot(t - AGE_MS - 1);
    setForcedGh(null);
    writeEligible(dir);
    expect(tryOpen(dir, snap({ busy: true }))).toBe(false);
    expect(tryOpen(dir, snap({ syncError: true }))).toBe(false);
    expect(tryOpen(dir, snap({ conflict: true }))).toBe(false);
    expect(tryOpen(dir, snap({ unsent: true }))).toBe(false);
    expect(tryOpen(dir, snap({ startedAt: t - 1 }))).toBe(false);
    expect(tryOpen(dir, snap({ quietAt: t - 1 }))).toBe(false);
    expect(starShows()).toBe('');
    expect(QUIET_MS).toBe(30000);
    allowUpdateOffer('plugin');
    publishBanner('1.2.3', '1.2.4');
    const ui = render(React.createElement(UpdateAsk, { quit: () => {}, entry: () => null }));
    openUpdateAskOnU('U');
    expect(updateAskOpen()).toBe(true);
    expect(tryOpen(dir, snap())).toBe(false);
    ui.unmount();
    expect(updateAskSeen()).toBe(true);
    expect(updateAskOpen()).toBe(false);
    expect(tryOpen(dir, snap())).toBe(false);
    resetUpdateAskSeen();
    expect(requestHandOff()).toBe(true);
    expect(tryOpen(dir, snap())).toBe(false);
    resetUpdateOffer();
    resetBanner();
    expect(eligible({ launches: MIN_LAUNCHES - 1, firstLaunch: t - (MIN_DAYS + 1) * DAY, asked: false }, snap())).toBe(false);
    expect(tryOpen(dir, snap())).toBe(true);
    expect(starShows()).toBe(PROMPT_NO_GH);
  });

  it('13: WHEN arm has counted THEN later notes do not read star-prompt.json, and the line opens only after a fresh read', () => {
    const opsOf = (): string[] => (globalThis as { __starOps?: string[] | null }).__starOps ?? [];
    const watch = (): void => { (globalThis as { __starOps?: string[] | null }).__starOps = []; };
    const quiet = (): string[] => { const got = opsOf().slice(); (globalThis as { __starOps?: string[] | null }).__starOps = null; return got; };
    const body = (launches: number, asked: boolean): string => JSON.stringify({ launches, firstLaunch: t - (MIN_DAYS + 1) * DAY, asked });
    const bytes = (): string => { const box = (globalThis as { __starOps?: string[] | null }).__starOps ?? null; (globalThis as { __starOps?: string[] | null }).__starOps = null; const raw = fs.readFileSync(starPromptPath(dir), 'utf8'); (globalThis as { __starOps?: string[] | null }).__starOps = box; return raw; };
    let bound: () => void = () => {};
    let message = '';
    const notes = (n: number): void => { for (let i = 0; i < n; i += 1) bound(); };
    const arm = (raw: string, startedAt: number): void => {
      resetStarPrompt();
      message = '';
      fs.writeFileSync(starPromptPath(dir), raw, { mode: 0o600 });
      setStarNow(() => t);
      setStarBoot(startedAt);
      setForcedGh(null);
      attachStarUi({
        poke: () => {},
        askOpen: () => false,
        askSeen: () => false,
        bind: (note) => { bound = note; },
        read: () => ({ message, pending: 0, word: 'idle', busy: false }),
        handed: () => false,
      });
      armStar(dir);
    };
    try {
      dir = fresh();
      t = 2_000_000_000;
      arm(body(MIN_LAUNCHES - 2, false), t - AGE_MS - 1);
      const heldFew = bytes();
      expect(heldFew).toContain(`"launches":${MIN_LAUNCHES - 1}`);
      watch();
      notes(20);
      expect(opsOf()).toEqual([]);
      expect(bytes()).toBe(heldFew);
      expect(starShows()).toBe('');
      const eligibleRaw = body(MIN_LAUNCHES, false);
      fs.writeFileSync(starPromptPath(dir), eligibleRaw, { mode: 0o600 });
      notes(20);
      expect(opsOf()).toEqual([]);
      expect(bytes()).toBe(eligibleRaw);
      expect(starShows()).toBe('');
      arm(body(MIN_LAUNCHES, false), t);
      const beforeAge = bytes();
      watch();
      notes(20);
      expect(opsOf().filter((op) => op === 'lstat' || op === 'read' || op === 'write')).toEqual([]);
      expect(bytes()).toBe(beforeAge);
      expect(starShows()).toBe('');
      t += AGE_MS + 1;
      (globalThis as { __starOps?: string[] | null }).__starOps = [];
      bound();
      const opened = quiet();
      const readAt = opened.indexOf('read');
      const writeAt = opened.indexOf('write');
      expect(opened.filter((op) => op === 'read')).toEqual(['read']);
      expect(opened.filter((op) => op === 'lstat').length).toBeGreaterThan(0);
      expect(readAt).toBeGreaterThanOrEqual(0);
      expect(writeAt).toBeGreaterThan(readAt);
      expect(bytes()).toContain('"asked":true');
      expect(starShows().length).toBeGreaterThan(0);
      watch();
      notes(10);
      message = 'kept both versions of the note';
      notes(10);
      expect(starShows()).toBe('');
      expect(opsOf()).toEqual([]);
      arm(body(MIN_LAUNCHES - 1, false), t);
      expect(bytes()).toContain(`"launches":${MIN_LAUNCHES}`);
      watch();
      notes(20);
      expect(opsOf()).toEqual([]);
      expect(starShows()).toBe('');
      t += AGE_MS + 1;
      bound();
      expect(starShows().length).toBeGreaterThan(0);
      expect(bytes()).toContain('"asked":true');
      const askedRaw = body(MIN_LAUNCHES, true);
      arm(body(MIN_LAUNCHES, false), t);
      fs.writeFileSync(starPromptPath(dir), askedRaw, { mode: 0o600 });
      t += AGE_MS + 1;
      watch();
      bound();
      const askedOnce = opsOf().slice();
      notes(20);
      expect(starShows()).toBe('');
      expect(bytes()).toBe(askedRaw);
      expect(opsOf()).toEqual(askedOnce);
      expect(askedOnce.filter((op) => op === 'write')).toEqual([]);
      const target = path.join(dir, 'target.json');
      arm(body(MIN_LAUNCHES, false), t);
      fs.unlinkSync(starPromptPath(dir));
      fs.writeFileSync(target, 'SECRET');
      fs.symlinkSync(target, starPromptPath(dir));
      t += AGE_MS + 1;
      watch();
      bound();
      const linkOnce = opsOf().slice();
      notes(20);
      expect(starShows()).toBe('');
      expect(opsOf()).toEqual(linkOnce);
      expect(linkOnce.filter((op) => op === 'write')).toEqual([]);
      (globalThis as { __starOps?: string[] | null }).__starOps = null;
      expect(fs.readFileSync(target, 'utf8')).toBe('SECRET');
      expect(fs.lstatSync(starPromptPath(dir)).isSymbolicLink()).toBe(true);
      arm(body(MIN_LAUNCHES, false), t);
      fs.chmodSync(dir, 0o555);
      t += AGE_MS + 1;
      watch();
      bound();
      const afterRefuse = opsOf().slice();
      expect(starShows()).toBe('');
      notes(20);
      expect(opsOf()).toEqual(afterRefuse);
      (globalThis as { __starOps?: string[] | null }).__starOps = null;
      expect(JSON.parse(fs.readFileSync(starPromptPath(dir), 'utf8')).asked).toBe(false);
    } finally {
      (globalThis as { __starOps?: string[] | null }).__starOps = null;
      attachStarUi({ poke: pokeStar, askOpen: updateAskOpen, askSeen: updateAskSeen, bind: bindStarRuntime, handed: () => handOffRequested() !== null });
    }
  });
});
