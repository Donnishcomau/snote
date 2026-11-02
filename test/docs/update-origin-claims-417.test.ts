/**
 * #417: where a local-path update origin is refused and where it is accepted is stated
 * once, and each statement is compared with the code it names. The start-up check refuses it in `homepageGuard`
 * (src/core/install-kind.ts), wired at both start-up call sites in src/cli/main.tsx. The bar update click accepts
 * it by design (packaging/omarchy/bar-update, `/*` arm), and SECURITY.md and README.md say so.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { homepageGuard } from '../../src/core/install-kind';

const read = (p: string): string => readFileSync(join(process.cwd(), p), 'utf8');
const flat = (t: string): string => t.replace(/\s+/g, ' ');

describe('#417 the local-path update origin: each place that states the rule matches the code', () => {
  it('1: WHEN the doc comment above `function remoteGitFlags` in src/core/update-check.ts is read THEN it names `homepageGuard` and `bar-update` and does not say that production refuses a local path', () => {
    const src = read('src/core/update-check.ts');
    const at = src.indexOf('function remoteGitFlags');
    expect(at).toBeGreaterThan(-1);
    const doc = flat(src.slice(src.lastIndexOf('/**', at), at));
    expect(doc).toContain('homepageGuard');
    expect(doc).toContain('bar-update');
    expect(doc).not.toContain('production refuses');
  });

  it('2: WHEN `homepageGuard` is given an `ls-remote` of a local path (--tags and HEAD, with the file-protocol flag and with the https flag set) THEN it answers `{ code: null, stdout: \'\' }` without calling the inner runner, and src/cli/main.tsx passes `run: homepageGuard()` to both start-up update calls', async () => {
    let calls = 0;
    const guard = homepageGuard(async () => {
      calls += 1;
      return { code: 0, stdout: '' };
    });
    const fileFlag = ['-c', 'protocol.file.allow=always'];
    const httpsFlags = ['credential.helper=', 'core.hooksPath=/dev/null', 'core.fsmonitor=false', 'protocol.allow=never', 'protocol.https.allow=always'].flatMap((v) => ['-c', v]);
    const opts = { cwd: '/', timeoutMs: 1000, env: {} };
    for (const flags of [fileFlag, httpsFlags]) {
      for (const args of [[...flags, 'ls-remote', '--tags', '/srv/clone'], [...flags, 'ls-remote', '/srv/clone', 'HEAD']]) {
        expect(await guard(args, opts), args.join(' ')).toEqual({ code: null, stdout: '' });
      }
    }
    expect(calls).toBe(0);
    const main = read('src/cli/main.tsx');
    expect(main.match(/run: homepageGuard\(\)/g)).toHaveLength(2);
    expect(main).toMatch(/runUpdateChecks\(\{[^}]*run: homepageGuard\(\)/);
    expect(main).toMatch(/startUpdateWatch\(\{[^}]*run: homepageGuard\(\)/);
  });

  it('3: WHEN bar-update\'s `case "$url" in` has a `/*` arm THEN README.md\'s update sentence and SECURITY.md\'s "Bar update click." bullet both say `local folder path`, and bar-update still takes that arm without a refusal', () => {
    const bar = read('packaging/omarchy/bar-update');
    expect(bar).toMatch(/^\s*\/\*\) gf\+=\(-c protocol\.file\.allow=always\) ;;$/m);
    const readme = flat(read('README.md'));
    const at = readme.indexOf('The bar update click fetches a release tag');
    expect(at).toBeGreaterThan(-1);
    expect(readme.slice(at, at + 400)).toContain('local folder path');
    const security = flat(read('SECURITY.md'));
    const click = security.slice(security.indexOf('- Bar update click.'), security.indexOf('- Release notes.'));
    expect(click).toContain('local folder path');
  });
});
