/**
 * Issue #298 (R7, security build rule): src/core/account-id.ts says the helper
 * "creates it exclusively". The planted-link tests cannot show that, because the
 * helper unlinks the temp file first and O_NOFOLLOW refuses a symlink anyway. A
 * HARD link planted at `account.json.tmp` after that unlink is the case only
 * O_EXCL stops: without it the write goes through the link into the other file.
 * A child process replaces fs.unlinkSync (the one fs seam the helper calls just
 * before the create) and then runs the real recordAccountId through tsx.
 * Linux only.
 */
import { describe, it, expect, afterAll } from 'vitest';
import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const ACCOUNT_ID = join(process.cwd(), 'src', 'core', 'account-id.ts');
const VICTIM = 'VICTIM-ORIGINAL-CONTENT';
const dirs: string[] = [];
afterAll(() => {
  for (const d of dirs) rmSync(d, { recursive: true, force: true });
});

// The wrapper links the victim file to `<folder>/account.json.tmp` the moment the helper has removed that name.
const CHILD = `
import fs from 'node:fs';
import { syncBuiltinESMExports } from 'node:module';
const [folder, victim] = [process.argv[2], process.argv[3]];
const tmp = folder + '/account.json.tmp';
const { unlinkSync } = fs;
fs.unlinkSync = (p, ...a) => {
  try { return unlinkSync(p, ...a); }
  finally { if (p === tmp && !fs.existsSync(p)) fs.linkSync(victim, p); }
};
syncBuiltinESMExports();
const { recordAccountId } = await import(${JSON.stringify(ACCOUNT_ID)});
try { recordAccountId(folder, 'a@b.invalid'); console.log('wrote'); } catch (e) { console.log('threw ' + e.code); }
process.exit(0);
`;

describe('recordAccountId creates its temp file exclusively (#298)', () => {
  it('15: WHEN a file appears at `account.json.tmp` (a hard link to another file) after recordAccountId\'s helper removed the old temp file and before it creates the new one THEN the write fails with `EEXIST` and the linked file\'s content is unchanged', () => {
    const root = mkdtempSync(join(tmpdir(), 'snote-excl-'));
    dirs.push(root);
    const folder = join(root, 'acct');
    mkdirSync(folder);
    const victim = join(root, 'victim');
    writeFileSync(victim, VICTIM);
    const script = join(root, 'child.mjs');
    writeFileSync(script, CHILD);
    const r = spawnSync(process.execPath, ['--import', 'tsx', script, folder, victim], { cwd: process.cwd(), encoding: 'utf8' });
    expect(r.stdout.trim(), r.stderr).toBe('threw EEXIST');
    expect(readFileSync(victim, 'utf8')).toBe(VICTIM);
  }, 30000);
});
