/**
 * #68b: verifyReleaseCommit decides from the fetched git objects and the INSTALLED
 * allowed_signers only. The fixture is a real bare origin with tagged release
 * commits, each signed with ed25519 keys made here; nothing leaves the temp dir.
 */
import { execFileSync } from 'node:child_process';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { createHash } from 'node:crypto';
import { describe, it, expect, afterAll, afterEach, beforeAll, vi } from 'vitest';

import { BAD_PATH_RE, defaultProcRunner, verifyReleaseCommit } from '../../src/core/release-verify';
import type { ProcRunner } from '../../src/core/release-verify';
import { secureRemoveTree } from '../../src/core/secure-fs';

vi.mock('../../src/core/secure-fs', async (orig) => {
  const m = await orig<typeof import('../../src/core/secure-fs')>();
  return { ...m, secureRemoveTree: vi.fn(m.secureRemoveTree) };
});

/** Fixture hooks have their own limit; sized for a machine at load 50. */
const HOOK_MS = 60_000;
/** Each it() runs real git and ssh-keygen processes; 20 s keeps a machine at load 40 from failing it. */
const TEST_MS = 20_000;
const ENV = { PATH: process.env.PATH ?? '/usr/bin:/bin', HOME: os.tmpdir() };
const GIT_ID = ['-c', 'user.name=t', '-c', 'user.email=t@x'];
const roots: string[] = [];
afterEach(() => vi.unstubAllEnvs());
afterAll(() => {
  for (const r of roots.splice(0)) fs.rmSync(r, { recursive: true, force: true });
});

function sh(file: string, args: string[], cwd: string, input = ''): string {
  return execFileSync(file, args, { cwd, env: ENV, input, encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'] });
}
const git = (cwd: string, ...args: string[]): string => sh('git', [...GIT_ID, ...args], cwd).trim();
const gitIn = (cwd: string, input: Buffer, ...args: string[]): string =>
  execFileSync('git', [...GIT_ID, ...args], { cwd, env: ENV, input }).toString('utf8').trim();

interface Key { file: string; line: string }
function makeKey(root: string, name: string): Key {
  const file = path.join(root, name);
  sh('/usr/bin/ssh-keygen', ['-q', '-t', 'ed25519', '-N', '', '-f', file], root);
  const [type, b64] = fs.readFileSync(`${file}.pub`, 'utf8').trim().split(' ');
  return { file, line: `snote-release namespaces="snote-release" ${type} ${b64} ${name}\n` };
}

interface Fixture { root: string; clone: string; installed: string; main: Key; commit: (tag: string) => string }
interface Rel { version: string; signer?: Key; ns?: string; files?: Record<string, string>; extra?: Record<string, string>; drop?: string; header?: string; edit?: (m: string) => string; shape?: (m: string) => string; links?: Record<string, string> }

/** A bare origin with the given tagged releases, a clone that fetched every tag, the installed allowed_signers. */
function makeFixture(releases: Rel[]): Fixture {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'snote-68b-'));
  roots.push(root);
  const main = makeKey(root, 'main');
  const installed = path.join(root, 'installed-allowed_signers');
  fs.writeFileSync(installed, main.line + makeKey(root, 'backup').line);
  fs.chmodSync(installed, 0o644);
  const build = path.join(root, 'build');
  fs.mkdirSync(build);
  git(build, 'init', '-q', '-b', 'main');
  for (const rel of releases) {
    const files: Record<string, string> = {
      'BarWidget.qml': `bar ${rel.version}\n`,
      'plugin-dist/cli.js': `cli ${rel.version}\n`,
      'packaging/release/allowed_signers': main.line,
      ...rel.files,
    };
    for (const p of fs.readdirSync(build)) if (p !== '.git') fs.rmSync(path.join(build, p), { recursive: true });
    for (const [p, t] of Object.entries(rel.links ?? {})) {
      fs.mkdirSync(path.dirname(path.join(build, p)), { recursive: true });
      fs.symlinkSync(t, path.join(build, p));
      files[p] = t;
    }
    for (const [p, c] of Object.entries(files).filter(([p]) => !(p in (rel.links ?? {})))) {
      fs.mkdirSync(path.dirname(path.join(build, p)), { recursive: true });
      fs.writeFileSync(path.join(build, p), c);
    }
    const sums = Object.keys(files).filter((p) => p !== rel.drop).sort()
      .map((p) => `${createHash('sha256').update(files[p] as string).digest('hex')}  ${p}`);
    let manifest = `${rel.header ?? `snote ${rel.version} ${'c'.repeat(40)}`}\n${sums.join('\n')}\n`;
    if (rel.shape) manifest = rel.shape(manifest);
    fs.writeFileSync(path.join(build, 'SHA256SUMS'), manifest);
    const key = rel.signer ?? main;
    sh('/usr/bin/ssh-keygen', ['-Y', 'sign', '-f', key.file, '-n', rel.ns ?? 'snote-release', 'SHA256SUMS'], build);
    if (rel.edit) manifest = rel.edit(manifest);
    fs.writeFileSync(path.join(build, 'SHA256SUMS'), manifest);
    for (const [p, c] of Object.entries(rel.extra ?? {})) fs.writeFileSync(path.join(build, p), c);
    git(build, 'add', '-A');
    git(build, 'commit', '-q', '-m', `release ${rel.version}`);
    git(build, 'tag', `v${rel.version}`);
  }
  const origin = path.join(root, 'origin.git');
  git(root, 'clone', '-q', '--bare', build, origin);
  const clone = path.join(root, 'clone');
  git(root, 'clone', '-q', origin, clone);
  git(clone, 'fetch', '-q', 'origin', '--tags');
  return { root, clone, installed, main, commit: (tag) => git(clone, 'rev-list', '-n1', tag) };
}

