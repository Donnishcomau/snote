/**

 * its test is in the public export, and that test's git identity is an address the export allow-list already accepts.
 * Both tests are skipped when the private export script or the private test is absent (the public tree has neither).
 */
import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const EXPORT_SCRIPT = 'scripts/publish-export.sh';
const SIGNING_TEST = 'test/packaging/release-signing.test.ts';
const OLD_ADDRESS = 't@' + 't.co';

describe.skipIf(!existsSync(EXPORT_SCRIPT))('#68 the release trust lib stays out of the public export', () => {
  it('1: WHEN `scripts/publish-export.sh --list` runs on this tree THEN it exits `0`, prints the line `exclude test/packaging/release-signing.test.ts` and prints no `include` line that names `scripts/lib`', () => {
    const r = spawnSync('bash', [EXPORT_SCRIPT, '--list'], { encoding: 'utf8', timeout: 20000, input: '' });
    expect(r.status).toBe(0);
    const lines = r.stdout.split('\n');
    expect(lines).toContain('exclude ' + SIGNING_TEST);
    expect(lines.filter((l) => l.startsWith('include ') && /scripts\/lib/.test(l))).toEqual([]);
  });
});

describe.skipIf(!existsSync(EXPORT_SCRIPT) || !existsSync(SIGNING_TEST))('#68 the release signing test git identity', () => {
  it('2: WHEN `test/packaging/release-signing.test.ts` is read THEN its git identity address is `t@example.com` and the old address (`t`, an at sign, then `t.co`) does not occur in it', () => {
    const text = readFileSync(SIGNING_TEST, 'utf8');
    expect(text).toContain('user.email=t@example.com');
    expect(text.includes(OLD_ADDRESS)).toBe(false);
  });
});
