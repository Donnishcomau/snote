// #971: one ask, after real use, to star the public repo. gh is a fixed absolute path.
import { spawn } from 'node:child_process';
import type { ChildProcess } from 'node:child_process';
import * as fs from 'node:fs';
import { join } from 'node:path';
import { secureWriteFileSync } from './secure-fs';

export const MIN_LAUNCHES = 8;
export const MIN_DAYS = 7;
export const AGE_MS = 60000;
export const QUIET_MS = 30000;
export const GUARD_MS = 300;
const DAY_MS = 86400000;
const FILE = 'star-prompt.json';
const AUTH_MS = 5000;
const STAR_MS = 10000;
const OPEN_MS = 5000;
const REPO_URL = 'https://github.com/Donnishcomau/snote';
const AUTH_ARGV = ['auth', 'status', '--hostname', 'github.com'] as const;
const STAR_ARGV = ['api', '--hostname', 'github.com', '-X', 'PUT', 'user/starred/Donnishcomau/snote'] as const;
export const GH_CANDIDATES = ['/usr/bin/gh', '/usr/local/bin/gh', '/opt/homebrew/bin/gh', '/home/linuxbrew/.linuxbrew/bin/gh'];
export const PROMPT_WITH_GH = 'Enjoying snote? s: star it on GitHub, using your GitHub CLI   n: no thanks';
export const PROMPT_NO_GH = 'Enjoying snote? s: open its GitHub page to star it   n: no thanks';
export const CONSENT_LINE = 'Star Donnishcomau/snote with gh, as the account gh is signed in to? [y/N]';
export const RESULT_STARRED = 'Starred Donnishcomau/snote on GitHub. Thank you.';
export const RESULT_OPENED = 'Opened the snote page on GitHub. Thank you.';
export const RESULT_GH_FAILED = 'gh could not star it, so snote opened the GitHub page instead.';
export const RESULT_BROWSER = 'Could not open a browser. The page is github.com/Donnishcomau/snote';
export const RESULT_NO = 'No problem. snote will not ask again.';
export interface StarFile { launches: number; firstLaunch: number; asked: boolean }
export interface StarSnap { now: number; startedAt: number; quietAt: number | null; busy: boolean; syncError: boolean; conflict: boolean; unsent: boolean; off: boolean }
type Phase = 'closed' | 'ask' | 'auth' | 'consent' | 'done';
type Run = (file: string, args: readonly string[], timeoutMs: number, detached: boolean) => Promise<number>;
type Flags = { syncError: boolean; conflict: boolean; unsent: boolean };
type Snap = { message?: string; pending: number; word: string; busy: boolean };
type Bridge = { poke: () => void; askOpen: () => boolean; askSeen: () => boolean; bind: (note: () => void, key: (input: string, escape: boolean) => boolean, block: () => boolean, take: () => string, consent: () => boolean) => void; read?: () => Snap; handed?: () => boolean };
let bridge: Bridge | null = null;
const pokeStar = (): void => { bridge?.poke(); }; const updateAskOpen = (): boolean => bridge?.askOpen() ?? false; const updateAskSeen = (): boolean => bridge?.askSeen() ?? false;
export function attachStarUi(next: Bridge): void { bridge = next; if (armedDir || phase !== 'closed') bind(); pokeStar(); }
let phase: Phase = 'closed'; let text = ''; let result = ''; let guardUntil = 0; let consentGuardUntil = 0;
let clock = (): number => Date.now(); let booted = Date.now(); let armedDir: string | null = null; let counted = false; let mem: StarFile | 'bad' | null | 'stop' | undefined; let primed: StarFile | null = null;
let quietAt: number | null = null; let wasBusy = false;
let customRun: Run | null = null; let pageOpener: string | null | undefined; let forcedGh: string | null | undefined; let lastChild: ChildProcess | null = null;
const now = (): number => clock();
export function setStarNow(fn: () => number): void { clock = fn; }
export function setStarBoot(ms: number): void { booted = ms; }
export function setForcedGh(gh: string | null | undefined): void { forcedGh = gh; }
export function setPageOpener(file: string | null | undefined): void { pageOpener = file; }
export function setStarRun(fn: Run | null): void { customRun = fn; }
export function starPromptPath(dir: string): string { return join(dir, FILE); }
export function starOff(env: NodeJS.ProcessEnv, flag: boolean): boolean { return flag || env.SNOTE_STAR_PROMPT === 'off' || env.SNOTE_STAR_PROMPT === '0'; }
export function starShows(): string { return text; }
export function starConsent(): boolean { return phase === 'consent'; }
export function takeStarResult(): string { const r = result; result = ''; return r; }
export function starEnv(env: NodeJS.ProcessEnv): NodeJS.ProcessEnv {
  const out: NodeJS.ProcessEnv = {}; for (const [k, v] of Object.entries(env)) if (!k.startsWith('SNOTE_')) out[k] = v;
  out.GH_PROMPT_DISABLED = '1'; out.GH_NO_UPDATE_NOTIFIER = '1'; out.NO_COLOR = '1'; return out;
}
function replaceable(file: string): boolean {
  try { return fs.lstatSync(file).isFile(); } catch (e) { return (e as NodeJS.ErrnoException).code === 'ENOENT'; }
}
function readBody(dir: string): StarFile | null | 'bad' {
  const file = starPromptPath(dir);
  let st: fs.Stats;
  try { st = fs.lstatSync(file); } catch (e) { return (e as NodeJS.ErrnoException).code === 'ENOENT' ? null : 'bad'; }
  if (st.isSymbolicLink() || !st.isFile() || st.size > 512) return 'bad';
  let raw: string;
  try { raw = fs.readFileSync(file, 'utf8'); } catch { return 'bad'; }
  if (Buffer.byteLength(raw) > 512) return 'bad';
  try {
    const v = JSON.parse(raw) as unknown;
    if (!v || typeof v !== 'object' || Array.isArray(v)) return 'bad';
    const o = v as Record<string, unknown>;
    const keys = Object.keys(o);
    if (keys.length !== 3 || keys.some((k) => k !== 'launches' && k !== 'firstLaunch' && k !== 'asked')) return 'bad';
    if (!Number.isInteger(o.launches) || (o.launches as number) < 0 || !Number.isInteger(o.firstLaunch) || typeof o.asked !== 'boolean') return 'bad';
    return { launches: o.launches as number, firstLaunch: o.firstLaunch as number, asked: o.asked };
  } catch { return 'bad'; }
}
function writeState(dir: string, state: StarFile): boolean {
  const file = starPromptPath(dir);
  if (!replaceable(file)) return false;
  try {
    secureWriteFileSync(file, JSON.stringify({ launches: state.launches, firstLaunch: state.firstLaunch, asked: state.asked }));
    return true;
  } catch { return false; }
}
function markAsked(dir: string): boolean {
  const cur = primed ?? readBody(dir); primed = null;
  if (cur === null || cur === 'bad') return false;
  return writeState(dir, { launches: cur.launches, firstLaunch: cur.firstLaunch, asked: true });
}
export function recordLaunch(dir: string, nowMs: number): boolean {
  if (starOff(process.env, false)) return false;
  const cur = readBody(dir);
  if (cur === 'bad' || (cur !== null && cur.asked)) return false;
  const next = cur === null ? { launches: 1, firstLaunch: nowMs, asked: false } : { launches: cur.launches + 1, firstLaunch: cur.firstLaunch, asked: cur.asked };
  return writeState(dir, next);
}
export function eligible(state: StarFile, s: StarSnap): boolean {
  if (s.off || state.asked || s.busy || state.launches < MIN_LAUNCHES) return false;
  if (s.now - state.firstLaunch < MIN_DAYS * DAY_MS) return false;
  if (s.now - s.startedAt <= AGE_MS) return false;
  if (s.quietAt !== null && s.now - s.quietAt < QUIET_MS) return false;
  if ((updateAskSeen() && !updateAskOpen()) || bridge?.handed?.()) return false;
  if (updateAskOpen() || s.syncError || s.conflict || s.unsent) return false;
  return true;
}
export function tryOpen(dir: string, s: StarSnap): boolean {
  if (phase !== 'closed' || s.off || starOff(process.env, false)) return false;
  const st = readBody(dir);
  if (st === 'bad' || st === null || !eligible(st, s)) return false;
  primed = st; if (!markAsked(dir)) return false;
  showAsk(ghPath() !== null);
  return true;
}
function trusted(cand: string): string | null {
  try {
    const real = fs.realpathSync(cand);
    const st = fs.lstatSync(real);
    if (!st.isFile() || (st.mode & 0o111) === 0) return null; const uid = typeof process.getuid === 'function' ? process.getuid() : st.uid; if (st.uid !== 0 && st.uid !== uid) return null;
    if ((st.mode & 0o022) !== 0) return null; return real;
  } catch { return null; }
}
export function resolveGh(list: readonly string[] = GH_CANDIDATES): string | null {
  for (const cand of list) { const hit = trusted(cand); if (hit) return hit; }
  return null;
}
function ghPath(): string | null { return forcedGh === undefined ? resolveGh() : forcedGh; }
function defaultOpener(): string | null {
  const p = process.platform === 'darwin' ? '/usr/bin/open' : '/usr/bin/xdg-open';
  try { return fs.lstatSync(p).isFile() ? p : null; } catch { return null; }
}
function startChild(file: string, args: readonly string[], timeoutMs: number, detached: boolean): Promise<number> {
  if (customRun) return customRun(file, args, timeoutMs, detached);
  return new Promise((resolve) => {
    let code = 1; let settled = false;
    const done = (c: number): void => { if (!settled) { settled = true; resolve(c); } };
    const child = spawn(file, [...args], {
      shell: false,
      stdio: 'ignore',
      timeout: timeoutMs,
      env: starEnv(process.env),
      detached,
      killSignal: 'SIGKILL',
    });
    lastChild = child;
    if (detached) child.unref();
    child.once('error', () => done(1));
    if (detached) child.once('spawn', () => done(0));
    else { child.once('exit', (c) => { code = c === 0 ? 0 : 1; }); child.once('close', () => done(code)); }
  });
}
export function runBounded(file: string, args: readonly string[], timeoutMs: number): Promise<number> {
  return startChild(file, args, timeoutMs, false);
}
async function openPage(kind: 'opened' | 'gh-failed'): Promise<void> {
  const bin = pageOpener === undefined ? defaultOpener() : pageOpener;
  if (!bin) { finish(RESULT_BROWSER); return; }
  const code = await startChild(bin, [REPO_URL], OPEN_MS, true);
  finish(kind === 'gh-failed' ? (code === 0 ? RESULT_GH_FAILED : RESULT_BROWSER) : (code === 0 ? RESULT_OPENED : RESULT_BROWSER));
}
function finish(line: string): void { phase = 'done'; text = ''; result = line; pokeStar(); }
function showAsk(hasGh: boolean): void { phase = 'ask'; text = hasGh ? PROMPT_WITH_GH : PROMPT_NO_GH; guardUntil = now() + GUARD_MS; pokeStar(); }
function showConsent(): void { phase = 'consent'; text = CONSENT_LINE; consentGuardUntil = now() + GUARD_MS; pokeStar(); }
export function starIgnores(): boolean { return phase === 'auth' || (phase === 'ask' && now() < guardUntil) || (phase === 'consent' && now() < consentGuardUntil); }
export function starNo(): void { if (phase === 'closed' || phase === 'done') return; finish(RESULT_NO); }
export function starAsk(input: string, escape: boolean): void {
  if (phase !== 'ask' || starIgnores()) return;
  if (input === 'n' || escape) { starNo(); return; }
  if (input !== 's') return;
  const gh = ghPath();
  if (!gh) { void openPage('opened'); return; }
  phase = 'auth'; text = ''; pokeStar();
  void startChild(gh, AUTH_ARGV, AUTH_MS, false).then((code) => {
    if (phase !== 'auth') return;
    if (code === 0) showConsent(); else void openPage('gh-failed');
  });
}
export async function starYes(): Promise<void> {
  if (phase !== 'consent' || starIgnores()) return;
  const gh = ghPath();
  if (!gh) return;
  phase = 'auth'; text = ''; pokeStar();
  const code = await startChild(gh, STAR_ARGV, STAR_MS, false);
  if (phase !== 'auth') return;
  if (code === 0) finish(RESULT_STARRED); else await openPage('gh-failed');
}
export function starConsumesKey(input: string, escape: boolean): boolean {
  if (phase !== 'ask' && phase !== 'auth' && phase !== 'consent') return false;
  return starIgnores() || phase === 'consent' || input === 's' || input === 'n' || escape;
}
function noteFromApp(): void {
  const s = bridge?.read?.(); if (!s) return; const m = s.message ?? ''; const busy = s.busy; const t = now();
  const flags: Flags = { conflict: m.includes('kept both versions') || m.includes('could not be merged') || m.includes('conflicting'), unsent: s.pending > 0 || m.includes('not sent yet') || m.includes('unsynced'), syncError: s.word === 'offline' || s.word === 'stale' || m.includes('could not re-send') || m.includes('sync server') || m.includes('sync connection') };
  if ((busy && phase !== 'closed' && phase !== 'done') || ((flags.syncError || flags.conflict || flags.unsent) && (phase !== 'closed' || result !== ''))) { if (flags.syncError || flags.conflict || flags.unsent) result = ''; if (phase !== 'closed' && (phase !== 'done' || flags.syncError || flags.conflict || flags.unsent)) { phase = 'closed'; text = ''; } pokeStar(); }
  if (wasBusy && !busy) quietAt = t;
  wasBusy = busy;
  if (!armedDir || starOff(process.env, false)) return;
  consider({ now: t, startedAt: booted, quietAt, busy, ...flags, off: false });
}
function consider(s: StarSnap): void {
  const c = mem; if (!armedDir || c === 'stop' || c === undefined || phase !== 'closed') return;
  if (c === 'bad' || c === null || c.asked || c.launches < MIN_LAUNCHES) { mem = 'stop'; return; }
  if (!eligible(c, s)) return; mem = 'stop'; tryOpen(armedDir, s);
}
function bind(): void {
  bridge?.bind(noteFromApp, starConsumesKey, () => phase === 'ask' || phase === 'auth' || phase === 'consent', takeStarResult, () => phase === 'consent');
}
export function armStar(dir: string): void {
  if (starOff(process.env, false)) return;
  armedDir = dir;
  if (!counted) { counted = true; recordLaunch(dir, now()); mem = readBody(dir); }
  bind(); pokeStar();
}
export function openLineForTest(hasGh: boolean): void { bind(); showAsk(hasGh); }
export function resetStarPrompt(): void {
  lastChild?.kill('SIGKILL'); lastChild = null; phase = 'closed'; text = ''; result = ''; guardUntil = 0; consentGuardUntil = 0;
  clock = () => Date.now(); booted = Date.now(); armedDir = null; counted = false; mem = undefined; primed = null; quietAt = null; wasBusy = false; customRun = null; pageOpener = undefined; forcedGh = undefined;
}
