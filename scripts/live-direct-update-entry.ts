// #836 (the #556 AC2 live proof), lane L5d of #30: the body of scripts/live-direct-update.mjs, bundled by it and run as
// `node <outfile>` with SNOTE_LIVE_TMP set. Two runs, each in its own throwaway HOME under SNOTE_LIVE_TMP holding a
// stand-in direct install of 0.2.11 (VERSION 0.2.11, this tree's allowed_signers, this tree's packaging/direct/install
// as update-helper):
//   1. the real L5c path: startDirectHandOff -> downloadVerified from github.com with runningVersion `0.2.11` passed as
//      a function parameter and the INSTALLED keys -> update-helper --from-stdin. It must end with the published
//      version in app/ and 0.2.11 kept as app.prev.
//   2. the same, with the fetch seam flipping one byte of the tarball: the download must be refused with the fixed line
//      and nothing installed (app/ still 0.2.11, no app.prev).
// Prints one line per run and `live-direct-update: ok` (exit 0) only when both hold. No env switch reaches shipped code.
import { spawn } from 'node:child_process';
import { copyFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

import { downloadVerified, startDirectHandOff } from '../src/core/direct-download';

const RUNNING = '0.2.11';
const tmp = process.env.SNOTE_LIVE_TMP ?? '';
if (tmp === '') {
  console.log('live-direct-update: run it through scripts/live-direct-update.mjs');
  process.exit(2);
}

/** A stand-in direct install of 0.2.11 in a fresh HOME; returns the HOME and the entry path. */
function standIn(name: string): { home: string; entry: string; app: string } {
  const home = join(tmp, name);
  const app = join(home, '.local', 'share', 'snote-app', 'app');
  mkdirSync(app, { recursive: true, mode: 0o700 });
  writeFileSync(join(app, 'cli.js'), `console.log('snote ${RUNNING}');\n`);
  writeFileSync(join(app, 'VERSION'), RUNNING + '\n');
  copyFileSync('packaging/release/allowed_signers', join(app, 'allowed_signers'));
  copyFileSync('packaging/direct/install', join(app, 'update-helper'));
  writeFileSync(join(app, 'update-helper'), readFileSync(join(app, 'update-helper')), { mode: 0o700 });
  return { home, entry: join(app, 'cli.js'), app };
}

/** fetch, but every 200 reply of more than 64 KiB (only the tarball is that large) comes back with one byte flipped. */
const flipping: typeof fetch = async (input, init) => {
  const res = await fetch(input, init);
  if (res.status !== 200) return res;
  const bytes = Buffer.from(await res.arrayBuffer());
  if (bytes.length > 65536) bytes[1000] ^= 0xff;
  return new Response(bytes, { status: 200, headers: res.headers });
};

async function run(name: string, flip: boolean): Promise<{ line: string; app: string; prev: string; code: number | null }> {
  const s = standIn(name);
  const env = { PATH: '/usr/bin:/bin', HOME: s.home, SNOTE_NODE: process.execPath };
  let exited: Promise<number | null> = Promise.resolve(null);
  const runner = ((cmd: string, args: string[], opts: object) => {
    const child = spawn(cmd, args, opts);
    exited = new Promise((done) => child.once('exit', done));
    return child;
  }) as typeof spawn;
  const r = await startDirectHandOff({
    home: s.home,
    env,
    entry: s.entry,
    log: (l) => console.log(`live-direct-update: ${name}: ${l}`),
    run: runner,
    download: (o) => downloadVerified({ ...o, runningVersion: RUNNING, ...(flip ? { fetch: flipping } : {}) }),
  });
  const code = await exited;
  const v = (d: string): string => (existsSync(join(s.home, '.local', 'share', 'snote-app', d, 'VERSION')) ? readFileSync(join(s.home, '.local', 'share', 'snote-app', d, 'VERSION'), 'utf8').trim() : '-');
  return { line: r.line, app: v('app'), prev: v('app.prev'), code };
}

const one = await run('run1', false);
console.log(`live-direct-update: run 1 (real release): line '${one.line}', helper exit ${one.code}, app ${one.app}, app.prev ${one.prev}`);
const two = await run('run2', true);
console.log(`live-direct-update: run 2 (one tarball byte flipped): line '${two.line}', app ${two.app}, app.prev ${two.prev}`);
const ok =
  one.line === '' && one.code === 0 && /^\d+\.\d+\.\d+$/.test(one.app) && one.app !== RUNNING && one.prev === RUNNING &&
  two.line === 'snote did not update: the update could not be downloaded and checked' && two.app === RUNNING && two.prev === '-';
console.log(ok ? 'live-direct-update: ok' : 'live-direct-update: FAILED');
process.exit(ok ? 0 : 1);
