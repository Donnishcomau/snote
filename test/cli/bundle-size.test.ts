/**
 * T324: the bundle no longer carries Ink's dev-only devtools module and the
 * ws package it drags in (~126 KiB), while still running correctly.
 */
import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { bundle } from '../../scripts/build.mjs';
import { BUNDLE_CAP, bundleSize } from '../helpers/bundle-size';

const ENTRY = 'src/cli/index.ts';

let outfile: string;
let bundled = '';
let size = 0;
const dirs: string[] = [];

describe('T324 strip Ink devtools and ws from the bundle', () => {
  beforeAll(async () => {
    const dir = mkdtempSync(join(tmpdir(), 'bundle-size-'));
    dirs.push(dir);
    outfile = join(dir, 'cli.js');
    await bundle({ entry: ENTRY, outfile });
    bundled = readFileSync(outfile, 'utf8');
    size = bundleSize(bundled);
  }, 20000);

  afterAll(() => {
    for (const dir of dirs) {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  // T315.2 (2026-10-01): cap raised from 1,450,000 to 1,500,000 for the
  // built-in editor library (react-ink-textarea, ~59 KB unminified, now
  // actually imported by src/tui/InlineEditor.tsx). Case 2 below (`ws/lib`
  // absent) is the direct guard this cap exists for; a regression there
  // (Ink devtools/`ws` coming back, ~129 KB) would still exceed this cap.
  // (2026-10-07): raised to 1,520,000 for the security review 4 fixes (output guard v2, editor stand-ins, endpoint checks).
  // (2026-10-09): raised to 1,540,000. Measured 1,524,492 bytes at 8204e78 (1,515,703 at 74a42ba): the 0.2.5 UI features
  // (Help scrolling, too-small screen, status truncation, inline-editor stand-ins) grew src by ~430 lines.
  // 1,537,371 bytes after the 0.2.5 arrow-key burst fix (caretMoves.ts).
  // (2026-10-12): 1,545,000 for the S8-01 fix (T529): measured 1,539,937 bytes with it.
  // chunk-keys slice 2 (F193): the cap and its measurement live in test/helpers/bundle-size.ts.
  it('1: WHEN the bundle is built into a temp outfile with `bundle` from `scripts/build.mjs` THEN `bundleSize` of its text is below `BUNDLE_CAP` (`1565000`) bytes', () => {
    expect(BUNDLE_CAP).toBe(1565000);
    expect(size).toBeLessThan(BUNDLE_CAP);
  });

  it('2: WHEN that built bundle is read as text THEN it does not contain `ws/lib`', () => {
    expect(bundled).not.toContain('ws/lib');
  });

  it("3: WHEN that built bundle is run with spawnSync(process.execPath, [outfile, '--help'], { encoding: 'utf8' }) THEN the exit status is `0` and stdout contains `usage: snote`", () => {
    const result = spawnSync(process.execPath, [outfile, '--help'], {
      encoding: 'utf8',
    });
    expect(result.status).toBe(0);
    expect(result.stdout).toContain('usage: snote');
  });
});
