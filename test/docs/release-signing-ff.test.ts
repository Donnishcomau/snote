/**
 * #581: docs/RELEASE-SIGNING.md describes the release as one commit on top of public main (the fast-forward flow 0.2.8 and
 * 0.2.9 used), not the parentless export commit, and keeps the signed tree at /tmp/snote-public that the later steps name.
 */
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const runbook = readFileSync('docs/RELEASE-SIGNING.md', 'utf8');
const section = (doc: string, from: string, to: string): string => doc.slice(doc.indexOf(from), doc.indexOf(to));
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

describe('#581: release runbook fast-forward flow', () => {
  it('1: WHEN step 1 of `## Each release` is read THEN it holds in order `scripts/publish-export.sh --out /tmp/snote-export`, `git -C /tmp/snote-export status --porcelain --ignored`, `git clone https://github.com/donnishcomau/snote /tmp/snote-public`, `rsync -a --delete --exclude=/.git /tmp/snote-export/ /tmp/snote-public/`, `-m "snote <version>"` and the two `HEAD^{tree}` reads, and the section holds no `--out /tmp/snote-public` and no `initial public release`', () => {
    const each = section(runbook, '## Each release', '## Notes');
    const one = section(each, '1. Build the public tree', '2. Check that the tree is clean');
    expect(one.length).toBeGreaterThan(200);
    expect(
      inOrder(one, [
        'scripts/publish-export.sh --out /tmp/snote-export',
        'git -C /tmp/snote-export status --porcelain --ignored',
        'git clone https://github.com/donnishcomau/snote /tmp/snote-public',
        'rsync -a --delete --exclude=/.git /tmp/snote-export/ /tmp/snote-public/',
        'git -C /tmp/snote-public add -A .',
        '-m "snote <version>"',
        "git -C /tmp/snote-public rev-parse 'HEAD^{tree}'",
        "git -C /tmp/snote-export rev-parse 'HEAD^{tree}'",
      ])
    ).toBe(true);
    expect(each).not.toContain('--out /tmp/snote-public');
    expect(runbook).not.toContain('initial public release');
  });

  it('2: WHEN step 6 is read THEN it puts the files into `the release commit`, says the amended commit and `not the one you made in step 1` is pushed, and no longer says `export commit`', () => {
    const six = section(runbook, '6. Put both files', '7. Run the gate again');
    expect(six.length).toBeGreaterThan(200);
    expect(six).toContain('6. Put both files into the release commit:');
    expect(six.replace(/\s+/g, ' ')).toContain('this amended commit, not the one you made in step 1, is the one you push');
    expect(six).not.toContain('export commit');
  });
});
