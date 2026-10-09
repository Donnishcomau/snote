import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';

const readme = readFileSync('README.md', 'utf8');

function section(md: string, heading: string): string {
  const start = md.indexOf('## ' + heading);
  expect(start).toBeGreaterThan(-1);
  const next = md.indexOf('\n## ', start);
  return next === -1 ? md.slice(start) : md.slice(start, next);
}

describe('README — Updating section and honest update-check disclosure (T392)', () => {
  it('1: WHEN `README.md` is read THEN `## Updating` appears once, after `## Install on Omarchy` and before `## Pre-built plugin files`.', () => {
    expect(readme.split('## Updating').length - 1).toBe(1);
    expect(readme).toContain('## Updating');
    expect(readme).toContain('## Install on Omarchy');
    expect(readme).toContain('## Pre-built plugin files');
    const installIdx = readme.indexOf('## Install on Omarchy');
    const updatingIdx = readme.indexOf('## Updating');
    const prebuiltIdx = readme.indexOf('## Pre-built plugin files');
    expect(installIdx).toBeGreaterThan(-1);
    expect(prebuiltIdx).toBeGreaterThan(-1);
    expect(installIdx).toBeLessThan(updatingIdx);
    expect(updatingIdx).toBeLessThan(prebuiltIdx);
  });

  it('2: WHEN the `## Updating` section is read THEN it contains `omarchy plugin update io.github.donnishcomau.snote-simplenote`, `to leave the diff pager` and `--yes`.', () => {
    const s = section(readme, 'Updating');
    expect(s).toContain('omarchy plugin update io.github.donnishcomau.snote-simplenote');
    expect(s).toContain('to leave the diff pager');
    expect(s).toContain('--yes');
  });

  it('3: WHEN the section is read THEN it contains `click the bar button once`, `omarchy-restart-shell`, `the bar keeps the old widget until it restarts` and `restart any open snote windows`.', () => {
    const s = section(readme, 'Updating');
    expect(s).toContain('click the bar button once');
    expect(s).toContain('omarchy-restart-shell');
    expect(s).toContain('the bar keeps the old widget until it restarts');
    expect(s).toContain('restart any open snote windows');
  });

  it('4: WHEN `README.md` is read THEN it contains neither `builds snote` nor `rebuild`, and it contains `copies the pre-built snote` and `the first click installs it through Omarchy`.', () => {
    expect(readme).not.toContain('builds snote');
    expect(readme).not.toContain('rebuild');
    expect(readme).toContain('copies the pre-built snote');
    expect(readme).toContain('the first click installs it through Omarchy');
  });

  it('5: WHEN `README.md` is read THEN `split(\'\\n\').length` is at most `199`.', () => {
    // The file's final trailing newline yields an empty final element in
    // split('\n'); the pinned guards in readme-loop and release-0-2-2-docs
    // count the same way, so strip only that empty element here.
    const lines = readme.split('\n');
    if (lines.at(-1) === '') lines.pop();
    expect(lines.length).toBeLessThanOrEqual(199);
  });

  it('6: WHEN the `## Sync and data` section is read THEN it contains `git ls-remote` and `SNOTE_UPDATE_CHECK=off` and does not contain `never talks to any third-party service`.', () => {
    const s = section(readme, 'Sync and data');
    expect(s).toContain('git ls-remote');
    expect(s).toContain('SNOTE_UPDATE_CHECK=off');
    expect(s).not.toContain('never talks to any third-party service');
  });
});
