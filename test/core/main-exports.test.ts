/**
 * T322 — the test-only seam is gone: `src/cli/main.tsx` exports only the
 * production `buildStore`; no `buildStoreForTest`, no `beforeClientConnect`
 * option. The fake server's knobs are plain properties a test sets on the
 * started server before calling `buildStore`.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import * as mainExports from '../../src/cli/main';

describe('T322 — main.tsx carries no test-only build seam', () => {
  it("1: WHEN `src/cli/main.tsx` is read as text THEN it contains neither `buildStoreForTest` nor `beforeClientConnect`", () => {
    const src = readFileSync(join(process.cwd(), 'src', 'cli', 'main.tsx'), 'utf8');
    expect(src).not.toContain('buildStoreForTest');
    expect(src).not.toContain('beforeClientConnect');
  });

  it("2: WHEN `src/cli/main.tsx` is imported THEN its `buildStore` export is a function and it has no `buildStoreForTest` export", () => {
    expect(typeof mainExports.buildStore).toBe('function');
    expect('buildStoreForTest' in mainExports).toBe(false);
  });
});
