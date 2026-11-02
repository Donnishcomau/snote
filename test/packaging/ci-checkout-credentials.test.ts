/**
 * #377: every actions/checkout step in the CI workflow sets `persist-credentials: false`, so the job
 * token is not left in .git/config for the steps that run PR code. The workflow is read as text.
 */
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const lines = readFileSync('.github/workflows/check.yml', 'utf8').split('\n');
const live = lines.filter((l) => !l.trimStart().startsWith('#'));

/** Step line groups: from each `      - ` line to the next one (or the end). */
function steps(): string[][] {
  const out: string[][] = [];
  let cur: string[] | null = null;
  for (const l of live) {
    if (l.startsWith('      - ')) {
      cur = [l];
      out.push(cur);
    } else if (cur) cur.push(l);
  }
  return out;
}
const checkoutSteps = steps().filter((s) => s[0].includes('uses: actions/checkout@'));

describe('ci checkout credentials', () => {
  it('1: WHEN check.yml is read THEN it has at least one step whose `uses:` is `actions/checkout@` and every such step has, in its own step lines (from its `- ` line to the next `      - ` line), an uncommented line `persist-credentials: false` under a `with:` key', () => {
    expect(checkoutSteps.length).toBeGreaterThanOrEqual(1);
    for (const s of checkoutSteps) {
      const withIdx = s.findIndex((l) => l.trim() === 'with:');
      expect(withIdx).toBeGreaterThanOrEqual(1);
      expect(s.slice(withIdx + 1).some((l) => l.trim() === 'persist-credentials: false')).toBe(true);
    }
  });

  it('2: WHEN check.yml is read THEN no uncommented line holds `persist-credentials` with any value other than `false`, and the number of `persist-credentials` keys equals the number of `actions/checkout@` steps', () => {
    const keys = live.filter((l) => l.includes('persist-credentials'));
    for (const l of keys) expect(l.trim()).toBe('persist-credentials: false');
    expect(keys).toHaveLength(checkoutSteps.length);
  });

  it('3: WHEN check.yml is read THEN its `uses:` lines are still exactly 2, the checkout one pinned to `@11d5960a326750d5838078e36cf38b85af677262`, and no line holds `token:` or `ssh-key:`', () => {
    const uses = lines.filter((l) => l.includes('uses:'));
    expect(uses).toHaveLength(2);
    expect(uses.some((l) => l.includes('actions/checkout@11d5960a326750d5838078e36cf38b85af677262'))).toBe(true);
    expect(lines.some((l) => l.includes('token:') || l.includes('ssh-key:'))).toBe(false);
  });
});
