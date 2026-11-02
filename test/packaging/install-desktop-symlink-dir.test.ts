import { describe, it, expect, afterEach } from 'vitest';
import {
  chmodSync,
  existsSync,
  lstatSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  readlinkSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { tmpdir } from 'node:os';

const SCRIPT = join(process.cwd(), 'packaging', 'omarchy', 'install.sh');
const DESKTOP = join(process.cwd(), 'packaging', 'omarchy', 'snote.desktop');
// shell-gate.sh is private tooling, absent from the public export: test 5 skips there
const GATE = join(process.cwd(), 'scripts', 'shell-gate.sh');
const itWithGate = it.skipIf(!existsSync(GATE));

describe('install.sh and a desktop entry path that is a directory', () => {
  let root = '';

  afterEach(() => {
    if (root) rmSync(root, { recursive: true, force: true });
    root = '';
  });

  function fresh(): { apps: string; dest: string; target: string } {
    root = mkdtempSync(join(tmpdir(), 'snote-255-'));
    const apps = join(root, 'applications');
    mkdirSync(apps, { recursive: true });
    return { apps, dest: join(apps, 'snote.desktop'), target: join(apps, 'target') };
  }

  function install(extraPath?: string) {
    const env: NodeJS.ProcessEnv = { ...process.env, XDG_DATA_HOME: root };
    if (extraPath) env.PATH = `${extraPath}:${process.env.PATH ?? ''}`;
    return spawnSync('sh', [SCRIPT], { env, encoding: 'utf8' });
  }

  it('1: WHEN `applications/snote.desktop` is a symlink to the directory `applications/target` and install runs THEN it exits `1`, stderr is exactly one line containing `symlink to a directory`, stdout has no `installed`, and `applications/target` holds `0` entries', () => {
    const { dest, target } = fresh();
    mkdirSync(target);
    symlinkSync(target, dest);
    const r = install();
    expect(r.status).toBe(1);
    const lines = r.stderr.split('\n').filter(l => l.length > 0);
    expect(lines).toHaveLength(1);
    expect(lines[0]).toContain('symlink to a directory');
    expect(r.stdout).not.toContain('installed');
    expect(readdirSync(target)).toHaveLength(0);
  });

  it('2: WHEN the same symlink points at a directory and install runs THEN `applications` holds exactly the two entries `snote.desktop` and `target` (no `.snote.desktop.` scratch file is left) and the link still points at `applications/target`', () => {
    const { apps, dest, target } = fresh();
    mkdirSync(target);
    symlinkSync(target, dest);
    install();
    expect(readdirSync(apps).sort()).toEqual(['snote.desktop', 'target']);
    expect(lstatSync(dest).isSymbolicLink()).toBe(true);
    expect(readlinkSync(dest)).toBe(target);
  });

  it('3: WHEN `applications/snote.desktop` is absent THEN install exits `0`, prints `installed`, and the file is a regular file whose bytes equal `packaging/omarchy/snote.desktop`', () => {
    const { dest } = fresh();
    expect(existsSync(dest)).toBe(false);
    const r = install();
    expect(r.status).toBe(0);
    expect(r.stdout).toContain('installed');
    expect(lstatSync(dest).isFile()).toBe(true);
    expect(readFileSync(dest).equals(readFileSync(DESKTOP))).toBe(true);
  });

  it('4: WHEN `applications/snote.desktop` is a regular file holding `old` THEN install exits `0` and the file then holds the bytes of `packaging/omarchy/snote.desktop`', () => {
    const { dest } = fresh();
    writeFileSync(dest, 'old');
    const r = install();
    expect(r.status).toBe(0);
    expect(readFileSync(dest).equals(readFileSync(DESKTOP))).toBe(true);
  });

  itWithGate("5: WHEN packaging/omarchy/install.sh is read THEN no comment line says `can't write through a symlink`, a comment names the symlink to a directory case, and `bash scripts/shell-gate.sh` exits `0` with no ALLOW entry for install.sh", () => {
    const text = readFileSync(SCRIPT, 'utf8');
    const comments = text.split('\n').filter(l => l.trim().startsWith('#')).join('\n').replace(/\s*\n\s*#\s*/g, ' ');
    expect(comments).not.toContain("can't write through a symlink");
    expect(comments).toContain('symlink to a DIRECTORY');
    const gateText = readFileSync(GATE, 'utf8');
    expect(gateText).not.toMatch(/^packaging\/omarchy\/install\.sh:/m);
    const r = spawnSync('bash', [GATE], { encoding: 'utf8' });
    expect(r.status).toBe(0);
  });

  it('6: WHEN `applications/snote.desktop` is absent at the check and an `mv` first on PATH plants `applications/snote.desktop` as a symlink to the directory `applications/target` and then runs the system mv THEN `applications/target` holds `0` entries', () => {
    const { dest, target } = fresh();
    mkdirSync(target);
    const bin = join(root, 'bin');
    mkdirSync(bin);
    const shim = join(bin, 'mv');
    writeFileSync(
      shim,
      [
        '#!/bin/sh',
        'case "$*" in',
        '  *--help*) ;;',
        `  *) [ -e "${dest}" ] || [ -L "${dest}" ] || ln -s "${target}/" "${dest}" ;;`,
        'esac',
        'PATH="${PATH#*:}"',
        'exec mv "$@"',
        '',
      ].join('\n'),
    );
    chmodSync(shim, 0o755);
    install(bin);
    expect(readdirSync(target)).toHaveLength(0);
  });

  it('7: WHEN `applications/snote.desktop` is a real directory THEN install exits `1`, stdout has no `installed`, the directory holds `0` entries, and `applications` holds no `.snote.desktop.` scratch file', () => {
    const { apps, dest } = fresh();
    mkdirSync(dest);
    const r = install();
    expect(r.status).toBe(1);
    expect(r.stderr.split('\n').filter(l => l.length > 0)).toHaveLength(1);
    expect(r.stderr).toContain(dest);
    expect(r.stdout).not.toContain('installed');
    expect(readdirSync(dest)).toHaveLength(0);
    expect(readdirSync(apps).filter(n => n.startsWith('.snote.desktop.'))).toHaveLength(0);
  });

  it('8: WHEN `applications/snote.desktop` is a symlink to a symlink that points at the directory `applications/target` THEN install exits `1` and `applications/target` holds `0` entries', () => {
    const { apps, dest, target } = fresh();
    mkdirSync(target);
    const hop = join(apps, 'hop');
    symlinkSync(target, hop);
    symlinkSync(hop, dest);
    const r = install();
    expect(r.status).toBe(1);
    expect(readdirSync(target)).toHaveLength(0);
  });
});
