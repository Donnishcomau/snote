/**
 * #445: README and SECURITY.md give the Homebrew install and update path for Linux, with the Homebrew-first link and no
 * "one step" claim; SECURITY.md says what the sha256 and the release check cover. No macOS install line until #351.
 */
import * as fs from 'node:fs';
import * as path from 'node:path';
import { describe, it, expect } from 'vitest';

const readme = fs.readFileSync(path.join(process.cwd(), 'README.md'), 'utf8');
const security = fs.readFileSync(path.join(process.cwd(), 'SECURITY.md'), 'utf8');
const section = (text: string, heading: string): string => {
  const at = text.indexOf(heading + '\n');
  const next = text.indexOf('\n## ', at + heading.length);
  return at < 0 ? '' : text.slice(at, next < 0 ? undefined : next);
};

describe('#445 Homebrew install and update text', () => {
  it('1: WHEN README.md is read THEN `## Install on other Linux (Homebrew)` comes after `## Install on Omarchy` and before `## Updating`, links https://brew.sh before `brew install donnishcomau/snote/snote`, and says Homebrew installs Node.js', () => {
    const om = readme.indexOf('## Install on Omarchy\n');
    const hb = readme.indexOf('## Install on other Linux (Homebrew)\n');
    const up = readme.indexOf('## Updating\n');
    expect([om > -1, hb > om, up > hb]).toEqual([true, true, true]);
    const s = section(readme, '## Install on other Linux (Homebrew)');
    expect(s.indexOf('https://brew.sh')).toBeGreaterThan(-1);
    expect(s.indexOf('then run `brew install donnishcomau/snote/snote`')).toBeGreaterThan(s.indexOf('https://brew.sh'));
    expect(s).toContain('Homebrew installs Node.js for snote');
  });

  it('2: WHEN README.md is read THEN `## Updating` opens with the Homebrew sentence naming `brew upgrade snote` as the only Homebrew updater, before `To update snote, run `omarchy plugin update`, so no plugin sentence follows it as a Homebrew statement, and neither README.md nor SECURITY.md says `one step` or `one-step`, and the Homebrew section has no `macOS` line (#939 review)', () => {
    const hb = 'A Homebrew install updates only with `brew upgrade snote`: it does not check for updates itself and does not offer the in-app update.';
    const open = '## Updating\n\n' + hb + ' To update snote, run `omarchy plugin update ';
    const up = section(readme, '## Updating');
    expect(up.slice(0, open.length)).toBe(open);
    expect(up.split(hb)).toHaveLength(2);
    for (const t of [readme, security]) expect(t).not.toMatch(/one[ -]step/i);
    expect(section(readme, '## Install on other Linux (Homebrew)')).not.toContain('macOS');
  });

  it('3: WHEN SECURITY.md `## Install, update and uninstall` is read THEN it names `snote-<version>.tar.gz`, the formula `sha256`, that the tarball holds nothing else, that the release check verifies our signature on the checksum lists and refuses the release on any difference, that Homebrew does not check our signature, and `brew upgrade snote` as the one updater', () => {
    const s = section(security, '## Install, update and uninstall');
    for (const line of [
      '`snote-<version>.tar.gz`',
      "compares it with the formula's `sha256`",
      '`THIRD-PARTY-NOTICES`, `allowed_signers` and `SHA256SUMS`, and nothing else',
      "The tarball holds the release's runtime files, `LICENSE`, `NOTICE`,",
      "our release check verifies our signature on the release's checksum lists",
      'It refuses the release on any difference',
      'Homebrew does not check our signature itself.',
      '`brew upgrade snote` is its one updater',
    ]) expect(s).toContain(line);
  });
});
