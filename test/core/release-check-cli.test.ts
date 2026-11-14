/**
 * #68 (L4): `snote --verify-release` checks a fetched release with the allowed_signers beside the RUNNING
 * build's real cli.js, never a key file of the clone. Real git objects and real ssh-keygen signatures,
 * made here with throwaway ed25519 keys; nothing leaves the temp dir.
 */
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { releaseCheck } from '../../src/core/release-check-cli';

const HOOK_MS = 60_000;
const TEST_MS = 20_000;
const ENV = { PATH: process.env.PATH ?? '/usr/bin:/bin', HOME: os.tmpdir() };
const GIT_ID = ['-c', 'user.name=t', '-c', 'user.email=t@example.com'];
let root = '';

const sh = (file: string, args: string[], cwd: string): string =>
  execFileSync(file, args, { cwd, env: ENV, encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'] });
const git = (cwd: string, ...args: string[]): string => sh('git', [...GIT_ID, ...args], cwd).trim();

function key(name: string): string {
  const file = path.join(root, name);
  sh('/usr/bin/ssh-keygen', ['-q', '-t', 'ed25519', '-N', '', '-f', file], root);
  const [type, b64] = fs.readFileSync(`${file}.pub`, 'utf8').trim().split(' ');
  return `snote-release namespaces="snote-release" ${type} ${b64} ${name}\n`;
}

/** A repo whose one commit, tagged v0.2.9, holds two files and their SHA256SUMS signed by `signer`. */
function release(name: string, signer: string): { dir: string; commit: string } {
  const dir = path.join(root, name);
  fs.mkdirSync(path.join(dir, 'plugin-dist'), { recursive: true });
  git(dir, 'init', '-q', '-b', 'main');
  const files: Record<string, string> = { 'BarWidget.qml': 'bar\n', 'plugin-dist/cli.js': 'cli\n' };
  for (const [p, t] of Object.entries(files)) fs.writeFileSync(path.join(dir, p), t);
  const sums = Object.keys(files).sort().map((p) => `${createHash('sha256').update(files[p] as string).digest('hex')}  ${p}`);
  fs.writeFileSync(path.join(dir, 'SHA256SUMS'), [`snote 0.2.9 ${'a'.repeat(40)}`, ...sums, ''].join('\n'));
  sh('/usr/bin/ssh-keygen', ['-q', '-Y', 'sign', '-f', path.join(root, signer), '-n', 'snote-release', 'SHA256SUMS'], dir);
  git(dir, 'add', '-A');
  git(dir, 'commit', '-q', '-m', 'release 0.2.9');
  git(dir, 'tag', 'v0.2.9');
  return { dir, commit: git(dir, 'rev-parse', 'HEAD') };
}

function build(name: string, signers: string): string {
  const dir = path.join(root, name);
  fs.mkdirSync(dir);
  fs.writeFileSync(path.join(dir, 'cli.js'), '');
  fs.writeFileSync(path.join(dir, 'allowed_signers'), signers);
  fs.chmodSync(path.join(dir, 'allowed_signers'), 0o644);
  return path.join(dir, 'cli.js');
}

let good: { dir: string; commit: string };
let bad: { dir: string; commit: string };
let installed = '';
let pinned = '';
let foreign = '';

beforeAll(() => {
  root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'snote-68d-')));
  pinned = key('main') + key('backup');
  foreign = key('attacker') + key('attacker2');
  installed = build('installed', pinned);
  good = release('good', 'main');
  bad = release('bad', 'attacker');
  // a key file inside the fetched clone that WOULD accept the bad release
  fs.writeFileSync(path.join(bad.dir, 'allowed_signers'), foreign);
  fs.chmodSync(path.join(bad.dir, 'allowed_signers'), 0o644);
}, HOOK_MS);

afterAll(() => {
  if (root) fs.rmSync(root, { recursive: true, force: true });
});

async function check(args: string[], entry: string | undefined): Promise<{ code: number; said: string[] }> {
  const said: string[] = [];
  const code = await releaseCheck(args, '0.2.8', entry, (t) => said.push(t));
  return { code, said };
}

describe('#68 the release check uses the running build\'s own keys', () => {
  it('1: WHEN the release is signed by a pinned key of the running build THEN the check exits `0` and says nothing', async () => {
    expect(await check([good.dir, good.commit, 'v0.2.9'], installed)).toEqual({ code: 0, said: [] });
  }, TEST_MS);

  it('2: WHEN the release is signed by a key that only a file inside the fetched clone allows THEN the check exits `1` with `The release signature did not verify.`', async () => {
    expect(await check([bad.dir, bad.commit, 'v0.2.9'], installed)).toEqual({ code: 1, said: ['The release signature did not verify.'] });
  }, TEST_MS);

  it('3: WHEN cli.js is reached through a symlink in a folder that holds other keys THEN the keys beside the real cli.js decide (exit `0` for the good release)', async () => {
    const decoy = path.dirname(build('decoy', foreign));
    fs.rmSync(path.join(decoy, 'cli.js'));
    fs.symlinkSync(installed, path.join(decoy, 'cli.js'));
    expect(await check([good.dir, good.commit, 'v0.2.9'], path.join(decoy, 'cli.js'))).toEqual({ code: 0, said: [] });
  }, TEST_MS);

  it('4: WHEN the running build has no allowed_signers, the arguments are not exactly three, or the entry is unknown THEN the check exits `1`', async () => {
    const bare = path.join(root, 'bare');
    fs.mkdirSync(bare);
    fs.writeFileSync(path.join(bare, 'cli.js'), '');
    const runs = [
      await check([good.dir, good.commit, 'v0.2.9'], path.join(bare, 'cli.js')),
      await check([good.dir, good.commit], installed),
      await check([good.dir, good.commit, 'v0.2.9'], undefined),
    ];
    expect(runs.map((r) => r.code)).toEqual([1, 1, 1]);
    expect(runs[1]?.said).toEqual(['The release check needs a clone folder, a commit and a tag.']);
  }, TEST_MS);

  it('5: WHEN snote itself starts with `--verify-release` and two arguments THEN main returns `1` with `The release check needs a clone folder, a commit and a tag.` (the entry reaches this module)', async () => {
    const { main } = await import('../../src/cli/main');
    const said: string[] = [];
    expect(await main(['--verify-release', good.dir, good.commit], { log: (t) => said.push(t) })).toBe(1);
    expect(said).toEqual(['The release check needs a clone folder, a commit and a tag.']);
  }, TEST_MS);
});
