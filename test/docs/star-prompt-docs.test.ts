import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const BULLET = '- The one-time star prompt (`s` to star, `n` for no thanks) appears once after you have used snote for a while, and you can turn it off with `--no-star-prompt` or `SNOTE_STAR_PROMPT=off`. If your GitHub CLI (`gh`) is installed, `s` first runs `gh auth status --hostname github.com`, which has `gh` check your sign-in with GitHub, and if you are signed in it then asks `[y/N]`. Only on `y` does snote run `gh api --hostname github.com -X PUT user/starred/Donnishcomau/snote`, by the path it resolved for `gh`, with no shell, a timeout, and none of snote\'s own settings passed to it. snote never reads or stores a GitHub token: `gh` uses its own sign-in. Without `gh`, or if `gh` fails, `s` only opens the fixed address `https://github.com/Donnishcomau/snote` in your browser. Nothing else is sent anywhere. snote records your answer once in `star-prompt.json`, in its data folder.';
const SCOPE = '- the one-time star prompt: the GitHub CLI call and the fixed repo link,';

function section(md: string, heading: string): string {
  const start = md.indexOf(heading);
  const rest = md.slice(start + heading.length);
  const next = rest.search(/\n## /);
  return rest.slice(0, next === -1 ? rest.length : next);
}

describe('star prompt security text', () => {
  it('9: WHEN SECURITY.md is read THEN the approved star bullet sits in Install and outside the network section, and Scope names the prompt', () => {
    const md = readFileSync('SECURITY.md', 'utf8');
    const hits = md.split('\n').filter((l) => l.startsWith('- The one-time star prompt ('));
    expect(hits).toEqual([BULLET]);
    const line = hits[0];
    expect(section(md, '## Install, update and uninstall')).toContain(line);
    expect(section(md, '## What snote sends over the network')).not.toContain(line);
    for (const name of ['gh', 'Donnishcomau/snote', '--hostname github.com', 'gh auth status --hostname github.com', 'star-prompt.json', 'SNOTE_STAR_PROMPT', '--no-star-prompt']) {
      expect(line).toContain(name);
    }
    expect(line).toContain('snote never reads or stores a GitHub token');
    expect(line.includes('\u2014')).toBe(false);
    expect(line.includes('#')).toBe(false);
    expect(section(md, '## Scope')).toContain(SCOPE);
  });
});
