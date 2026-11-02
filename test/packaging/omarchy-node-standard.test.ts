// Issue #203: a standard Omarchy installs Node.js for every user through
// mise, so first-click setup relies on it: it never runs
// omarchy-install-dev-env, installs nothing but snote itself, downloads nothing and changes
// no mise config. In a COPY of setup, /usr/bin/mise becomes a stub and
// /usr/bin/node a missing path (the pattern of shim-args.test.ts), so the
// real find_node text is what runs. No network, no real Node install.
import { describe, it, expect, afterEach } from 'vitest';
import {
  mkdtempSync,
  rmSync,
  mkdirSync,
  writeFileSync,
  readFileSync,
  copyFileSync,
  chmodSync,
  existsSync,
  readdirSync,
} from 'node:fs';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { tmpdir } from 'node:os';

const REAL_SETUP = join(process.cwd(), 'packaging', 'omarchy', 'setup');
const REAL_UNINSTALL = join(process.cwd(), 'packaging', 'omarchy', 'uninstall');
const MISE_CONFIG = '[tools]\nnode = "lts"\n';

let tmpDir: string;

afterEach(() => {
  if (tmpDir) rmSync(tmpDir, { recursive: true, force: true });
});

function writeExec(path: string, body: string): void {
  writeFileSync(path, body);
  chmodSync(path, 0o755);
}

// Every name below records its call in <tmpDir>/calls and exits 1.
const WATCHED = ['omarchy-install-dev-env', 'curl', 'wget', 'npm', 'git', 'mise'];

// A sandbox: HOME with a mise config, a clone whose setup copy has
// /usr/bin/mise swapped for `miseStub` (or a missing path) and /usr/bin/node
// for a missing path, and a PATH dir holding recorders plus a v22 `node`.
function scaffold(miseBody: string | undefined) {
  tmpDir = mkdtempSync(join(tmpdir(), 'snote-standard-'));
  const home = join(tmpDir, 'home');
  const xdg = join(tmpDir, 'data');
  const bin = join(tmpDir, 'pathbin');
  const calls = join(tmpDir, 'calls');
  for (const d of [home, xdg, bin, join(home, '.config', 'mise')]) mkdirSync(d, { recursive: true });
  writeFileSync(join(home, '.config', 'mise', 'config.toml'), MISE_CONFIG);
  writeFileSync(calls, '');
  for (const name of WATCHED) {
    writeExec(join(bin, name), `#!/bin/sh\nprintf '%s %s\\n' ${name} "$*" >> '${calls}'\nexit 1\n`);
  }
  // A Node 22 on PATH: setup must never use it.
  writeExec(join(bin, 'node'), '#!/bin/sh\nif [ "$1" = --version ]; then echo v22.9.0; exit 0; fi\nexit 0\n');
  const fakeNode = join(tmpDir, 'mise-node');
  writeExec(fakeNode, `#!/bin/sh\nif [ "$1" = --version ]; then echo v22.1.0; exit 0; fi\nexec '${process.execPath}' "$@"\n`);
  const mise = join(tmpDir, 'mise-stub');
  writeExec(
    mise,
    miseBody === undefined
      ? `#!/bin/sh\nprintf 'mise %s\\n' "$*" >> '${calls}'\nexit 1\n`
      : `#!/bin/sh\nprintf 'mise %s\\n' "$*" >> '${calls}'\nprintf '%s\\n' '${fakeNode}'\n`
  );
  const clone = join(tmpDir, 'clone');
  mkdirSync(join(clone, 'packaging', 'omarchy'), { recursive: true });
  const text = readFileSync(REAL_SETUP, 'utf8')
    .split('/usr/bin/mise').join(mise)
    .split('/usr/bin/node').join(join(tmpDir, 'no-such-node'));
  writeFileSync(join(clone, 'packaging', 'omarchy', 'setup'), text);
  chmodSync(join(clone, 'packaging', 'omarchy', 'setup'), 0o755);
  copyFileSync(REAL_UNINSTALL, join(clone, 'packaging', 'omarchy', 'uninstall'));
  const dist = join(clone, 'plugin-dist');
  mkdirSync(dist, { recursive: true });
  writeFileSync(join(dist, 'cli.js'), "console.log('fake snote 9.9.9');\n");
  writeFileSync(join(dist, 'VERSION'), '9.9.9\n');
  return { clone, home, xdg, bin, calls };
}

