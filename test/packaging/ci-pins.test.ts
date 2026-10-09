/**
 * T420: supply-chain hardening of the CI workflow. The workflow runs with a
 * read-only token (`permissions: contents: read`) and both actions are pinned
 * by commit SHA instead of a moving tag. Nothing else in the workflow changes.
 */
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const workflow = readFileSync('.github/workflows/check.yml', 'utf8');
const lines = workflow.split('\n');

describe('ci workflow pins', () => {
  it('1: WHEN .github/workflows/check.yml is read THEN it has a line exactly `permissions:` followed by a line `  contents: read`, and `permissions:` comes before `jobs:`', () => {
    const permIdx = lines.findIndex((l) => l === 'permissions:');
    expect(permIdx).toBeGreaterThanOrEqual(0);
    expect(lines[permIdx + 1]).toBe('  contents: read');
    const jobsIdx = lines.findIndex((l) => l === 'jobs:');
    expect(jobsIdx).toBeGreaterThanOrEqual(0);
    expect(permIdx).toBeLessThan(jobsIdx);
  });

  it('2: WHEN its `uses:` lines are read THEN there are exactly 2, one contains `actions/checkout@11d5960a326750d5838078e36cf38b85af677262` and the other `actions/setup-node@49933ea5288caeca8642d1e84afbd3f7d6820020`, and none ends with `@v4`', () => {
    const uses = lines.filter((l) => l.includes('uses:'));
    expect(uses).toHaveLength(2);
    expect(uses.some((l) => l.includes('actions/checkout@11d5960a326750d5838078e36cf38b85af677262'))).toBe(true);
    expect(uses.some((l) => l.includes('actions/setup-node@49933ea5288caeca8642d1e84afbd3f7d6820020'))).toBe(true);
    for (const l of uses) {
      expect(l.trimEnd().endsWith('@v4')).toBe(false);
    }
  });

  it('3: WHEN it is read THEN it still contains `make check-ci`, `node-version: 22` and `build-plugin-dist.mjs --check plugin-dist`', () => {
    expect(workflow).toContain('make check-ci');
    expect(workflow).toContain('node-version: 22');
    expect(workflow).toContain('build-plugin-dist.mjs --check plugin-dist');
  });
});
