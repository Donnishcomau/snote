/**
 * #615 (GPLv2 section 2(a)): every vendored file is either byte-identical to the upstream file at
 * vendor/simplenote/UPSTREAM_COMMIT, by the sha256 that vendor/simplenote/UPSTREAM_SHA256.json records, or
 * it starts with the snote change notice. A file changed without the notice turns this test red. The JSON is
 * written by scripts/vendor.sh (every copy run, or `scripts/vendor.sh --hashes <upstream clone>`) from its FILES and
 * STUBS lists, hashing the git objects of UPSTREAM_COMMIT and never a working tree; tests 3 to 6 pin those lists, that
 * writer, that it writes nothing from a clone without that commit, and that a copy run never overwrites a STUBS file
 * (snote's own stubs of upstream modules, hashed only). Tests 7 to 9 run real git on a fixture clone (no network): the
 * writer's git ignores replace refs, never lazy-fetches (which would run the clone's core.sshCommand) and inherits no GIT_*.
 * Test 10 pins the git 2.44 floor of --hashes: an older git ignores GIT_NO_LAZY_FETCH, so it is refused (#854,).
 * Tests 7 to 9 read the host's git version once: below 2.44 each pins that refusal instead; tests 6 and 8 check why they exited 1 (#827).
 */
import { execFileSync, spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { chmodSync, copyFileSync, existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';

const ROOT = 'vendor/simplenote';
const HEADER = /^\/\/ OMARCHY: modified for snote from Automattic's simplenote-electron \(GPLv2\); see NOTICE \(\d{4}-\d{2}-\d{2}\)\.$/; // the date varies per file (#615,)
const META = ['UPSTREAM_COMMIT', 'UPSTREAM_SHA256.json'];

function walk(dir: string): string[] {
  return readdirSync(dir).flatMap((n) => {
    const p = join(dir, n);
    return statSync(p).isDirectory() ? walk(p) : [p];
  });
}
const files = walk(ROOT)
  .map((p) => p.slice(ROOT.length + 1).replace(/\\/g, '/'))
  .filter((f) => !META.includes(f));
const upstream = new Map(Object.entries(JSON.parse(readFileSync(join(ROOT, 'UPSTREAM_SHA256.json'), 'utf8')) as Record<string, string>));
const sha256 = (f: string): string => createHash('sha256').update(readFileSync(join(ROOT, f))).digest('hex');
const firstLine = (f: string): string => readFileSync(join(ROOT, f), 'utf8').split('\n')[0];
const vendorList = (name: 'FILES' | 'STUBS'): string[] => {
  const block = new RegExp(`^${name}=\\(([^)]*)\\)`, 'm').exec(readFileSync('scripts/vendor.sh', 'utf8'))?.[1] ?? '';
  return block.split(/\s+/).filter((w) => w.startsWith('lib/'));
};
const vendorFiles = (): string[] => [...vendorList('FILES'), ...vendorList('STUBS')];
const PIN = /^UPSTREAM_COMMIT=([0-9a-f]{40})/m.exec(readFileSync('scripts/vendor.sh', 'utf8'))?.[1] ?? '';
const OTHER = 'f'.repeat(40);
// a stub git on PATH: `git -C <dir> cat-file blob <rev>:<path>` prints <objects>/<rev>/<path> (HEAD is the working tree <dir>),
// exits 128 for a rev it does not hold; `git clone <url> <dest>` copies <clone> to <dest>; `git version` prints <version> (default the
// 2.44.0 floor, #854); anything else exits 0 (#615, no network)
function stubGit(t: string, objects: string, clone = '', version = 'git version 2.44.0'): NodeJS.ProcessEnv {
  mkdirSync(join(t, 'bin'), { recursive: true });
  writeFileSync(join(t, 'bin', 'git'), [
    '#!/bin/sh',
    `if [ "$1" = clone ]; then for a; do last=$a; done; cp -R '${clone}' "$last"; exit 0; fi`,
    `if [ "$1" = version ]; then printf '%s\\n' '${version}'; exit 0; fi`,
    'if [ "$3" = cat-file ]; then rev=${5%%:*}; p=${5#*:}',
    `  if [ "$rev" = HEAD ]; then f="$2/$p"; else f='${objects}'/$rev/$p; fi`,
    '  [ -f "$f" ] || exit 128; cat "$f"; exit 0; fi',
    'exit 0',
    '',
  ].join('\n'));
  chmodSync(join(t, 'bin', 'git'), 0o755);
  return { ...process.env, PATH: `${join(t, 'bin')}:${process.env.PATH}` };
}
const put = (dir: string, f: string, text: string): void => {
  mkdirSync(dirname(join(dir, f)), { recursive: true });
  writeFileSync(join(dir, f), text);
};
const hex = (text: string): string => createHash('sha256').update(text).digest('hex');
// a real git fixture clone in t/up whose one commit holds every FILES and STUBS path, and the test's vendor.sh pinned to it
const gitEnv = (t: string): NodeJS.ProcessEnv => ({
  ...Object.fromEntries(Object.entries(process.env).filter(([k]) => !k.startsWith('GIT_'))),
  HOME: t, GIT_CONFIG_NOSYSTEM: '1', GIT_CONFIG_GLOBAL: join(t, 'gitconfig'),
});
function realClone(t: string): { git: (...a: string[]) => string; want: Record<string, string>; blob: string } {
  const git = (...a: string[]): string => execFileSync('git', ['-C', join(t, 'up'), ...a], { encoding: 'utf8', env: gitEnv(t) }).trim();
  writeFileSync(join(t, 'gitconfig'), '');
  mkdirSync(join(t, 'up'));
  git('init', '-q');
  const want: Record<string, string> = {};
  for (const f of vendorFiles()) {
    put(join(t, 'up'), f, `upstream ${f}\n`);
    want[f.slice(4)] = hex(`upstream ${f}\n`);
  }
  git('add', '--', ...vendorFiles());
  git('-c', 'user.name=t', '-c', 'user.email=t@t.invalid', '-c', 'commit.gpgsign=false', 'commit', '-q', '-m', 'fixture');
  const pin = git('rev-parse', 'HEAD');
  mkdirSync(join(t, 'scripts'));
  writeFileSync(join(t, 'scripts', 'vendor.sh'), readFileSync('scripts/vendor.sh', 'utf8').replace(/^UPSTREAM_COMMIT=[0-9a-f]{40}/m, `UPSTREAM_COMMIT=${pin}`));
  put(t, 'vendor/simplenote/UPSTREAM_SHA256.json', '{"before": "this run"}\n');
  return { git, want, blob: git('rev-parse', `HEAD:${vendorList('FILES')[0]}`) };
}
const hashes = (t: string, env: NodeJS.ProcessEnv): [number | null, string, string] => {
  const r = spawnSync('bash', [join(t, 'scripts', 'vendor.sh'), '--hashes', join(t, 'up')], { encoding: 'utf8', timeout: 2500, env });
  return [r.status, r.stderr, readFileSync(join(t, 'vendor', 'simplenote', 'UPSTREAM_SHA256.json'), 'utf8')];
};
// the host's real git (tests 7 to 9): at 2.44 or later --hashes runs it; below, --hashes refuses (exit 1, the 2.44 line, JSON as it was)
const hostGit = /^git version (\d+)\.(\d+)/.exec(execFileSync('git', ['version'], { encoding: 'utf8' }));
const HOST_GIT_OK = hostGit !== null && Number(hostGit[1]) * 1000 + Number(hostGit[2]) >= 2044;
const floorSaid = (stderr: string): boolean => /needs git 2\.44 or later.*nothing written/.test(stderr);
const onHostGit = ([status, stderr, json]: [number | null, string, string]): unknown => ({ status, floor: floorSaid(stderr), hashes: JSON.parse(json) });
const hostWant = (want: Record<string, string>): unknown => (HOST_GIT_OK ? { status: 0, floor: false, hashes: want } : { status: 1, floor: true, hashes: { before: 'this run' } });

describe('#615 a vendored file that differs from upstream carries the change notice', () => {
  it('1: WHEN vendor/simplenote/UPSTREAM_SHA256.json is read THEN it lists 41 files, each of them exists under vendor/simplenote/, and every vendored file it does not list starts with the notice', () => {
    expect(upstream.size).toBe(41);
    expect([...upstream.keys()].filter((f) => !existsSync(join(ROOT, f)))).toEqual([]);
    expect(files.filter((f) => !upstream.has(f) && !HEADER.test(firstLine(f)))).toEqual([]);
  });

  it('2: WHEN each listed vendored file is hashed THEN every file whose sha256 differs from its upstream entry starts with the notice, and every file that starts with the notice differs', () => {
    const listed = files.filter((f) => upstream.has(f));
    const changedNoNotice = listed.filter((f) => sha256(f) !== upstream.get(f) && !HEADER.test(firstLine(f)));
    const noticeButSame = listed.filter((f) => sha256(f) === upstream.get(f) && HEADER.test(firstLine(f)));
    expect({ changedNoNotice, noticeButSame, changed: listed.filter((f) => sha256(f) !== upstream.get(f)).length }).toEqual({ changedNoNotice: [], noticeButSame: [], changed: 21 });
  });

  it('3: WHEN scripts/vendor.sh is read THEN its FILES and STUBS lists share no path and, without the lib/ prefix, together are exactly the 41 paths of UPSTREAM_SHA256.json', () => {
    const stubs = vendorList('STUBS');
    expect({ shared: vendorList('FILES').filter((f) => stubs.includes(f)), all: vendorFiles().map((f) => f.slice(4)).sort() }).toEqual({ shared: [], all: [...upstream.keys()].sort() });
  });

  it('4: WHEN scripts/vendor.sh --hashes runs on an upstream clone whose working tree is at another commit THEN it writes UPSTREAM_SHA256.json with the sha256 of each FILES and STUBS path at UPSTREAM_COMMIT, not of the working tree', () => {
    const t = mkdtempSync(join(tmpdir(), 'snote-vendor-hash-'));
    try {
      mkdirSync(join(t, 'scripts'));
      copyFileSync('scripts/vendor.sh', join(t, 'scripts', 'vendor.sh'));
      mkdirSync(join(t, 'vendor', 'simplenote'), { recursive: true });
      const want: Record<string, string> = {};
      for (const f of vendorFiles()) {
        put(join(t, 'objects', PIN), f, `upstream ${f}\n`);
        put(join(t, 'up'), f, `trunk ${f}\n`);
        want[f.slice(4)] = hex(`upstream ${f}\n`);
      }
      execFileSync('bash', [join(t, 'scripts', 'vendor.sh'), '--hashes', join(t, 'up')], { stdio: 'pipe', timeout: 2500, env: stubGit(t, join(t, 'objects')) });
      expect({ pin: PIN.length, hashes: JSON.parse(readFileSync(join(t, 'vendor', 'simplenote', 'UPSTREAM_SHA256.json'), 'utf8')) }).toEqual({ pin: 40, hashes: want });
    } finally {
      rmSync(t, { recursive: true, force: true });
    }
  });

  it('5: WHEN scripts/vendor.sh copies from an upstream checkout (a stub git, no network) THEN each of the 33 FILES paths holds its upstream file, each of the 8 STUBS files is unchanged byte for byte, and UPSTREAM_SHA256.json holds the UPSTREAM_COMMIT sha256 of all 41 paths', () => {
    const t = mkdtempSync(join(tmpdir(), 'snote-vendor-copy-'));
    try {
      mkdirSync(join(t, 'scripts'));
      copyFileSync('scripts/vendor.sh', join(t, 'scripts', 'vendor.sh'));
      const [copy, stubs] = [vendorList('FILES'), vendorList('STUBS')];
      const want: Record<string, string> = {};
      for (const f of vendorFiles()) {
        put(join(t, 'up'), f, `upstream ${f}\n`);
        put(join(t, 'objects', PIN), f, `upstream ${f}\n`);
        want[f.slice(4)] = hex(`upstream ${f}\n`);
      }
      for (const f of stubs) {
        mkdirSync(dirname(join(t, ROOT, f.slice(4))), { recursive: true });
        copyFileSync(join(ROOT, f.slice(4)), join(t, ROOT, f.slice(4)));
      }
      execFileSync('bash', [join(t, 'scripts', 'vendor.sh')], { stdio: 'pipe', timeout: 2500, env: stubGit(t, join(t, 'objects'), join(t, 'up')) });
      const out = (f: string): string => readFileSync(join(t, ROOT, f.slice(4)), 'utf8');
      expect({
        counts: [copy.length, stubs.length],
        notUpstream: copy.filter((f) => out(f) !== `upstream ${f}\n`),
        stubsChanged: stubs.filter((f) => out(f) !== readFileSync(join(ROOT, f.slice(4)), 'utf8')),
        hashed: JSON.parse(readFileSync(join(t, ROOT, 'UPSTREAM_SHA256.json'), 'utf8')),
      }).toEqual({ counts: [33, 8], notUpstream: [], stubsChanged: [], hashed: want });
    } finally {
      rmSync(t, { recursive: true, force: true });
    }
  });

  it('6: WHEN scripts/vendor.sh --hashes runs on a clone that does not hold UPSTREAM_COMMIT (a stub git that holds only another commit) or on a folder that is not a git clone THEN it exits non-zero, says nothing was written, and UPSTREAM_SHA256.json is left byte for byte as it was', () => {
    const t = mkdtempSync(join(tmpdir(), 'snote-vendor-refuse-'));
    try {
      mkdirSync(join(t, 'scripts'));
      copyFileSync('scripts/vendor.sh', join(t, 'scripts', 'vendor.sh'));
      const json = join(t, 'vendor', 'simplenote', 'UPSTREAM_SHA256.json');
      put(t, 'vendor/simplenote/UPSTREAM_SHA256.json', '{"before": "this run"}\n');
      for (const f of vendorFiles()) {
        put(join(t, 'objects', OTHER), f, `other ${f}\n`);
        put(join(t, 'up'), f, `other ${f}\n`);
        put(join(t, 'plain'), f, `plain ${f}\n`);
      }
      // why it exited 1: the missing commit (`has no <pin>:<path>`) or the host git's 2.44 floor (plain runs the host git)
      const run = (dir: string, env: NodeJS.ProcessEnv): unknown => {
        const r = spawnSync('bash', [join(t, 'scripts', 'vendor.sh'), '--hashes', dir], { encoding: 'utf8', timeout: 2500, env });
        return { status: r.status, floor: floorSaid(r.stderr), missing: new RegExp(`has no ${PIN}:lib/\\S+; nothing written`).test(r.stderr), json: readFileSync(json, 'utf8') };
      };
      expect({ other: run(join(t, 'up'), stubGit(t, join(t, 'objects'))), plain: run(join(t, 'plain'), process.env) }).toEqual({
        other: { status: 1, floor: false, missing: true, json: '{"before": "this run"}\n' },
        plain: { status: 1, floor: !HOST_GIT_OK, missing: HOST_GIT_OK, json: '{"before": "this run"}\n' },
      });
    } finally {
      rmSync(t, { recursive: true, force: true });
    }
  });

  it('7: WHEN scripts/vendor.sh --hashes runs on a real git clone where a replace ref swaps one FILES blob THEN UPSTREAM_SHA256.json holds the sha256 of the genuine blob of every path', () => {
    const t = mkdtempSync(join(tmpdir(), 'snote-vendor-replace-'));
    try {
      const { git, want, blob } = realClone(t);
      writeFileSync(join(t, 'swap'), 'swapped bytes\n');
      git('replace', blob, git('hash-object', '-w', join(t, 'swap')));
      expect(onHostGit(hashes(t, gitEnv(t)))).toEqual(hostWant(want));
    } finally {
      rmSync(t, { recursive: true, force: true });
    }
  });

  it('8: WHEN scripts/vendor.sh --hashes runs on a real git promisor clone missing one FILES blob whose core.sshCommand writes a marker THEN it exits 1, says nothing was written, leaves UPSTREAM_SHA256.json byte for byte as it was, and the marker does not exist', () => {
    const t = mkdtempSync(join(tmpdir(), 'snote-vendor-lazy-'));
    try {
      const { git, blob } = realClone(t);
      writeFileSync(join(t, 'ssh'), `#!/bin/sh\n: > '${join(t, 'marker')}'\nexit 1\n`);
      chmodSync(join(t, 'ssh'), 0o755);
      for (const [k, v] of [['core.repositoryformatversion', '1'], ['extensions.partialClone', 'origin'], ['remote.origin.url', 'ssh://git@example.invalid/up.git'], ['remote.origin.promisor', 'true'], ['core.sshCommand', join(t, 'ssh')]]) git('config', k, v);
      rmSync(join(t, 'up', '.git', 'objects', blob.slice(0, 2), blob.slice(2)));
      const missing = `has no ${git('rev-parse', 'HEAD')}:${vendorList('FILES')[0]}; nothing written`;
      const [status, stderr, json] = hashes(t, gitEnv(t));
      expect({ status, floor: floorSaid(stderr), missing: stderr.includes(missing), json, marker: existsSync(join(t, 'marker')) }).toEqual({ status: 1, floor: !HOST_GIT_OK, missing: HOST_GIT_OK, json: '{"before": "this run"}\n', marker: false });
    } finally {
      rmSync(t, { recursive: true, force: true });
    }
  });

  it('9: WHEN scripts/vendor.sh --hashes runs with GIT_DIR in the caller environment naming another repository THEN UPSTREAM_SHA256.json still holds the sha256 of every path from the --hashes clone', () => {
    const t = mkdtempSync(join(tmpdir(), 'snote-vendor-gitdir-'));
    try {
      const { want } = realClone(t);
      execFileSync('git', ['init', '-q', join(t, 'other')], { env: gitEnv(t) });
      expect(onHostGit(hashes(t, { ...gitEnv(t), GIT_DIR: join(t, 'other', '.git') }))).toEqual(hostWant(want));
    } finally {
      rmSync(t, { recursive: true, force: true });
    }
  });
  it('10: WHEN scripts/vendor.sh --hashes runs with a git that reports version 2.43.7 or prints no version THEN it exits 1, says it needs git 2.44 or later and that nothing was written, and leaves UPSTREAM_SHA256.json byte for byte as it was; with a git that reports 2.44.0 or 3.0.0 it writes the pinned hashes', () => {
    const t = mkdtempSync(join(tmpdir(), 'snote-vendor-gitver-'));
    try {
      mkdirSync(join(t, 'scripts'));
      copyFileSync('scripts/vendor.sh', join(t, 'scripts', 'vendor.sh'));
      const json = join(t, 'vendor', 'simplenote', 'UPSTREAM_SHA256.json');
      put(t, 'vendor/simplenote/UPSTREAM_SHA256.json', '{"before": "this run"}\n');
      const want: Record<string, string> = {};
      for (const f of vendorFiles()) {
        put(join(t, 'objects', PIN), f, `upstream ${f}\n`);
        put(join(t, 'up'), f, `trunk ${f}\n`);
        want[f.slice(4)] = hex(`upstream ${f}\n`);
      }
      const run = (version: string): [number | null, boolean, string] => {
        const r = spawnSync('bash', [join(t, 'scripts', 'vendor.sh'), '--hashes', join(t, 'up')], { encoding: 'utf8', timeout: 2500, env: stubGit(t, join(t, 'objects'), '', version) });
        return [r.status, /needs git 2\.44 or later.*nothing written/.test(r.stderr), readFileSync(json, 'utf8')];
      };
      const old = run('git version 2.43.7');
      const none = run('');
      const writes = (version: string): [number | null, unknown] => {
        const [status, , text] = run(version);
        return [status, JSON.parse(text)];
      };
      expect({ old, none, floor: writes('git version 2.44.0'), newer: writes('git version 3.0.0') }).toEqual({
        old: [1, true, '{"before": "this run"}\n'],
        none: [1, true, '{"before": "this run"}\n'],
        floor: [0, want],
        newer: [0, want],
      });
    } finally {
      rmSync(t, { recursive: true, force: true });
    }
  });
});
