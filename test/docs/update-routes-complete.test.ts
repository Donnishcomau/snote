/**
 * Issue #30 L5a2 (, review round 3): every public sentence that says how an update starts names both routes, the bar's
 * update click and `U` then `y` in snote, so no scope line, network summary or how-to names the click alone.
 */
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const read = (f: string): string => readFileSync(join(process.cwd(), f), 'utf8');
const flat = (s: string): string => s.replace(/\s+/g, ' ');

// A block is a heading, a bullet with its indented lines, a table row or a paragraph.
const blocks = (md: string): string[] => {
  const out: string[] = [];
  let cur = '';
  for (const line of md.split('\n')) {
    if (/^\s*$/.test(line) || /^(- |#|\d+\. |\|)/.test(line)) {
      if (cur) out.push(cur);
      cur = /^\s*$/.test(line) ? '' : line;
    } else cur += ` ${line}`;
  }
  if (cur) out.push(cur);
  return out.map(flat);
};

const ROUTE = /bar(?:'s)? update (?:click|button)|update button|click(?:s|ing)? the bar(?:'s)? update/i;
const POINTER = 'see the bar update click above';

describe('#30 every update route sentence names the U key', () => {
  it('1: WHEN the scope list of SECURITY.md is read THEN its update line names the update checks, the bar\'s update click and the `U` key in snote, and the old click-only line is gone', () => {
    const md = read('SECURITY.md');
    expect(md).toContain("- update: the update checks, the bar's update click and the `U` key in snote,\n");
    expect(md).not.toContain("- update: the update checks and the bar's update click,");
  });

  it('2: WHEN README.md is read THEN the Updating section offers `U` and `y` with the floating terminal and `Update snote now? [y/N]`, the network paragraph says that on the plugin `U` and `y` open the same update as the bar update click, and the code still does that (banner tail, hand-off terminal, one bar-update for both routes)', () => {
    const readme = flat(read('README.md'));
    expect(readme).toContain("Or, when snote shows an update banner, press `U` and answer `y`: snote quits and opens the same update as the bar's update button in a floating terminal, which asks `Update snote now? [y/N]` before it fetches anything.");
    const at = readme.indexOf('The bar update click fetches a release tag');
    expect(at).toBeGreaterThan(-1);
    expect(readme.slice(at, at + 400)).toContain('On the plugin, pressing `U` in snote and answering `y` opens the same update as the bar update click.');
    expect(read('src/tui/update-ask.tsx')).toContain(', press U to update`');
    const handoff = read('src/core/update-handoff.ts');
    expect(handoff).toContain("path.join(pluginCloneDir(home), 'packaging', 'omarchy', 'bar-update')");
    expect(handoff).toContain("return ['omarchy-launch-floating-terminal-with-presentation', ");
    expect(read('BarWidget.qml')).toContain('updateScript: root.localPath("packaging/omarchy/bar-update")');
    expect(read('packaging/omarchy/bar-update')).toContain("printf 'Update snote now? [y/N] '");
  });

  it('3: WHEN SECURITY.md, README.md and docs/*.md (not the release notes of shipped versions) are read THEN every heading, bullet or paragraph that names the bar\'s update click or button also names `U`', () => {
    const docs = (readdirSync(join(process.cwd(), 'docs'), { recursive: true }) as string[])
      .filter((f) => f.endsWith('.md') && !/release-notes-/.test(f))
      .map((f) => `docs/${f}`);
    const offenders: string[] = [];
    for (const f of ['SECURITY.md', 'README.md', ...docs]) {
      for (const b of blocks(read(f))) {
        if (ROUTE.test(b.split(POINTER).join('')) && !b.includes('`U`')) offenders.push(`${f}: ${b.slice(0, 120)}`);
      }
    }
    expect(offenders).toEqual([]);
  });
});
