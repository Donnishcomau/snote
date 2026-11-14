// #836 (the #556 AC2 live proof), lane L5d of #30: a direct install's one-key update against the REAL published GitHub
// release, run by hand by the release lane after a release is published (on snote-ci; never the Mac mini, never in the
// test suite, never shipped: it is not in plugin-dist). Opt-in: without SNOTE_LIVE_UPDATE=1 it exits 0 at once and
// touches neither the bundler nor the network. `--check` only bundles the entry, which proves it still builds against the
// code, and runs nothing. The body is scripts/live-direct-update-entry.ts, bundled through scripts/build.mjs.
import { spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const check = process.argv.includes('--check');
if (!check && process.env.SNOTE_LIVE_UPDATE !== '1') {
  console.log('live-direct-update: skipped (set SNOTE_LIVE_UPDATE=1 to run it against the published GitHub release)');
  process.exit(0);
}
const { bundle } = await import('./build.mjs');
const tmp = mkdtempSync(join(tmpdir(), 'snote-live-update-'));
let code = 1;
try {
  const outfile = join(tmp, 'entry.js');
  await bundle({ entry: 'scripts/live-direct-update-entry.ts', outfile });
  if (check) {
    console.log('live-direct-update: bundled');
    code = 0;
  } else {
    code = spawnSync(process.execPath, [outfile], { stdio: 'inherit', env: { ...process.env, SNOTE_LIVE_TMP: tmp } }).status ?? 1;
  }
} catch (err) {
  console.log(`live-direct-update: error: ${err instanceof Error ? err.message : String(err)}`);
} finally {
  rmSync(tmp, { recursive: true, force: true });
}
process.exit(code);
