/**
 * #344 and #345: SECURITY.md and README.md state what the update path checks and what a first install
 * trusts. Each statement has its own test, so removing one turns that test red.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const security = readFileSync(join(process.cwd(), 'SECURITY.md'), 'utf8');
const readme = readFileSync(join(process.cwd(), 'README.md'), 'utf8');

/** The text from `start` to the next `end` (or the next `## ` heading), whitespace joined. */
function part(md: string, start: string, end = '\n## '): string {
  const i = md.indexOf(start);
  expect(i).toBeGreaterThan(-1);
  const j = md.indexOf(end, i + start.length);
  return md.slice(i, j === -1 ? undefined : j).replace(/\s+/g, ' ');
}

describe('trust statements (#344, #345)', () => {
  it('1: WHEN the bar update bullet of SECURITY.md is read THEN it says the installed keys check the signature before the move, says `an older snote cannot check, so its update to 0.2.12 is not verified`, names `allowed_signers` and `/usr/bin/ssh-keygen`, and the refusal `update refused: the download could not be verified`', () => {
    const b = part(security, '- Bar update click.', '\n- ');
    expect(b).toContain('checks that signature with the keys it installed');
    expect(b).toContain('an older snote cannot check, so its update to 0.2.12 is not verified');
    expect(b).toContain('allowed_signers');
    expect(b).toContain('/usr/bin/ssh-keygen');
    expect(b).toContain('has no keys');
    expect(b).toContain('update refused: the download could not be verified');
    expect(b).not.toContain('does not check that signature yet');
  });

  it('2: WHEN `## How releases are signed` is read THEN it says `From 0.2.12` the bar update checks the signature, `a snote older than 0.2.12 has no such check` and `A first install does not check it`', () => {
    const s = part(security, '## How releases are signed');
    expect(s).toContain('From 0.2.12, the bar update checks this signature');
    expect(s).toContain('a snote older than 0.2.12 has no such check');
    expect(s).toContain('A first install does not check it');
  });

  it('3: WHEN the install section of SECURITY.md is read THEN it states `Trust on first use` for both first installs: the clone `omarchy plugin add` fetched and `snote-install` checking only against `ASSETS.SHA256SUMS`, `not its signature`, and that a changed release `could pin a key`', () => {
    const s = part(security, '## Install, update and uninstall');
    expect(s).toContain('Trust on first use');
    expect(s).toContain('omarchy plugin add');
    expect(s).toContain('snote-install');
    expect(s).toContain('ASSETS.SHA256SUMS');
    expect(s).toContain('not its signature');
    expect(s).toContain('could pin a key');
  });

  it('4: WHEN the README install section is read THEN it gives the direct install as a download to a file then `bash snote-install`, never a pipe to a shell, names `~/.local/share/snote-app`, and says `trust on first use`', () => {
    const s = part(readme, '## Install on Omarchy');
    expect(s).toContain('-o snote-install');
    expect(s).toContain('bash snote-install');
    expect(s).toContain('~/.local/share/snote-app');
    expect(s).toContain('not its signature');
    expect(s).toContain('trust on first use');
    expect(readme).not.toMatch(/\|\s*(ba)?sh\b/);
  });

  it('5: WHEN the README sync section is read THEN it says the installed snote checks the signature with its own keys and `refuses the update` if a check fails, that `A snote older than 0.2.12 has no such check`, and a first install trusts the keys it installs', () => {
    const s = part(readme, '## Sync and data');
    expect(s).toContain('the installed snote checks that signature with its own keys');
    expect(s).toContain('refuses the update if a check fails');
    expect(s).toContain('A snote older than 0.2.12 has no such check');
    expect(s).toContain('A first install trusts the keys it installs');
  });
});
