/**
 * Issue #30 L5a2: SECURITY.md names the one question every update path passes before a fetch, the update's own
 * `Update snote now? [y/N]`, reached by the bar click or by `U` and `y` in snote, and no longer says the click is the way.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const read = (f: string): string => readFileSync(join(process.cwd(), f), 'utf8');

describe('#30 the update question in SECURITY.md', () => {
  it('1: WHEN the "Bar update click." bullet of SECURITY.md is read THEN fetching needs `y` to `Update snote now? [y/N]` (default N), reached by the bar\'s update button or by `U` and `y` in snote (a `y` that fetches nothing), the old `Only when you click the bar\'s update button` is gone, and bar-update, which the hand-off runs with no argument, asks that question before its first git network call', () => {
    const md = read('SECURITY.md');
    const at = md.indexOf('- Bar update click.');
    expect(at).toBeGreaterThan(-1);
    const b = md.slice(at, md.indexOf('\n- ', at)).replace(/\s+/g, ' ');
    expect(b).toContain("Only when you answer `y` to the update's own question `Update snote now? [y/N]` (default N), the update runs `git ls-remote --tags`");
    expect(b).toContain("You reach that question by clicking the bar's update button, or by pressing `U` in snote and answering `y` to snote's own question, which fetches nothing");
    expect(md.replace(/\s+/g, ' ')).not.toContain("Only when you click the bar's update button");
    const bar = read('packaging/omarchy/bar-update');
    const ask = bar.indexOf("printf 'Update snote now? [y/N] '");
    expect(ask).toBeGreaterThan(-1);
    expect(bar).toMatch(/case "\$answer" in\n\s*y\|Y\|yes\|YES\) ;;\n\s*\*\) say "Nothing was changed\."; exit 1 ;;/);
    expect(ask).toBeLessThan(bar.indexOf('ls-remote --tags'));
    expect(ask).toBeLessThan(bar.indexOf('fetch --quiet'));
    expect(read('src/core/update-handoff.ts')).toContain('then ${bar} && omarchy-launch-or-focus-tui snote;');
  });
});
