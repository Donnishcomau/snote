import { describe, it, expect, afterEach } from 'vitest';
import {
  readFileSync,
  rmSync,
  writeFileSync,
  existsSync,
  mkdirSync,
  readdirSync,
  mkdtempSync,
} from 'node:fs';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { tmpdir } from 'node:os';

const SCRIPT = join(process.cwd(), 'packaging', 'omarchy', 'install.sh');
const DESKTOP = join(process.cwd(), 'packaging', 'omarchy', 'snote.desktop');

describe('omarchy packaging', () => {
  let tmpDir: string;

  afterEach(() => {
    if (tmpDir) {
      rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  it('1: WHEN snote.desktop is read THEN it has 9 non-empty lines, the first is [Desktop Entry], and it has the required lines', () => {
    tmpDir = mkdtempSync(join(tmpdir(), 'omarchy-test-'));
    const content = readFileSync(DESKTOP, 'utf8');
    const lines = content.split('\n').filter(l => l.trim().length > 0);
    expect(lines).toHaveLength(9);
    expect(lines[0]).toBe('[Desktop Entry]');
    expect(lines).toContain('Name=Simplenote');
    expect(lines).toContain('Exec=omarchy-launch-tui --app-id=TUI.float snote');
    expect(lines).toContain('Terminal=false');
    expect(lines).toContain('Type=Application');
  });

  it('2: WHEN install.sh runs with no argument in an empty tmpDir THEN install succeeds', () => {
    tmpDir = mkdtempSync(join(tmpdir(), 'omarchy-test-'));
    const appDir = join(tmpDir, 'applications');
    expect(existsSync(appDir)).toBe(false);
    const result = spawnSync('sh', [SCRIPT], {
      encoding: 'utf8',
      env: { ...process.env, XDG_DATA_HOME: tmpDir },
    });
    expect(result.status).toBe(0);
    expect(result.stdout).toContain('installed');
    expect(result.stdout).toContain(join(tmpDir, 'applications', 'snote.desktop'));
    const installed = readFileSync(join(tmpDir, 'applications', 'snote.desktop'), 'utf8');
    const source = readFileSync(DESKTOP, 'utf8');
    expect(installed).toBe(source);
    const entries = readdirSync(tmpDir);
    expect(entries).toEqual(['applications']);
  });

  it('3: WHEN install.sh --dry-run runs THEN nothing is written', () => {
    tmpDir = mkdtempSync(join(tmpdir(), 'omarchy-test-'));
    const result = spawnSync('sh', [SCRIPT, '--dry-run'], {
      encoding: 'utf8',
      env: { ...process.env, XDG_DATA_HOME: tmpDir },
    });
    expect(result.status).toBe(0);
    expect(result.stdout).toContain('would install');
    const entries = readdirSync(tmpDir);
    expect(entries).toEqual([]);
  });

  it('4: WHEN install.sh has run, test adds other.desktop, and --remove runs twice THEN only snote.desktop is removed', () => {
    tmpDir = mkdtempSync(join(tmpdir(), 'omarchy-test-'));
    // install
    const result1 = spawnSync('sh', [SCRIPT], {
      encoding: 'utf8',
      env: { ...process.env, XDG_DATA_HOME: tmpDir },
    });
    expect(result1.status).toBe(0);
    // add other.desktop
    mkdirSync(join(tmpDir, 'applications'), { recursive: true });
    writeFileSync(join(tmpDir, 'applications', 'other.desktop'), '[Desktop Entry]\nName=Other');
    // remove first time
    const result2 = spawnSync('sh', [SCRIPT, '--remove'], {
      encoding: 'utf8',
      env: { ...process.env, XDG_DATA_HOME: tmpDir },
    });
    expect(result2.status).toBe(0);
    expect(result2.stdout).toContain('removed');
    expect(existsSync(join(tmpDir, 'applications', 'snote.desktop'))).toBe(false);
    expect(existsSync(join(tmpDir, 'applications', 'other.desktop'))).toBe(true);
    // remove second time
    const result3 = spawnSync('sh', [SCRIPT, '--remove'], {
      encoding: 'utf8',
      env: { ...process.env, XDG_DATA_HOME: tmpDir },
    });
    expect(result3.status).toBe(0);
    expect(result3.stdout).toContain('removed');
  });

  it('5: WHEN the script is run directly with HOME=tmpDir and no XDG_DATA_HOME THEN file is installed under .local/share/applications', () => {
    tmpDir = mkdtempSync(join(tmpdir(), 'omarchy-test-'));
    const result = spawnSync('packaging/omarchy/install.sh', [], {
      encoding: 'utf8',
      env: { PATH: process.env.PATH, HOME: tmpDir },
    });
    expect(result.status).toBe(0);
    expect(existsSync(join(tmpDir, '.local', 'share', 'applications', 'snote.desktop'))).toBe(true);
  });

  it('6: WHEN install.sh --nope runs THEN exit code is 2, stderr contains usage, stdout is empty', () => {
    tmpDir = mkdtempSync(join(tmpdir(), 'omarchy-test-'));
    const result = spawnSync('sh', [SCRIPT, '--nope'], {
      encoding: 'utf8',
      env: { ...process.env, XDG_DATA_HOME: tmpDir },
    });
    expect(result.status).toBe(2);
    expect(result.stderr).toContain('usage: install.sh [--dry-run|--remove]');
    expect(result.stdout).toBe('');
    const entries = readdirSync(tmpDir);
    expect(entries).toEqual([]);
  });
});
