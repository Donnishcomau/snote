// #200: setup prints a version only after it passed the plain-version check
// that bar-update uses. A clone whose plugin-dist/VERSION holds an escape sequence or a second line is refused
// before anything is copied; an installed build's VERSION that is not plain prints as `unknown`.
// RUNNER: Linux only (setup uses flock). Every case runs in its own mkdtemp sandbox.
import { afterEach, describe, expect, it } from 'vitest';
import { existsSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { type Sandbox, cleanup, makeSandbox, runSetup, setBuild } from '../helpers/omarchy-sandbox';

let sb: Sandbox | undefined;
afterEach(() => {
  cleanup(sb);
  sb = undefined;
});

const OSC = '\u001b]52;c;QUJD\u0007';
const all = (r: { stdout: string; stderr: string }): string => r.stdout + r.stderr;

describe('packaging/omarchy/setup: the version it prints (#200)', () => {
  it('1: WHEN plugin-dist/VERSION holds anything but a plain version (an ESC byte, or a second line) THEN setup exits `1` before copying anything, says `plain version number` and no ESC byte reaches stdout or stderr', () => {
    for (const bad of [`1.0.0${OSC}`, '1.0.0\n2.0.0', '1.0.0-rc1', '..']) {
      sb = makeSandbox('1.0.0');
      setBuild(sb, bad);
      writeFileSync(join(sb.clone, 'plugin-dist', 'VERSION'), `${bad}\n`);
      const r = runSetup(sb);
      expect(r.status, JSON.stringify(bad)).toBe(1);
      expect(r.stderr).toContain('plain version number');
      expect(all(r)).not.toContain('\u001b');
      expect(existsSync(join(sb.pluginDir, 'app'))).toBe(false);
      expect(existsSync(sb.shim)).toBe(false);
      cleanup(sb);
    }
    sb = undefined;
  });

  it('2: WHEN the installed build\'s VERSION is not a plain version and setup rolls back to it THEN the message says `snote unknown is installed again` and no ESC byte reaches stdout or stderr', () => {
    sb = makeSandbox('1.0.0');
    expect(runSetup(sb).status).toBe(0);
    setBuild(sb, '2.0.0');
    expect(runSetup(sb).status).toBe(0);
    writeFileSync(join(sb.pluginDir, 'app.prev', 'VERSION'), `1.0.0${OSC}\n`);
    const r = runSetup(sb, ['--rollback']);
    expect(r.status).toBe(0);
    expect(r.stdout).toContain('snote unknown is installed again');
    expect(all(r)).not.toContain('\u001b');
  });

  it('4: WHEN plugin-dist/VERSION is `1.0.0` THEN setup installs it and its output names `1.0.0` exactly as before', () => {
    sb = makeSandbox('1.0.0');
    const first = runSetup(sb);
    expect(first.status).toBe(0);
    const again = runSetup(sb);
    expect(again.status).toBe(0);
    expect(again.stdout).toContain('snote 1.0.0 is already installed');
    expect(existsSync(join(sb.pluginDir, 'app', 'VERSION'))).toBe(true);
  });
});
