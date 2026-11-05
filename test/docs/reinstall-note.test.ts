/**
 * #597: the one-time reinstall note for installs on 0.2.10 or older after the public history was rewritten for 0.2.11:
 * one sentence at the end of the README `## Updating` paragraph and the source-checkout paragraph at the end of docs/INSTALL.md.
 */
import { existsSync, readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const readme = readFileSync('README.md', 'utf8');
const install = readFileSync('docs/INSTALL.md', 'utf8');
const updating = (): string => {
  const start = readme.indexOf('## Updating');
  return readme.slice(start, readme.indexOf('\n## ', start + 1));
};

describe('#597: one-time reinstall note', () => {
  it('1: WHEN the README `## Updating` section is read THEN its one paragraph ends with the reinstall sentence: `If you installed 0.2.10 or older, reinstall once for 0.2.11`, then `omarchy plugin remove io.github.donnishcomau.snote-simplenote`, `omarchy plugin add https://github.com/donnishcomau/snote --enable`, `click the bar button once and run `omarchy-restart-shell``, `unsent changes are kept` and `docs/release-notes-0.2.11.md`', () => {
    const s = updating();
    const paras = s.split('\n\n').map((p) => p.trim()).filter((p) => p !== '' && !p.startsWith('## '));
    expect(paras).toHaveLength(1);
    const p = paras[0];
    const at = p.indexOf('If you installed 0.2.10 or older, reinstall once for 0.2.11, because the public history was rewritten');
    expect(at).toBeGreaterThan(0);
    const tail = p.slice(at);
    let from = 0;
    for (const t of [
      '`omarchy plugin update` cannot apply it',
      '`omarchy plugin remove io.github.donnishcomau.snote-simplenote`',
      '`omarchy plugin add https://github.com/donnishcomau/snote --enable`',
      'click the bar button once and run `omarchy-restart-shell`',
      'unsent changes are kept',
      '`docs/release-notes-0.2.11.md`).',
    ]) {
      const i = tail.indexOf(t, from);
      expect(i, t).toBeGreaterThan(-1);
      from = i + t.length;
    }
    expect(tail.endsWith('`docs/release-notes-0.2.11.md`).')).toBe(true);
  });

  it('2: WHEN docs/INSTALL.md is read THEN its last paragraph says a source checkout or PKGBUILD clone made before 0.2.11 re-clones once, or runs `git fetch origin` then `git reset --hard origin/main`, and that the reset discards local changes', () => {
    const paras = install.trim().split('\n\n');
    const last = paras[paras.length - 1];
    expect(last).toContain('If you built from a source checkout or a PKGBUILD clone made before 0.2.11, `git pull` will refuse or diverge');
    expect(last).toContain('the public history was rewritten once for 0.2.11');
    expect(last).toContain('Re-clone once, or run `git fetch origin` then `git reset --hard origin/main`.');
    expect(last).toContain('The reset discards any local changes in that checkout.');
  });

  it('3: WHEN the notes path named at the end of the README reinstall sentence is read THEN that file exists and holds `## If you installed 0.2.10 or older: reinstall once` and the steps `1. Run `omarchy plugin remove io.github.donnishcomau.snote-simplenote`.` and `2. Run `omarchy plugin add https://github.com/donnishcomau/snote --enable`.`', () => {
    const named = /the steps are in `([^`]+)`\)\.$/.exec(updating().trim())?.[1] ?? '';
    expect(named).toBe('docs/release-notes-0.2.11.md');
    expect(existsSync(named)).toBe(true);
    const notes = readFileSync(named, 'utf8');
    expect(notes).toContain('\n## If you installed 0.2.10 or older: reinstall once\n');
    expect(notes).toContain('1. Run `omarchy plugin remove io.github.donnishcomau.snote-simplenote`.');
    expect(notes).toContain('2. Run `omarchy plugin add https://github.com/donnishcomau/snote --enable`.');
  });
});
