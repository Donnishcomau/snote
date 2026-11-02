// #426: packaging/omarchy/setup read the clone's plugin-dist/VERSION with a plain `cat` before any stage existed,
// so a FIFO there (or a symlink to one) blocked setup for ever. Setup now refuses a VERSION that, followed, is not a regular file
// before it reads it, with fixed text. Linux only (mkfifo, flock). The sandbox spawn timeout (2500 ms) turns a hang into a failure.
import { afterEach, describe, expect, it } from 'vitest';
import { lstatSync, mkdirSync, readFileSync, readdirSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { join } from 'node:path';
import { type Sandbox, cleanup, makeSandbox, runSetup, setBuild } from '../helpers/omarchy-sandbox';

let boxes: Sandbox[] = [];

afterEach(() => {
  for (const b of boxes) cleanup(b);
  boxes = [];
});

const REFUSED = 'snote setup: plugin-dist/VERSION is a symlink or special file. Nothing installed. Download again.';
const UNVERIFIED = 'update refused: the download could not be verified';

const sha = (p: string): string => createHash('sha256').update(readFileSync(p)).digest('hex');
const installed = (s: Sandbox): string => readFileSync(join(s.pluginDir, 'app', 'VERSION'), 'utf8').trim();
const strays = (s: Sandbox): string[] => readdirSync(s.pluginDir).filter((n) => n.startsWith('app.'));

/** Install 1.0.0, then make the clone ship 2.0.0 and replace plugin-dist/VERSION by `place(versionPath)`. */
function upgradeWith(place: (s: Sandbox, versionPath: string) => void, withSums: boolean): Sandbox {
  const s = makeSandbox('1.0.0');
  boxes.push(s);
  expect(runSetup(s).status).toBe(0);
  setBuild(s, '2.0.0');
  const dist = join(s.clone, 'plugin-dist');
  const v = join(dist, 'VERSION');
  rmSync(v);
  place(s, v);
  if (withSums) {
    const lines = [
      `snote 2.0.0 ${'0123456789abcdef'.repeat(2)}01234567`,
      `${sha(join(s.clone, 'packaging', 'omarchy', 'setup'))}  packaging/omarchy/setup`,
      `${sha(join(dist, 'cli.js'))}  plugin-dist/cli.js`,
    ];
    writeFileSync(join(s.clone, 'SHA256SUMS'), lines.join('\n') + '\n');
  }
  return s;
}

function mkfifo(p: string): void {
  expect(spawnSync('mkfifo', [p]).status).toBe(0);
}

describe('#426 setup refuses a VERSION that is not a regular file, without blocking', () => {
  it('1: WHEN 1.0.0 is installed and the clone ships 2.0.0 whose plugin-dist/VERSION is a FIFO (no SHA256SUMS) THEN setup ends with no signal and exit `1`, stderr holds `snote setup: plugin-dist/VERSION is a symlink or special file. Nothing installed. Download again.`, app/VERSION reads `1.0.0` and no `app.` folder is left', () => {
    const s = upgradeWith((_s, v) => mkfifo(v), false);
    const r = runSetup(s);
    expect(r.signal).toBeNull();
    expect(r.status).toBe(1);
    expect(r.stderr).toContain(REFUSED);
    expect(installed(s)).toBe('1.0.0');
    expect(strays(s)).toEqual([]);
  });

  it('2: WHEN the same clone has a SHA256SUMS and plugin-dist/VERSION is a symlink to a FIFO outside the plugin folder THEN setup ends with no signal and exit `1`, stderr holds `update refused: the download could not be verified` and the line of test 1, app/VERSION reads `1.0.0` and the FIFO is still a FIFO', () => {
    let fifo = '';
    const s = upgradeWith((sb, v) => {
      mkdirSync(join(sb.root, 'outside'), { recursive: true });
      fifo = join(sb.root, 'outside', 'pipe');
      mkfifo(fifo);
      symlinkSync(fifo, v);
    }, true);
    const r = runSetup(s);
    expect(r.signal).toBeNull();
    expect(r.status).toBe(1);
    expect(r.stderr).toContain(UNVERIFIED);
    expect(r.stderr).toContain(REFUSED);
    expect(installed(s)).toBe('1.0.0');
    expect(lstatSync(fifo).isFIFO()).toBe(true);
  });
});
