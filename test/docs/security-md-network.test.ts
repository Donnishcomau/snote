/**
 * Issue #201 (security build rule R7): SECURITY.md lists every network call snote makes, and the list
 * is DERIVED from the code, never from a second hand-kept list. The calls are found by reading the
 * sources: every file under src/ that imports the bounded-request helper, the websocket provider, the
 * two `git ls-remote` call sites of update-check.ts, every `git`, `curl` or `wget` network line in
 * packaging/omarchy/*, and the browser open in BarWidget.qml. A call SECURITY.md does not list fails;
 * so does a listed file with no call. Each timeout, byte cap, interval and host SECURITY.md states is
 * compared with the constant in the code. The bullets of the section name their source file in
 * backticks; the COMMAND words below are the literal words a bullet must carry for that call.
 */
import { describe, it, expect } from 'vitest';
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

const read = (p: string): string => readFileSync(join(process.cwd(), p), 'utf8');
const security = read('SECURITY.md');
const readme = read('README.md');

/** Source lines with comments dropped (// and # lines, block-comment lines). */
function code(p: string): string[] {
  return read(p).split('\n').filter((l) => !/^\s*(\/\/|#|\*|\/\*)/.test(l));
}

function walk(dir: string): string[] {
  const out: string[] = [];
  for (const name of readdirSync(join(process.cwd(), dir))) {
    const rel = `${dir}/${name}`;
    if (statSync(join(process.cwd(), rel)).isDirectory()) out.push(...walk(rel));
    else if (/\.(ts|tsx)$/.test(name)) out.push(rel);
  }
  return out.sort();
}

interface Call {
  file: string;
  /** The literal words a SECURITY.md bullet naming `file` must carry for this call. */
  command: string;
}

/** Every network call, found in the code. */
function deriveCalls(): Call[] {
  const calls: Call[] = [];
  for (const f of walk('src')) {
    const lines = code(f).join('\n');
    if (f !== 'src/core/bounded-request.ts' && /from '\.\/bounded-request'/.test(lines)) calls.push({ file: f, command: 'https' });
    if (/from 'websocket'/.test(lines)) calls.push({ file: f, command: 'wss' });
    if (/'ls-remote',\s*url,\s*'HEAD'/.test(lines)) calls.push({ file: f, command: 'git ls-remote HEAD' });
    if (/'ls-remote',\s*'--tags'/.test(lines)) calls.push({ file: f, command: 'git ls-remote --tags' });
    // any other way to reach the network is a call this test does not know yet: it must be listed on purpose
    const other = /from '(node:)?(http|https|net|tls|dgram|dns|undici)'/.test(lines) && !/from 'websocket'/.test(lines);
    if (other || (f !== 'src/core/bounded-request.ts' && /\bfetch\(/.test(lines))) calls.push({ file: f, command: 'a new kind of network call' });
  }
  for (const name of readdirSync(join(process.cwd(), 'packaging/omarchy')).sort()) {
    const f = `packaging/omarchy/${name}`;
    for (const line of code(f)) {
      if (/\bgit\b.*\bls-remote\b.*--tags/.test(line)) calls.push({ file: f, command: 'git ls-remote --tags' });
      else if (/\bgit\b.*\bfetch\b/.test(line)) calls.push({ file: f, command: 'git fetch' });
      else if (/\bgit\b.*\b(clone|pull|ls-remote)\b/.test(line)) calls.push({ file: f, command: 'a new kind of network call' });
      else if (/\b(curl|wget)\b/.test(line)) calls.push({ file: f, command: line.includes('curl') ? 'curl' : 'wget' });
    }
  }
  if (code('BarWidget.qml').some((l) => /Qt\.openUrlExternally/.test(l))) calls.push({ file: 'BarWidget.qml', command: 'your default browser' });
  const seen = new Set<string>();
  return calls.filter((c) => (seen.has(c.file + c.command) ? false : (seen.add(c.file + c.command), true)));
}

/** The bullets of `## What snote sends over the network` (each bullet joined to one line). */
function bullets(md: string): string[] {
  const start = md.indexOf('## What snote sends over the network');
  expect(start).toBeGreaterThan(-1);
  const end = md.indexOf('\n## ', start);
  const body = md.slice(start, end === -1 ? undefined : end);
  return body.split(/\n(?=- )/).filter((b) => b.startsWith('- ')).map((b) => b.split('\n\n')[0].replace(/\s+/g, ' '));
}

/** The source paths a bullet names in backticks. */
const named = (b: string): string[] => [...b.matchAll(/`((?:src|packaging)\/[^`]+|BarWidget\.qml)`/g)].map((m) => m[1]);

/** One line per drift, each naming the file. */
function drift(calls: Call[], list: string[]): string[] {
  const out: string[] = [];
  for (const c of calls) {
    if (!list.some((b) => named(b).includes(c.file) && b.includes(c.command))) out.push(`${c.file}: no bullet lists its call (${c.command})`);
  }
  const files = new Set(calls.map((c) => c.file));
  for (const b of list) {
    const n = named(b);
    if (n.length === 0) out.push(`a bullet names no source file: ${b.slice(0, 40)}`);
    for (const f of n) if (!files.has(f)) out.push(`${f}: listed, but no call site in the code`);
  }
  return out;
}

const CALLS = deriveCalls();
const BULLETS = bullets(security);
const bulletFor = (file: string, word: string): string => BULLETS.find((b) => named(b).includes(file) && b.includes(word)) ?? '';

const num = (text: string, re: RegExp): number => {
  const m = re.exec(text);
  expect(m, `constant ${re} not found`).not.toBeNull();
  return (m as RegExpExecArray)[1].split('*').reduce((a, x) => a * Number(x.trim()), 1);
};
const secs = (ms: number): string => `${ms / 1000} seconds`;
const hours = (ms: number): string => `${ms / 3600000} hours`;
const mib = (bytes: number): string => `${bytes / 1048576} MiB`;

describe('SECURITY.md lists every network call, derived from the code (#201, R7)', () => {
  it('1: WHEN the calls are derived from `src`, `packaging/omarchy` and `BarWidget.qml` THEN every call has a bullet naming its file and command, and every bullet names a file with a call', () => {
    expect(CALLS.map((c) => c.file)).toEqual(expect.arrayContaining([
      'src/core/auth.ts', 'src/core/blog-client.ts', 'src/core/websocket-provider.ts', 'src/core/update-check.ts',
      'packaging/omarchy/bar-update', 'BarWidget.qml',
    ]));
    expect(CALLS.length).toBeGreaterThanOrEqual(8);
    expect(drift(CALLS, BULLETS)).toEqual([]);
  });

  it('2: WHEN a call site SECURITY.md lacks is added THEN the check names its file, and WHEN a bullet names a file with no call THEN it names that file', () => {
    const extra: Call = { file: 'src/core/new-upload.ts', command: 'https' };
    const missing = drift([...CALLS, extra], BULLETS);
    expect(missing).toEqual([`src/core/new-upload.ts: no bullet lists its call (https)`]);
    const ghost = drift(CALLS, [...BULLETS, '- Backup: sends a copy to a server (`src/core/backup.ts`).']);
    expect(ghost).toEqual(['src/core/backup.ts: listed, but no call site in the code']);
    const unnamed = drift(CALLS, [...BULLETS, '- Backup: sends a copy to a server.']);
    expect(unnamed).toHaveLength(1);
    expect(unnamed[0]).toMatch(/^a bullet names no source file/);
  });

  it('3: WHEN each call is read THEN its bullet names the host the code uses: the login bases, `api.simperium.com`, the blog origin, and `github.com` for the update and bar calls', () => {
    const config = code('src/core/config.ts').join('\n');
    const bases = [...config.matchAll(/\?\? 'https:\/\/([^']+)'/g)].map((m) => m[1]);
    expect(bases).toEqual(['app.simplenote.com', 'auth.simperium.com']);
    for (const h of bases) expect(bulletFor('src/core/auth.ts', 'https')).toContain(h);
    const ws = read('node_modules/simperium/lib/simperium/client.js');
    expect(ws).toContain('wss://api.simperium.com/sock/1/');
    expect(bulletFor('src/core/websocket-provider.ts', 'wss')).toContain('api.simperium.com');
    const blog = /DEFAULT_BLOG_ORIGIN = 'https:\/\/([^']+)'/.exec(read('src/core/blog-origin.ts'));
    expect(blog?.[1]).toBe('skryf.art');
    expect(bulletFor('src/core/blog-client.ts', 'https')).toContain('skryf.art');
    expect(bulletFor('src/core/blog-client.ts', 'https')).toContain('SNOTE_BLOG_ORIGIN');
    expect(read('src/core/install-kind.ts')).toContain("HOMEPAGE = 'https://github.com/donnishcomau/snote'");
    expect(read('packaging/omarchy/bar-update')).toContain('home_url="https://github.com/donnishcomau/snote"');
    expect(read('BarWidget.qml')).toContain('"https://github.com/Donnishcomau/snote/releases/tag/v"');
    for (const c of CALLS.filter((x) => /update-check|bar-update|BarWidget/.test(x.file))) {
      expect(bulletFor(c.file, c.command), `${c.file} ${c.command}`).toContain('github.com');
    }
  });

  it('4: WHEN a bullet states a timeout, a cap, an interval or an opt-out THEN it equals the code constant, the overrides `SNOTE_ACCOUNT_BASE`, `SNOTE_AUTH_BASE`, `SNOTE_BLOG_ORIGIN` are named, and `Bearer` is in one file', () => {
    const auth = secs(num(read('src/core/auth.ts'), /const DEFAULT_TIMEOUT_MS = ([\d]+)/));
    const blog = secs(num(read('src/core/blog-client.ts'), /const DEFAULT_TIMEOUT_MS = ([\d]+)/));
    const cap = mib(num(read('src/core/bounded-request.ts'), /MAX_REPLY_BYTES = ([\d]+)/));
    expect(bulletFor('src/core/auth.ts', 'https')).toContain(auth);
    expect(bulletFor('src/core/auth.ts', 'https')).toContain(cap);
    expect(bulletFor('src/core/blog-client.ts', 'https')).toContain(blog);
    expect(bulletFor('src/core/blog-client.ts', 'https')).toContain(cap);
    const hand = secs(num(read('src/core/websocket-provider.ts'), /HANDSHAKE_TIMEOUT_MS = ([\d]+)/));
    expect(bulletFor('src/core/websocket-provider.ts', 'wss')).toContain(hand);
    const git = secs(num(read('src/core/update-check.ts'), /GIT_TIMEOUT_MS = ([\d]+)/));
    const ttl = hours(num(read('src/core/update-check.ts'), /CACHE_TTL_MS = ([\d *]+);/));
    const watch = hours(num(read('src/core/update-watch.ts'), /WATCH_INTERVAL_MS = ([\d *]+);/));
    expect(bulletFor('src/core/update-check.ts', 'git ls-remote HEAD')).toContain(git);
    expect(bulletFor('src/core/update-check.ts', 'git ls-remote HEAD')).toContain(ttl);
    expect(bulletFor('src/core/update-check.ts', 'git ls-remote --tags')).toContain(git);
    expect(bulletFor('src/core/update-check.ts', 'git ls-remote --tags')).toContain(watch);
    const bar = read('packaging/omarchy/bar-update');
    const net = secs(1000 * num(bar, /SNOTE_UPDATE_NET_SECS:-(\d+)\}/));
    const list = mib(num(bar, /list_cap=(\d+)/));
    const fetchCap = mib(num(bar, /dl_cap=(\d+)/));
    expect(bulletFor('packaging/omarchy/bar-update', 'git fetch')).toContain(fetchCap);
    expect(bulletFor('packaging/omarchy/bar-update', 'git fetch')).toContain('SNOTE_UPDATE_FETCH_CAP');
    const barBullet = bulletFor('packaging/omarchy/bar-update', 'git fetch');
    expect(barBullet).toContain(net);
    expect(barBullet).toContain('SNOTE_UPDATE_NET_SECS');
    expect(barBullet).toContain(list);
    for (const b of [bulletFor('src/core/update-check.ts', 'git ls-remote HEAD'), bulletFor('src/core/update-check.ts', 'git ls-remote --tags'), barBullet]) {
      expect(b).toContain('SNOTE_UPDATE_CHECK=off');
    }
    expect(code('src/core/update-check.ts').join('\n')).toMatch(/v === 'off' \|\| v === '0'/);
    expect(bar).toMatch(/SNOTE_UPDATE_CHECK:-\}" in\s+off\|0\)/);
    const bearer = walk('src').filter((f) => /Bearer/.test(code(f).join('\n')));
    expect(bearer).toEqual(['src/core/blog-client.ts']);
    expect(bulletFor('src/core/blog-client.ts', 'https')).toContain('bearer token');
    const checked = code('src/core/endpoint-check.ts').join('\n');
    const names = ['SNOTE_ACCOUNT_BASE', 'SNOTE_AUTH_BASE', 'SNOTE_BLOG_ORIGIN'];
    for (const n of names) {
      expect(checked, n).toContain(n);
      expect(security, n).toContain(n);
    }
    expect(security.replace(/\s+/g, ' ')).toContain('The `--server` sync option is not checked.');
    expect(bulletFor('src/core/blog-client.ts', 'https')).toContain('saved in `blog.json`');
    expect(security.replace(/\s+/g, ' ')).toContain('A saved blog origin is checked the same way when you send.');
    expect(bulletFor('src/core/websocket-provider.ts', 'wss')).toContain('Simperium access token');
    expect(bulletFor('packaging/omarchy/bar-update', 'git fetch')).toContain('`SNOTE_UPDATE_FETCH_CAP` can lower this');
  });

  it('5: WHEN the `## Scope` section is read THEN it names the bar plugin, setup, update, uninstall and local files, and SECURITY.md has no em dash', () => {
    const start = security.indexOf('## Scope');
    expect(start).toBeGreaterThan(-1);
    const scope = security.slice(start, security.indexOf('\n## ', start));
    for (const w of ['bar plugin', 'setup', 'update', 'uninstall', 'local files']) expect(scope.toLowerCase()).toContain(w);
    for (const w of ['Simperium sync client', 'token storage', 'terminal rendering']) expect(scope).toContain(w);
    expect(security).not.toContain('—');
    expect(existsSync(join(process.cwd(), 'packaging/omarchy/uninstall'))).toBe(true);
  });

  it('6: WHEN SECURITY.md and README.md are read THEN each says the bar update click fetches a release tag from github.com over https, that the maintainer signs the SHA256SUMS list, that snote does not check that signature yet and that setup checks the installed files against the list, and neither claims a verified or signature-checked update, and README.md is at most `199` lines', () => {
    for (const text of [security.replace(/\s+/g, ' '), readme.replace(/\s+/g, ' ')]) {
      expect(text).toMatch(/bar update click fetches a release tag from `?github\.com`? over https\./);
      expect(text).toContain('SHA256SUMS');
      expect(text).toMatch(/signed by the maintainer|the maintainer signs with a hardware key/);
      expect(text).toContain('does not check that signature yet');
      expect(text).toMatch(/setup (then )?checks the files it installs against/);
      expect(text).not.toContain('no signature or checksum');
      expect(text).not.toMatch(/tamper-proof|authenticated|verified updates|snote checks the signature|checks the signature before/i);
    }
    expect(readme.split('\n').length).toBeLessThanOrEqual(199);
    expect(readme).not.toContain('Once a day at start-up');
    expect(security).not.toContain('Once a day at start-up');
  });
});
