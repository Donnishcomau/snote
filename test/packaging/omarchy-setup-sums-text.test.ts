// (#457): packaging/omarchy/setup refuses a symlinked SHA256SUMS, and its comments claim no
// signature check that nothing performs today.
import { mkdirSync, readdirSync, readFileSync, symlinkSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { type Sandbox, cleanup, makeSandbox, runSetup, setBuild } from '../helpers/omarchy-sandbox';

let sb: Sandbox | undefined;
afterEach(() => {
  cleanup(sb);
  sb = undefined;
});

const REFUSED = 'update refused: the download could not be verified';
const SETUP = readFileSync(join(__dirname, '..', '..', 'packaging', 'omarchy', 'setup'), 'utf8');

describe('omarchy-setup-sums-text', () => {
  it('1: WHEN the clone`s SHA256SUMS is a symlink to a complete, correct manifest, with or without --verified-update, THEN setup exits 1, prints `update refused: the download could not be verified` and app still holds 1.0.0', () => {
    for (const args of [[], ['--verified-update']]) {
      sb = makeSandbox('1.0.0');
      expect(runSetup(sb).status).toBe(0);
      setBuild(sb, '2.0.0');
      mkdirSync(join(sb.clone, 'plugin-dist', 'chunks'), { recursive: true });
      const sums = join(sb.clone, 'SHA256SUMS');
      const real = join(sb.clone, 'real-sums');
      const dist = join(sb.clone, 'plugin-dist');
      const walk = (d: string, rel = ''): string[] =>
        readdirSync(join(d, rel), { withFileTypes: true }).flatMap((e) =>
          e.isDirectory() ? walk(d, join(rel, e.name)) : [join(rel, e.name)]
        );
      const all = walk(dist).sort().map((f) => `${createHash('sha256').update(readFileSync(join(dist, f))).digest('hex')}  plugin-dist/${f}`);
      writeFileSync(real, all.join('\n') + '\n');
      symlinkSync(real, sums);
      const r = runSetup(sb, args);
      expect(r.status).toBe(1);
      expect(r.stderr).toContain(REFUSED);
      expect(readFileSync(join(sb.pluginDir, 'app', 'VERSION'), 'utf8').trim()).toBe('1.0.0');
      cleanup(sb);
      sb = undefined;
    }
  }, 30000);

  it('2: WHEN the setup file`s comments are read THEN none says the signature or the sums were verified before setup, or that a helper passes --verified-update, and they say nothing verifies the signature yet', () => {
    expect(SETUP).not.toMatch(/was verified \(signature/);
    expect(SETUP).not.toMatch(/so setup does not check the\s+# signature again/);
    expect(SETUP).not.toMatch(/the helper\) passes --verified-update/);
    expect(SETUP).toContain('nothing in this version');
    expect(SETUP).toContain('none passes it yet');
  });
});
