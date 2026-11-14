import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

// #319: the test files below remove every temp folder they make, passed or failed. One nested vitest run of all of them
// with TMPDIR a fresh folder must leave nothing in it but the runtime's own caches. A file joins by a row in CLEAN.
const CLEAN = [
  'test/packaging/omarchy-node-autoinstall.test.ts',
  'test/packaging/omarchy-node-lookup.test.ts',
  'test/packaging/omarchy-setup-prebuilt.test.ts',
  'test/packaging/shim-args.test.ts',
  'test/packaging/shim-mise-env.test.ts',
  'test/cli/bundle-sync.test.ts',
  'test/cli/crash-sr.test.ts',
  'test/cli/quiet-warnings.test.ts',
  'test/core/tombstones.test.ts',
  'test/core/persist-write-failure.test.ts',
  'test/core/editor-drafts-cap.test.tsx',
  'test/integration/state-set-aside-notice.test.tsx',
  'test/tui/forced-signout-keeps.test.tsx',
  'test/tui/trash-no-selection.test.tsx',
  'test/tui/blog-send-double-y.test.tsx',
];
// What node, tsx and vite put in TMPDIR themselves: not made by a test.
const RUNTIME = /^(node-compile-cache|tsx-\d+|vite-.*)$/;
const root = path.resolve('.');
const made: string[] = [];
afterAll(() => {
  for (const d of made.splice(0)) fs.rmSync(d, { recursive: true, force: true });
});

describe('#319 test files that remove their temp folders', () => {
  it('1: WHEN the CLEAN files run once in a nested vitest with TMPDIR a fresh folder THEN every file runs to its end, passed or failed, and the folder holds no entry but the runtime caches', () => {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'tmp-clean-run-'));
    const cfgDir = fs.mkdtempSync(path.join(os.tmpdir(), 'tmp-clean-cfg-'));
    made.push(tmp, cfgDir);
    const cfg = path.join(cfgDir, 'vitest.clean.config.ts');
    fs.writeFileSync(
      cfg,
      `import base from ${JSON.stringify(path.join(root, 'vitest.config.ts'))};\n` +
        `export default { ...base, root: ${JSON.stringify(root)}, test: { ...base.test, include: ${JSON.stringify(CLEAN.map((f) => path.join(root, f)))} } };\n`,
    );
    const report = path.join(cfgDir, 'report.json');
    // One inner worker: the nested run adds one process to the parent's load, not two.
    const r = spawnSync(
      path.join(root, 'node_modules/.bin/vitest'),
      ['run', '--config', cfg, '--maxWorkers=1', '--reporter=default', '--reporter=json', `--outputFile.json=${report}`],
      { cwd: root, encoding: 'utf8', timeout: 150_000, env: { ...process.env, TMPDIR: tmp } },
    );
    const log = `nested vitest exit ${r.status} ${r.signal ?? ''}\n` + (r.stdout ?? '') + (r.stderr ?? '');
    // Whether each CLEAN file passes is the parent run's check (every CLEAN file is in the base include). Here an inner test
    // that fails under load must not read as a leak, so the nested run only has to run every CLEAN file to its end.
    const ran = fs.existsSync(report)
      ? (JSON.parse(fs.readFileSync(report, 'utf8')).testResults as { name: string }[]).map((t) => path.relative(root, t.name)).sort()
      : [];
    expect(ran, `the nested vitest run did not run every CLEAN file (an inner-run problem, not a temp-folder leak):\n${log}`).toEqual([...CLEAN].sort());
    const left = fs.readdirSync(tmp).filter((n) => !RUNTIME.test(n));
    expect(left, `temp folders the CLEAN files left in the fresh TMPDIR:\n${log}`).toEqual([]);
  }, 170_000);
});
