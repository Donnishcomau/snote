/**
 * #30 L5c (#340 #341 #342), the owner-approved SECURITY.md text for the one-key update of a direct install: each
 * claim is pinned next to the code fact that makes it true, so a code change that breaks a claim turns this red.
 */
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const read = (p: string): string => readFileSync(p, 'utf8');
const flat = (s: string): string => s.replace(/\s+/g, ' ');

describe('#30 L5c SECURITY.md direct install update claims', () => {
  it('1: WHEN SECURITY.md is read THEN `Nothing in snote starts this download yet` is gone, and the direct install check, download and hand-off bullets, trust on first use, app.prev and the ASSETS.SHA256SUMS signature say what src/core/direct-download.ts, src/core/token.ts, packaging/direct/install and scripts/build-plugin-dist.mjs do (30 s check, the cache and logout, the fixed failure line, the header line, the 10 s wait, the helper name)', () => {
    const doc = flat(read('SECURITY.md'));
    const dl = read('src/core/direct-download.ts');
    const helper = read('packaging/direct/install');
    expect(doc).not.toContain('Nothing in snote starts this download yet');
    expect(doc).toContain('gives up after 30 seconds');
    expect(dl).toContain('Date.now() + 30_000');
    expect(doc).toContain('saved in snote\'s own data folder as a time and a version number, nothing else');
    expect(dl).toContain("JSON.stringify({ checkedAt: now, version: r.version })");
    expect(doc).toContain('logging out removes it');
    expect(read('src/core/token.ts')).toContain("'direct-release-check.json',");
    expect(doc).toContain('`snote did not update: the update could not be downloaded and checked`');
    expect(dl).toContain("'the update could not be downloaded and checked'");
    expect(doc).toContain("first one line with the tarball's sha256 and its version");
    expect(dl).toContain("['--from-stdin']");
    expect(doc).toContain('It does not check the signature again: it reads no keys and makes no network call.');
    expect(helper).not.toMatch(/allowed_signers|ssh-keygen/);
    expect(doc).toContain('It waits up to 10 seconds for snote to quit');
    expect(helper).toContain('flock -x -w 10 9');
    expect(doc).toContain('(`packaging/direct/install`, shipped as `update-helper`)');
    expect(read('scripts/build-plugin-dist.mjs')).toContain("path.join(outDir, 'update-helper')");
    expect(doc).toContain('every later bar update and every later direct install update is checked with the keys the installed snote has at that time');
    expect(doc).toContain('An update keeps the build it replaces as `app.prev` next to the app, one copy only');
    expect(doc).toContain('Uninstall leaves only the folders the Uninstall bullet names.');
    expect(doc).not.toContain('the folders above are the only ones it leaves');
    expect(doc).toContain('(`ASSETS.SHA256SUMS.sig`) with the keys of the installed snote before it installs');
  });

  it('2: WHEN README.md is read THEN no sentence says that `U` on any install opens the bar update: that sentence names the plugin, and the direct install sentences say what its release check downloads and when, what `U` and `y` do and that the new version runs at the next start, and src/cli/main.tsx, src/core/update-handoff.ts and src/core/direct-download.ts do that', () => {
    const readme = flat(read('README.md'));
    const dl = read('src/core/direct-download.ts');
    expect(readme).not.toContain('origin. Pressing `U` in snote and answering `y` opens the same update as the bar update click.');
    expect(readme).toContain('On the plugin, pressing `U` in snote and answering `y` opens the same update as the bar update click.');
    expect(readme).toContain('On a direct install (`snote-install`), `U` and `y` work differently: snote saves your changes, downloads the newer release from github.com, checks it with the keys it already has and hands it to its update helper, which installs it once snote has quit and keeps the old build if a check fails. After a successful update, the next time you start snote, it runs the new version.');
    expect(readme).toContain('A direct install (`snote-install`) has no plugin origin. Instead, at start-up (unless a saved answer is under 24 hours old) and every 24 hours while it stays open, it downloads the release list `ASSETS.SHA256SUMS` and its signature from github.com over https. After `U` and `y` it downloads the newer release from there too. It uses a download only when the list\'s signature verifies with the keys it already has and the release matches the list. `SNOTE_UPDATE_CHECK=off` turns that check off too, and with it the banner and `U`.');
    expect(dl).toContain("const RELEASES = 'https://github.com/Donnishcomau/snote/releases/';");
    expect(dl).toContain("const LIST = 'ASSETS.SHA256SUMS';");
    expect(dl).toContain('`${RELEASES}latest/download/${LIST}.sig`');
    expect(dl).toContain('age >= 0 && age < 86_400_000');
    expect(dl).toContain("o.run(helper, ['--from-stdin']");
    expect(read('src/core/update-handoff.ts')).toContain("if (o.kind === 'direct') return (await import('./direct-download')).startDirectHandOff(");
    const main = read('src/cli/main.tsx');
    expect(main.indexOf('if (!updateCheckEnabled(process.env)) return;')).toBeGreaterThan(-1);
    expect(main.indexOf("if (kind === 'direct') return (await import('../core/direct-download')).startDirectWatch(")).toBeGreaterThan(main.indexOf('if (!updateCheckEnabled(process.env)) return;'));
  });
});
