/**
 * Issue #68: docs/RELEASE-SIGNING.md gives the release owner the exact steps, and SECURITY.md says honestly what
 * the signature does and does not cover (SG-3, SG-4; the signing facts for 0.2.9). The files are published, so they must
 * also pass the export's personal-data scan.
 */
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const runbook = readFileSync('docs/RELEASE-SIGNING.md', 'utf8');
const security = readFileSync('SECURITY.md', 'utf8');

/** True when every text occurs in `doc`, each after the one before it. */
const inOrder = (doc: string, texts: string[]): boolean => {
  let at = 0;
  for (const t of texts) {
    const i = doc.indexOf(t, at);
    if (i < 0) return false;
    at = i + t.length;
  }
  return true;
};
const section = (doc: string, from: string, to: string): string => doc.slice(doc.indexOf(from), doc.indexOf(to));

describe('issue #68: release signing docs', () => {
  it('1: WHEN the one-time section of docs/RELEASE-SIGNING.md is read THEN it holds in order `ykman info`, `5.2.3`, `FIDO2 PIN`, the full `ssh-keygen -t ed25519-sk -O resident -O verify-required -O application=ssh:snote-release -C snote-release-main -f ~/.ssh/snote-release-main` command, the backup command with `-C snote-release-backup`, a test-file sign and verify, and `-lf`, and `no-touch-required` appears only after the word Never', () => {
    const one = section(runbook, '## One time', '## Each release');
    expect(one.length).toBeGreaterThan(200);
    expect(
      inOrder(one, [
        'ykman info',
        '5.2.3',
        'FIDO2 PIN',
        'ssh-keygen -t ed25519-sk -O resident -O verify-required -O application=ssh:snote-release -C snote-release-main -f ~/.ssh/snote-release-main',
        '-C snote-release-backup -f ~/.ssh/snote-release-backup',
        'ssh-keygen -Y sign -f ~/.ssh/snote-release-main -n snote-release /tmp/signing-test',
        'ssh-keygen -Y verify',
        '-lf',
      ])
    ).toBe(true);
    for (const m of one.matchAll(/no-touch-required/g)) expect(one.slice(Math.max(0, (m.index ?? 0) - 20), m.index)).toContain('Never');
    expect(one).toContain('no-touch-required');
  });

  it('2: WHEN the per-release section is read THEN it has the clean-tree check, publish, manifest, sign, verify, amend, the amended-commit line and gate steps in order, the 0.2.9 gate command with `SNOTE_RELEASE_BOOTSTRAP_FPS=` in front of `env -u SNOTE_SIG_CHECK`, the later-release gate command with `env -u SNOTE_SIG_CHECK`, `SNOTE_RELEASE_TREE`, no `SNOTE_PREV_REPO`, says to tag only without `signature check skipped`, says a newer public tag `can only make the gate refuse`, and says the `[Verify]` request must name the amended commit', () => {
    const each = section(runbook, '## Each release', '## Notes');
    expect(each.length).toBeGreaterThan(200);
    expect(
      inOrder(each, [
        'scripts/publish-export.sh',
        'git -C /tmp/snote-public status --porcelain --ignored',
        'release-manifest.sh',
        'ssh-keygen -Y sign -f ~/.ssh/snote-release-main -n snote-release SHA256SUMS',
        'ssh-keygen -Y verify -f packaging/release/allowed_signers',
        'commit --amend',
        'git -C /tmp/snote-public rev-parse HEAD',
        'request on the marketplace must name',
        'scripts/release-gate.sh',
      ])
    ).toBe(true);
    expect(each).not.toContain('SNOTE_PREV_REPO');
    const gateStep = each.slice(each.indexOf('7. Run the gate again'), each.indexOf('8. Tagging'));
    expect(gateStep.length).toBeGreaterThan(200);
    // the first signed release: the recorded fingerprints go in front of env -u, so the pinned gate command below stays a substring
    expect(gateStep).toContain('SNOTE_RELEASE_BOOTSTRAP_FPS=SHA256:<main>,SHA256:<backup> env -u SNOTE_SIG_CHECK SNOTE_RELEASE_TREE=/tmp/snote-public scripts/release-gate.sh 0.2.9');
    expect(gateStep.replace(/\s+/g, ' ')).toContain('never copy them from that line');
    // every later release: an inherited switch is removed for this run
    expect(gateStep).toContain('`env -u SNOTE_SIG_CHECK SNOTE_RELEASE_TREE=/tmp/snote-public scripts/release-gate.sh <version>`');
    expect(gateStep).toContain('right before tagging');
    // the output is checked for the line the gate prints when the check was off
    expect(gateStep).toContain('tag only if its output does NOT contain `signature check skipped`');
    // the previous signed tag is not verified, and a bad one can only make the gate refuse
    expect(gateStep).toContain('can only make the gate refuse, never pass');
    // the runbook never sets the switch that turns the check off: the only mention is `env -u SNOTE_SIG_CHECK`
    expect(gateStep).not.toMatch(/SNOTE_SIG_CHECK=/);
    expect(runbook).not.toMatch(/SNOTE_SIG_CHECK=/);
    expect(each).toContain('https://github.com/donnishcomau/snote');
    expect(each).toContain('SNOTE_RELEASE_TREE');
  });

  it('3: WHEN SECURITY.md is read THEN its `## How releases are signed` section says `From 0.2.9`, `snote does not check this signature yet`, the setup checksum refusal text, that touch and PIN are enforced by the key when it signs and a check of the signature `cannot see them`, that a manual `omarchy plugin update` replaces `allowed_signers` `without snote verifying`, and does not say that snote verifies a signature, that updates are verified, or that verification enforces touch or PIN', () => {
    const s = section(security, '## How releases are signed', '## Screen-reader output');
    expect(s.length).toBeGreaterThan(300);
    const flat = s.replace(/\s+/g, ' ');
    expect(flat).toContain('From 0.2.9');
    expect(flat).toContain('snote does not check this signature yet, on install or on update');
    expect(flat).toContain('update refused: the download could not be verified');
    expect(flat).toContain('Touch and PIN are enforced by the key when it signs');
    expect(flat).toContain('cannot see them');
    expect(flat).toContain('omarchy plugin update');
    expect(flat).toContain('allowed_signers');
    expect(flat).toContain('without snote verifying');
    expect(flat).not.toMatch(/verif\w* (enforces|requires|checks|proves) (touch|PIN)/i);
    expect(flat).not.toMatch(/signature (enforces|requires|checks|proves) (touch|PIN)/i);
    // the auditor's "Must NOT say" list (signing facts 0.2.9, section 5)
    expect(flat).not.toMatch(/snote (checks|verifies) (the|this|that|a|every) (release )?signature/i);
    expect(flat).not.toMatch(/(verified|signed) (updates?|before installing)|verified before installing/i);
    expect(flat).not.toMatch(/authenticated|tamper-proof|proves the release|Releases are not signed yet|Each release carries/i);
  });

  it('4: WHEN docs/RELEASE-SIGNING.md and SECURITY.md are scanned THEN no email address other than the public identity, and neither file holds a key-type name with `@openssh.com`', () => {
    const email = /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g;
    const publicIdentity = '201689496+qteamdon@users.noreply.github.com';
    for (const [name, doc] of [['docs/RELEASE-SIGNING.md', runbook], ['SECURITY.md', security]] as const) {
      const emails = (doc.match(email) ?? ([] as string[])).filter((e) => e.toLowerCase() !== publicIdentity);
      expect({ name, emails }).toEqual({ name, emails: [] });
      expect({ name, hasKeyType: doc.includes('@openssh.com') }).toEqual({ name, hasKeyType: false });
    }
    expect(runbook.includes('201689496+qteamdon@users.noreply.github.com')).toBe(true);
  });

  it('5: WHEN step 7 of the per-release section is read THEN it says a tag for this same release does not count as a previous tag, that the previous tag points at a different commit and has a lower version, and that a tag at the release commit or with no lower version is ignored and named, and it keeps the four pinned phrases', () => {
    const each = section(runbook, '## Each release', '## Notes');
    const step = each.slice(each.indexOf('7. Run the gate again'), each.indexOf('8. Tagging')).replace(/\s+/g, ' ');
    expect(step.length).toBeGreaterThan(200);
    expect(step).toContain('does not count as a previous tag');
    expect(step).toContain('points at a different commit, has a lower version than this release, and holds a');
    expect(step).toContain('is ignored, and the gate prints a line naming it and the reason');
    expect(step).toContain('can only make the gate refuse, never pass');
    expect(step).toContain('never copy them from that line');
    expect(step).toContain('right before tagging');
    expect(step).toContain('tag only if its output does NOT contain `signature check skipped`');
  });
});