function run(s: ReturnType<typeof scaffold>) {
  return spawnSync('bash', [join(s.clone, 'packaging', 'omarchy', 'setup')], {
    encoding: 'utf8',
    env: {
      PATH: `${s.bin}:${process.env.PATH ?? ''}`,
      HOME: s.home,
      XDG_DATA_HOME: s.xdg,
      // an installer override of the old test mode must stay ignored
      SNOTE_DEV_ENV_INSTALLER: join(s.bin, 'omarchy-install-dev-env'),
    },
    timeout: 8000,
    killSignal: 'SIGKILL',
  });
}

function homeFiles(home: string): string[] {
  const out: string[] = [];
  const walk = (d: string) => {
    for (const e of readdirSync(d, { withFileTypes: true })) {
      const p = join(d, e.name);
      if (e.isDirectory()) walk(p);
      else out.push(p);
    }
  };
  walk(home);
  return out.sort();
}

describe('packaging/omarchy/setup: standard Omarchy, Node.js through mise', () => {
  it('1: WHEN a fake /usr/bin/mise reports a Node 22 in the sandbox HOME THEN the first click installs the build, exits `0`, and never runs `omarchy-install-dev-env` even when it exists', () => {
    const s = scaffold('node');
    const result = run(s);

    expect(result.status).toBe(0);
    expect(existsSync(join(s.xdg, 'omarchy-snote-plugin', 'app', 'cli.js'))).toBe(true);
    expect(readFileSync(join(s.xdg, 'omarchy-snote-plugin', 'app', 'VERSION'), 'utf8')).toBe('9.9.9\n');
    const calls = readFileSync(s.calls, 'utf8');
    expect(calls).toContain('mise which node');
    expect(calls).not.toContain('omarchy-install-dev-env');
    expect(existsSync(join(s.bin, 'omarchy-install-dev-env'))).toBe(true);
  }, 10000);

  it('2: WHEN no Node.js exists anywhere (a Node 22 only on PATH) THEN setup exits `1` with `snote needs Node.js 22 or newer`, never runs `omarchy-install-dev-env`, calls no network tool, and the mise config files in the sandbox are byte-identical', () => {
    const s = scaffold(undefined);
    const before = readFileSync(join(s.home, '.config', 'mise', 'config.toml'), 'utf8');
    const filesBefore = homeFiles(s.home);
    const result = run(s);

    expect(result.status).toBe(1);
    expect(`${result.stdout}${result.stderr}`).toContain('snote needs Node.js 22 or newer');
    const calls = readFileSync(s.calls, 'utf8');
    expect(calls).not.toContain('omarchy-install-dev-env');
    for (const tool of ['curl', 'wget', 'npm', 'git']) expect(calls).not.toContain(`${tool} `);
    expect(calls).not.toContain('mise use');
    expect(calls).not.toContain('mise install');
    expect(readFileSync(join(s.home, '.config', 'mise', 'config.toml'), 'utf8')).toBe(before);
    expect(homeFiles(s.home)).toEqual(filesBefore);
    expect(existsSync(join(s.xdg, 'omarchy-snote-plugin', 'app'))).toBe(false);
  }, 10000);

  it('3: WHEN README.md and SECURITY.md are read THEN each says the first click uses the Node.js a standard Omarchy already has, through mise, and `Setup installs nothing but snote itself`, and neither contains `omarchy-install-dev-env`', () => {
    for (const file of ['README.md', 'SECURITY.md']) {
      const text = readFileSync(join(process.cwd(), file), 'utf8').replace(/\s+/g, ' ');
      expect(text, file).toContain('uses the Node.js that a standard Omarchy already has, through mise');
      expect(text, file).toContain('Setup installs nothing but snote itself');
      expect(text, file).not.toContain('omarchy-install-dev-env');
    }
  });

  it('4: WHEN packaging/omarchy/setup is read THEN `omarchy-install-dev-env` appears only inside the `node_message` assignment (a hint, never an invocation), and there is no `dev_env_installer` or `SNOTE_DEV_ENV_INSTALLER`', () => {
    const all = readFileSync(REAL_SETUP, 'utf8').split('\n');
    const hits = all.filter((l) => l.includes('omarchy-install-dev-env'));
    expect(hits.length).toBeLessThanOrEqual(1);
    for (const h of hits) expect(h.startsWith('node_message="')).toBe(true);
    const rest = all.filter((l) => !l.startsWith('node_message=')).join('\n');
    expect(rest).not.toContain('install-dev-env');
    expect(rest).not.toContain('dev_env_installer');
    expect(rest).not.toContain('SNOTE_DEV_ENV_INSTALLER');
  });
});
