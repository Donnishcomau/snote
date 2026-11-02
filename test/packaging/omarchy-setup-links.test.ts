// #411 (, LOSS) and #418 part 1: packaging/omarchy/setup copies plugin-dist into its private stage with cp -R, which keeps
// a symlink as a symlink. Before this change the VERSION write, the chmod of cli.js and the swap all followed such a link, so a
// clone could truncate or re-mode a file outside the plugin folder and install links into app. Setup now refuses any entry in the
// stage that is not a regular file or a directory before it writes anything, and prints the entry only when its name is plain
// text. Linux only (flock, mkfifo). Every case runs in its own mkdtemp sandbox: 1.0.0 installed, then the clone set to 2.0.0.
import { afterEach, describe, expect, it } from 'vitest';
import {
  chmodSync,
  lstatSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  rmSync,
  statSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs';
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { join } from 'node:path';
import { type Sandbox, cleanup, makeSandbox, runSetup, setBuild } from '../helpers/omarchy-sandbox';

let boxes: Sandbox[] = [];

afterEach(() => {
  for (const b of boxes) cleanup(b);
  boxes = [];
});

const FIXED = 'snote setup: plugin-dist holds a symlink or special file. Nothing installed. Download again.';
const named = (p: string): string => `snote setup: plugin-dist/${p} is a symlink or special file. Nothing installed. Download again.`;

/** Install 1.0.0, then make the clone ship 2.0.0 with chunks/a-1.js. */
function upgradeReady(): Sandbox {
  const s = makeSandbox('1.0.0');
  boxes.push(s);
  expect(runSetup(s).status).toBe(0);
  setBuild(s, '2.0.0');
  mkdirSync(join(s.clone, 'plugin-dist', 'chunks'), { recursive: true });
  writeFileSync(join(s.clone, 'plugin-dist', 'chunks', 'a-1.js'), 'export const a = 1;\n');
  return s;
}

/** A victim file under the sandbox root, outside the plugin folder, mode 600. */
function victim(s: Sandbox, name: string, body: string): string {
  const p = join(s.root, name);
  writeFileSync(p, body);
  chmodSync(p, 0o600);
  return p;
}

const mode = (p: string): string => (statSync(p).mode & 0o777).toString(8);
const installed = (s: Sandbox): string => readFileSync(join(s.pluginDir, 'app', 'VERSION'), 'utf8').trim();
const strays = (s: Sandbox): string[] => readdirSync(s.pluginDir).filter((n) => n.startsWith('app.'));

/** Every symlink under `dir` (lstat, never followed). */
function links(dir: string): string[] {
  const out: string[] = [];
  const walk = (abs: string) => {
    for (const name of readdirSync(abs)) {
      const p = join(abs, name);
      const st = lstatSync(p);
      if (st.isSymbolicLink()) out.push(p);
      else if (st.isDirectory()) walk(p);
    }
  };
  walk(dir);
  return out;
}

const sha = (p: string): string => createHash('sha256').update(readFileSync(p)).digest('hex');

/** Every plugin-dist file, relative, sorted (stat follows links, as the release manifest's hashing does). */
function distFiles(dir: string, rel = ''): string[] {
  const out: string[] = [];
  for (const name of readdirSync(join(dir, rel)).sort()) {
    const r = rel ? `${rel}/${name}` : name;
    if (statSync(join(dir, r)).isDirectory()) out.push(...distFiles(dir, r));
    else out.push(r);
  }
  return out;
}

/** <clone>/SHA256SUMS listing every plugin-dist file, the way the release manifest does. */
function writeManifest(s: Sandbox): void {
  const dist = join(s.clone, 'plugin-dist');
  const lines = [
    `snote 2.0.0 ${'0123456789abcdef'.repeat(2)}01234567`,
    `${sha(join(s.clone, 'packaging', 'omarchy', 'setup'))}  packaging/omarchy/setup`,
    ...distFiles(dist).map((f) => `${sha(join(dist, f))}  plugin-dist/${f}`),
  ];
  writeFileSync(join(s.clone, 'SHA256SUMS'), lines.join('\n') + '\n');
}

describe('setup refuses a symlink or special file in plugin-dist before any write (#411)', () => {
  it('1: WHEN plugin-dist/VERSION is a symlink to a victim holding `2.0.0\\n\\n` and the clone has no SHA256SUMS THEN setup exits `1`, stderr names `plugin-dist/VERSION`, the victim still holds `2.0.0\\n\\n` with mode `600`, app/VERSION reads `1.0.0` and no `app.` folder is left', () => {
    const s = upgradeReady();
    const v = victim(s, 'victim-version', '2.0.0\n\n');
    rmSync(join(s.clone, 'plugin-dist', 'VERSION'));
    symlinkSync(v, join(s.clone, 'plugin-dist', 'VERSION'));
    const r = runSetup(s);
    expect(r.status).toBe(1);
    expect(r.stderr).toContain('plugin-dist/VERSION');
    expect(r.stderr).toContain(named('VERSION'));
    expect(readFileSync(v, 'utf8')).toBe('2.0.0\n\n');
    expect(mode(v)).toBe('600');
    expect(installed(s)).toBe('1.0.0');
    expect(strays(s)).toEqual([]);
  });

  it('2: WHEN the same symlinked VERSION ships with a SHA256SUMS that lists every plugin-dist file THEN setup exits `1`, the victim still holds `2.0.0\\n\\n` with mode `600` and app/VERSION reads `1.0.0`', () => {
    const s = upgradeReady();
    const v = victim(s, 'victim-version', '2.0.0\n\n');
    rmSync(join(s.clone, 'plugin-dist', 'VERSION'));
    symlinkSync(v, join(s.clone, 'plugin-dist', 'VERSION'));
    writeManifest(s);
    expect(readFileSync(join(s.clone, 'SHA256SUMS'), 'utf8')).toContain('  plugin-dist/VERSION\n');
    const r = runSetup(s);
    expect(r.status).toBe(1);
    expect(r.stderr).toContain('update refused: the download could not be verified');
    expect(readFileSync(v, 'utf8')).toBe('2.0.0\n\n');
    expect(mode(v)).toBe('600');
    expect(installed(s)).toBe('1.0.0');
    expect(strays(s)).toEqual([]);
  });

  it('3: WHEN, each in turn, `cli.js`, `chunks/a-1.js` and the `chunks` folder are symlinks to victims outside (no SHA256SUMS) THEN each run exits `1`, stderr names that entry, every victim keeps its bytes and mode `600`, and app holds `1.0.0` with no symlink in it', () => {
    for (const entry of ['cli.js', 'chunks/a-1.js', 'chunks']) {
      const s = upgradeReady();
      const target = join(s.clone, 'plugin-dist', entry);
      let checkVictim: () => void;
      if (entry === 'chunks') {
        const dir = join(s.root, 'victim-dir');
        mkdirSync(dir);
        const inner = victim(s, 'victim-dir/a-1.js', 'victim chunk\n');
        chmodSync(dir, 0o700);
        rmSync(target, { recursive: true });
        symlinkSync(dir, target);
        checkVictim = () => {
          expect(readFileSync(inner, 'utf8')).toBe('victim chunk\n');
          expect(mode(inner)).toBe('600');
          expect(mode(dir)).toBe('700');
          expect(readdirSync(dir)).toEqual(['a-1.js']);
        };
      } else {
        const body = readFileSync(target, 'utf8');
        const v = victim(s, `victim-${entry.replace('/', '-')}`, body);
        rmSync(target);
        symlinkSync(v, target);
        checkVictim = () => {
          expect(readFileSync(v, 'utf8')).toBe(body);
          expect(mode(v)).toBe('600');
        };
      }
      const r = runSetup(s);
      expect({ entry, status: r.status }).toEqual({ entry, status: 1 });
      expect(r.stderr).toContain(named(entry));
      checkVictim();
      expect(installed(s)).toBe('1.0.0');
      expect(links(join(s.pluginDir, 'app'))).toEqual([]);
      expect(strays(s)).toEqual([]);
    }
  });

  it('4: WHEN plugin-dist holds a FIFO `chunks/pipe` (no SHA256SUMS) THEN setup exits `1` within the spawn timeout, stderr names `plugin-dist/chunks/pipe`, and app/VERSION reads `1.0.0`', () => {
    const s = upgradeReady();
    const fifo = join(s.clone, 'plugin-dist', 'chunks', 'pipe');
    expect(spawnSync('mkfifo', [fifo]).status).toBe(0);
    expect(lstatSync(fifo).isFIFO()).toBe(true);
    const r = runSetup(s);
    expect(r.signal).toBeNull();
    expect(r.status).toBe(1);
    expect(r.stderr).toContain('plugin-dist/chunks/pipe');
    expect(r.stderr).toContain(named('chunks/pipe'));
    expect(installed(s)).toBe('1.0.0');
    expect(strays(s)).toEqual([]);
  });

  it('5: (pass-on-old) WHEN plugin-dist holds only regular files and folders and the clone has no SHA256SUMS THEN setup exits `0`, app/VERSION reads `2.0.0` and app holds no symlink (pass-on-old)', () => {
    const s = upgradeReady();
    const r = runSetup(s);
    expect(r.status).toBe(0);
    expect(r.stderr).not.toContain('symlink or special file');
    expect(installed(s)).toBe('2.0.0');
    expect(readFileSync(join(s.pluginDir, 'app', 'chunks', 'a-1.js'), 'utf8')).toBe('export const a = 1;\n');
    expect(links(join(s.pluginDir, 'app'))).toEqual([]);
  });

  it('6: WHEN plugin-dist holds a symlink to a victim outside whose name is `chunks/x`, ESC `]52;c;aGk=`, BEL, ESC `[2J`, a newline and `fake.js` (no SHA256SUMS) THEN setup exits `1`, stderr holds no ESC (0x1b), no BEL (0x07) and exactly one line, that line is `snote setup: plugin-dist holds a symlink or special file. Nothing installed. Download again.`, the victim keeps its bytes and mode `600`, and app/VERSION reads `1.0.0`', () => {
    const s = upgradeReady();
    const v = victim(s, 'victim-hostile', 'victim bytes\n');
    const hostile = 'x\x1b]52;c;aGk=\x07\x1b[2J\nfake.js';
    expect(hostile).toContain(']52;c;aGk=');
    expect(hostile).toContain('[2J');
    symlinkSync(v, join(s.clone, 'plugin-dist', 'chunks', hostile));
    const r = runSetup(s);
    expect(r.status).toBe(1);
    expect(r.stderr).not.toContain('\x1b');
    expect(r.stderr).not.toContain('\x07');
    expect(r.stderr.split('\n').filter((l) => l !== '')).toEqual([FIXED]);
    expect(r.stderr).toBe(`${FIXED}\n`);
    expect(r.stderr).toContain('snote setup: plugin-dist holds a symlink or special file. Nothing installed. Download again.');
    expect(readFileSync(v, 'utf8')).toBe('victim bytes\n');
    expect(mode(v)).toBe('600');
    expect(installed(s)).toBe('1.0.0');
    expect(strays(s)).toEqual([]);
  });
});