const verify = (f: Fixture, tag: string, running = '0.2.8', run?: ProcRunner) =>
  verifyReleaseCommit({ cloneDir: f.clone, commit: f.commit(tag), tag, runningVersion: running, allowedSignersPath: f.installed, run });

const GOOD_OUT = Buffer.from('Good "snote-release" signature for snote-release with ED25519 key SHA256:x\n');

describe('#68b2 release verifier', () => {
  // The fixtures (real git repos signed with ssh-keygen) are built in beforeAll hooks, one per
  // fixture, so a loaded machine cannot push a test past its 3 s limit; the hook limit is separate.
  const fx: Record<string, Fixture> = {};
  const lines = (m: string): string[] => m.trimEnd().split('\n');
  let attackerKey: Key = { file: '', line: '' };
  beforeAll(() => {
    // three files of 400 KB: more than one 1 MiB read, so the blobs are read in 2 batches
    const big = { 'plugin-dist/big-a.js': 'a'.repeat(400_000), 'plugin-dist/big-b.js': 'b'.repeat(400_000), 'plugin-dist/big-c.js': 'c'.repeat(400_000) };
    fx.call = makeFixture([{ version: '0.2.9', files: big }]);
  }, HOOK_MS);
  beforeAll(() => {
    fx.shapes = makeFixture([
      { version: '0.2.9', extra: { 'plugin-dist/cli.js': 'tampered\n' } },
      { version: '0.3.0', files: { 'plugin-dist/extra.js': 'x\n' }, drop: 'plugin-dist/extra.js' },
      { version: '0.3.1', extra: { 'plugin-dist/new.js': 'unlisted\n' } },
      { version: '0.3.2', shape: (m) => { const l = lines(m); return [l[0], l[2], l[1], ...l.slice(3)].join('\n') + '\n'; } },
      { version: '0.3.3', shape: (m) => { const l = lines(m); return [...l, l[1]].join('\n') + '\n'; } },
      { version: '0.3.6', files: { 'plugin-dist/back\\slash.js': 'x\n' } },
      { version: '0.3.5', links: { 'plugin-dist/link.js': 'cli.js' } },
      { version: '0.3.7', files: { 'plugin-dist/huge.js': 'h'.repeat(1048576 + 1) } },
    ]);
  }, HOOK_MS);
  beforeAll(() => {
    fx.dots = makeFixture([{ version: '0.2.9', files: { 'plugin-dist/a..b.js': 'x\n' } }]);
    fx.twice = makeFixture([{ version: '0.2.9' }]);
    // nine distinct files of 1,000,000 bytes: over the 8388608-byte tree cap, each one fits a read
    const nine = Object.fromEntries([...'abcdefghi'].map((c) => [`plugin-dist/n-${c}.js`, c.repeat(1_000_000)]));
    fx.large = makeFixture([{ version: '0.2.9', files: nine }]);
  }, HOOK_MS);
  beforeAll(() => {
    const root0 = fs.mkdtempSync(path.join(os.tmpdir(), 'snote-68b-k-'));
    roots.push(root0);
    attackerKey = makeKey(root0, 'attacker');
    fx.attacker = makeFixture([{ version: '0.2.9', signer: attackerKey, files: { 'packaging/release/allowed_signers': attackerKey.line } }]);
  }, HOOK_MS);
  beforeAll(() => {
    fx.plain = makeFixture([{ version: '0.2.9' }]);
  }, HOOK_MS);
  beforeAll(() => {
    fx.versions = makeFixture([
      { version: '0.2.8' },
      { version: '0.2.7' },
      { version: '0.2.9', ns: 'other-namespace' },
      { version: '0.3.0', header: `snote 0.3.1 ${'c'.repeat(40)}` },
    ]);
  }, HOOK_MS);
  beforeAll(() => {
    fx.tree = makeFixture([{ version: '0.2.9' }]);
  }, HOOK_MS);
  beforeAll(() => {
    fx.ssh = makeFixture([{ version: '0.2.9' }]);
  }, HOOK_MS);

  it('1: WHEN a newer release is signed by an installed key THEN it verifies and returns `0.2.9`, its files of more than 1 MiB are read in `2` batches, and ssh-keygen gets exactly the argv, the env `PATH=/usr/bin:/bin` and `LC_ALL=C`, and the signed manifest on stdin', async () => {
    vi.stubEnv('SSH_AUTH_SOCK', '/tmp/agent.sock');
    const f = fx.call as Fixture;
    const calls: Array<{ file: string; args: string[]; env: NodeJS.ProcessEnv; input?: Buffer }> = [];
    const run: ProcRunner = (file, args, o) => {
      calls.push({ file, args, env: o.env, input: o.input });
      return defaultProcRunner(file, args, o);
    };
    expect(await verify(f, 'v0.2.9', '0.2.8', run)).toEqual({ ok: true, version: '0.2.9' });
    const ssh = calls.filter((c) => c.file === '/usr/bin/ssh-keygen');
    expect(ssh).toHaveLength(1);
    expect(ssh[0]?.args.slice(0, 8)).toEqual(['-Y', 'verify', '-f', f.installed, '-I', 'snote-release', '-n', 'snote-release']);
    expect(ssh[0]?.args[8]).toBe('-s');
    expect(ssh[0]?.args).toHaveLength(10);
    expect(ssh[0]?.env).toEqual({ PATH: '/usr/bin:/bin', LC_ALL: 'C' });
    expect(ssh[0]?.input?.toString('utf8')).toBe(git(f.clone, 'show', `${f.commit('v0.2.9')}:SHA256SUMS`) + '\n');
    expect(calls.filter((c) => c.file === 'git' && c.args.includes('cat-file')).length).toBe(2);
  }, TEST_MS);

  it('2: WHEN a file differs, a file is extra or missing, a file is over `1048576` bytes, the manifest is unsorted or has a duplicate, a `..` segment, a backslash, a C1 control or a bidi character in a path, or the tree holds a symlink or the same path twice, or a blob read returns a byte more or less, or the tree is over `8388608` bytes THEN the release is refused, while `a..b` is accepted', async () => {
    const f = fx.shapes as Fixture;
    const tags = ['v0.2.9', 'v0.3.0', 'v0.3.1', 'v0.3.2', 'v0.3.3', 'v0.3.5', 'v0.3.6', 'v0.3.7'];
    const results = await Promise.all(tags.map((tag) => verify(f, tag)));
    results.forEach((r, i) => expect(r.ok, tags[i]).toBe(false));
    for (const bad of ['..', '../x', 'x/..', 'x/../y', '/abs', 'a\\b', 'c1\u0085x', 'bidi\u202ex', 'bidi\u2066x', 'nl\nx']) expect(BAD_PATH_RE.test(bad), bad).toBe(true);
    for (const ok of ['a..b', 'plugin-dist/a..b.js', '.hidden', 'x/y.z']) expect(BAD_PATH_RE.test(ok), ok).toBe(false);
    expect(await verify(fx.dots as Fixture, 'v0.2.9')).toEqual({ ok: true, version: '0.2.9' });
    // the same path twice in one tree (git mktree and hash-object --literally allow it): the unlisted copy comes first
    const d = fx.twice as Fixture;
    const evil = gitIn(d.clone, Buffer.from('evil\n'), 'hash-object', '-w', '--stdin');
    const raw = git(d.clone, 'ls-tree', d.commit('v0.2.9')).split('\n').flatMap((l) => {
      const [meta, name] = l.split('\t') as [string, string];
      const [mode, , id] = meta.split(' ') as [string, string, string];
      const ent = (m: string, oid: string): Buffer[] => [Buffer.from(`${m.replace(/^0+/, '')} ${name}\0`), Buffer.from(oid, 'hex')];
      return name === 'BarWidget.qml' ? [...ent('100644', evil), ...ent(mode, id)] : ent(mode, id);
    });
    const tree = gitIn(d.clone, Buffer.concat(raw), 'hash-object', '-t', 'tree', '-w', '--literally', '--stdin');
    const twice = gitIn(d.clone, Buffer.alloc(0), 'commit-tree', tree, '-m', 'twice');
    const r2 = await verifyReleaseCommit({ cloneDir: d.clone, commit: twice, tag: 'v0.2.9', runningVersion: '0.2.8', allowedSignersPath: d.installed });
    expect(r2, 'same path twice').toEqual({ ok: false, reason: 'The release holds a file twice.' });
    // the batch reader takes exactly the requested records: one byte more or less is refused
    const g = fx.dots as Fixture;
    const reshape = (cut: (b: Buffer) => Buffer): ProcRunner => (file, args, o) =>
      args.includes('cat-file') ? defaultProcRunner(file, args, o).then((x) => ({ code: x.code, stdout: cut(x.stdout) })) : defaultProcRunner(file, args, o);
    const odd = [reshape((b) => Buffer.concat([b, Buffer.from('x')])), reshape((b) => b.subarray(0, b.length - 1))];
    for (const run of odd) expect(await verify(g, 'v0.2.9', '0.2.8', run), 'byte more or less').toEqual({ ok: false, reason: 'The release files could not be read.' });
    // the whole tree is capped before any blob is read: no cat-file runs
    const large = fx.large as Fixture;
    expect(Number(git(large.clone, 'ls-tree', '-r', '-l', large.commit('v0.2.9'), 'plugin-dist').split('\n').reduce((n, l) => n + Number(l.split(/\s+/)[3]), 0))).toBeGreaterThan(8388608);
    const reads: string[][] = [];
    const counted: ProcRunner = (file, args, o) => { reads.push(args); return defaultProcRunner(file, args, o); };
    expect(await verify(large, 'v0.2.9', '0.2.8', counted), 'over 8388608').toEqual({ ok: false, reason: 'The release is larger than 8 MiB.' });
    expect(reads.filter((a) => a.includes('cat-file'))).toHaveLength(0);
  }, TEST_MS);

  it('3: WHEN a release is signed by a key not in the installed allowed_signers, even when it carries that key, or the installed file is a symlink THEN it is refused and a symlinked file never reaches ssh-keygen', async () => {
    const f = fx.attacker as Fixture;
    expect((await verify(f, 'v0.2.9')).ok).toBe(false);
    expect(git(f.clone, 'show', `${f.commit('v0.2.9')}:packaging/release/allowed_signers`)).toContain(attackerKey.line.trim());
    const g = fx.plain as Fixture;
    const link = path.join(g.root, 'link-signers');
    fs.symlinkSync(g.installed, link);
    const seen: string[] = [];
    const run: ProcRunner = (file, args, o) => { seen.push(file); return defaultProcRunner(file, args, o); };
    const r = await verifyReleaseCommit({ cloneDir: g.clone, commit: g.commit('v0.2.9'), tag: 'v0.2.9', runningVersion: '0.2.8', allowedSignersPath: link, run });
    expect(r.ok).toBe(false);
    expect(seen).not.toContain('/usr/bin/ssh-keygen');
  }, TEST_MS);

  it('4: WHEN a signed release is equal to or older than the running version, has another namespace, or its version line differs from the tag THEN it is refused', async () => {
    const f = fx.versions as Fixture;
    const tags = ['v0.2.8', 'v0.2.7', 'v0.2.9', 'v0.3.0'];
    const results = await Promise.all(tags.map((tag) => verify(f, tag, '0.2.8')));
    results.forEach((r, i) => expect(r.ok, tags[i]).toBe(false));
  }, TEST_MS);

  it('5: WHEN a work tree file is changed after the fetch THEN the result is unchanged, read from the fetched blobs', async () => {
    const f = fx.tree as Fixture;
    git(f.clone, 'checkout', '-q', '--detach', 'v0.2.9');
    expect(await verify(f, 'v0.2.9')).toEqual({ ok: true, version: '0.2.9' });
    fs.writeFileSync(path.join(f.clone, 'plugin-dist/cli.js'), 'changed after the fetch\n');
    fs.rmSync(path.join(f.clone, 'BarWidget.qml'));
    expect(await verify(f, 'v0.2.9')).toEqual({ ok: true, version: '0.2.9' });
  }, TEST_MS);

  it('6: WHEN ssh-keygen is absent, exits `255`, or exits 0 printing nothing THEN the release is refused, and an absent ssh-keygen says `update refused: OpenSSH (ssh-keygen) is needed to verify updates`', async () => {
    const f = fx.ssh as Fixture;
    const base = { cloneDir: f.clone, commit: f.commit('v0.2.9'), tag: 'v0.2.9', runningVersion: '0.2.8', allowedSignersPath: f.installed };
    expect(await verifyReleaseCommit({ ...base, sshKeygenPath: path.join(f.root, 'no-such-ssh-keygen') })).toEqual({
      ok: false,
      reason: 'update refused: OpenSSH (ssh-keygen) is needed to verify updates',
    });
    const fake = (code: number, out: Buffer): ProcRunner => (file, args, o) =>
      file === '/usr/bin/ssh-keygen' ? Promise.resolve({ code, stdout: out }) : defaultProcRunner(file, args, o);
    expect((await verifyReleaseCommit({ ...base, run: fake(255, Buffer.alloc(0)) })).ok).toBe(false);
    expect((await verifyReleaseCommit({ ...base, run: fake(0, Buffer.alloc(0)) })).ok).toBe(false);
    expect((await verifyReleaseCommit({ ...base, run: fake(0, GOOD_OUT) })).ok).toBe(true);
  }, TEST_MS);

  it('7: WHEN the installed allowed_signers holds one key and the same key with `==` added THEN it is refused as the same key twice, and ssh-keygen is never run', async () => {
    const g = fx.plain as Fixture;
    const parts = g.main.line.trimEnd().split(' ');
    parts[3] = `${parts[3]}==`;
    const padded = path.join(g.root, 'padded-allowed_signers');
    fs.writeFileSync(padded, g.main.line + parts.join(' ') + '\n');
    fs.chmodSync(padded, 0o644);
    const seen: string[] = [];
    const run: ProcRunner = (file, args, o) => { seen.push(file); return defaultProcRunner(file, args, o); };
    const r = await verifyReleaseCommit({ cloneDir: g.clone, commit: g.commit('v0.2.9'), tag: 'v0.2.9', runningVersion: '0.2.8', allowedSignersPath: padded, run });
    expect(r).toEqual({ ok: false, reason: 'allowed_signers holds the same key twice.' });
    expect(seen).not.toContain('/usr/bin/ssh-keygen');
  }, TEST_MS);

  it('8: WHEN the installed allowed_signers comments carry a C1 control and a bidi character THEN a good release still verifies, and neither a good result nor a refusal holds the file text, a comment or any such character', async () => {
    const shown = /[\u0080-\u009f\u202a-\u202e\u2066-\u2069]|hostile|snote-release namespaces/;
    const withComments = (f: Fixture, keys: Key[], name: string): string => {
      const file = path.join(f.root, name);
      fs.writeFileSync(file, keys.map((k) => `${k.line.trimEnd()} hostile\u009b\u202ecomment\n`).join(''));
      fs.chmodSync(file, 0o644);
      return file;
    };
    const g = fx.plain as Fixture;
    const good = await verifyReleaseCommit({ cloneDir: g.clone, commit: g.commit('v0.2.9'), tag: 'v0.2.9', runningVersion: '0.2.8', allowedSignersPath: withComments(g, [g.main, makeKey(g.root, 'second')], 'commented-allowed_signers') });
    expect(good).toEqual({ ok: true, version: '0.2.9' });
    expect(JSON.stringify(good)).not.toMatch(shown);
    const a = fx.attacker as Fixture;
    const bad = await verifyReleaseCommit({ cloneDir: a.clone, commit: a.commit('v0.2.9'), tag: 'v0.2.9', runningVersion: '0.2.8', allowedSignersPath: withComments(a, [a.main, makeKey(a.root, 'second')], 'commented-allowed_signers') });
    expect(bad.ok).toBe(false);
    expect(JSON.stringify(bad)).not.toMatch(shown);
  }, TEST_MS);

  it('9: WHEN the running version is not `<1-6 digits>.<1-6 digits>.<1-6 digits>` with an optional fourth part (`0.2.9-dev`, `0.2.9+local`, `v0.2.9`, `0.2`, `0.2.8.1.1`, `1234567.0.0`, ` 0.2.8`, `0.2.8` with a trailing newline, an empty string, a missing value) THEN a genuinely signed older release (`0.2.7`) is refused with `The running version is not a plain version number.` before any git or ssh-keygen process runs, while running `0.2.6.1` still verifies `0.2.7` (V465-01)', async () => {
    const f = fx.versions as Fixture;
    const started: string[] = [];
    const run: ProcRunner = (file, args, o) => {
      started.push(file);
      return defaultProcRunner(file, args, o);
    };
    const bad = ['0.2.9-dev', '0.2.9+local', 'v0.2.9', '0.2', '0.2.8.1.1', '1234567.0.0', ' 0.2.8', '0.2.8\n', '', null as unknown as string];
    for (const running of bad) {
      expect(await verify(f, 'v0.2.7', running, run), JSON.stringify(running)).toEqual({ ok: false, reason: 'The running version is not a plain version number.' });
    }
    expect(started).toEqual([]);
    expect(await verify(f, 'v0.2.7', '0.2.6.1')).toEqual({ ok: true, version: '0.2.7' });
  }, TEST_MS);

  it('10: WHEN removing the private temp dir throws `EACCES` after a good release and after a refused one THEN each result is the same as without the failure and `verifyReleaseCommit` does not throw (V465-02)', async () => {
    const rm = vi.mocked(secureRemoveTree);
    const left: string[] = [];
    const failing = (p: string): void => {
      left.push(p);
      throw Object.assign(new Error(`EACCES: permission denied, rmdir '${p}'`), { code: 'EACCES' });
    };
    try {
      rm.mockImplementationOnce(failing);
      expect(await verify(fx.plain as Fixture, 'v0.2.9')).toEqual({ ok: true, version: '0.2.9' });
      rm.mockImplementationOnce(failing);
      expect(await verify(fx.versions as Fixture, 'v0.2.7', '0.2.8')).toEqual({ ok: false, reason: 'The release is not newer than the running version.' });
      expect(left).toHaveLength(2);
    } finally {
      for (const p of left) fs.rmSync(p, { recursive: true, force: true });
    }
  }, TEST_MS);
});
