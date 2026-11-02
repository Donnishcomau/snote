/**
 * #256: the export's email allow-list (EMAIL_OK in scripts/publish-export.sh) holds only patterns on reserved
 * domains (RFC 2606 and 6761) and exact addresses, each exact address with a written reason in the comment
 * lines directly above it. A one-letter name on a one-letter .co domain, or any name on a hostile-looking
 * domain, no longer passes the scrub. Refused addresses are built at run time: written here as one literal
 * they would sit in this exported file and stop the scrub itself. publish-export.sh is private tooling and
 * not in the public export, so the public copy of this file skips.
 */
import { spawnSync } from 'node:child_process';
import { appendFileSync, copyFileSync, existsSync, lstatSync, mkdirSync, mkdtempSync, readFileSync, readlinkSync, rmSync, symlinkSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const ROOT = resolve('.');
const SCRIPT = 'scripts/publish-export.sh';
const GIT_ID = ['-c', 'user.name=t', '-c', 'user.email=t@example.com', '-c', 'commit.gpgsign=false', '-c', 'core.hooksPath=/dev/null'];
const at = (name: string, domain: string): string => [name, domain].join('@');

function git(cwd: string, args: string[]): void {
  const r = spawnSync('git', [...GIT_ID, ...args], { cwd, encoding: 'utf8' });
  expect(r.status, r.stderr).toBe(0);
}

/** A one-commit copy of the working tree under dist/ (gitignored; keeps plugin-dist paths relative). */
function copyRepo(): { base: string; repo: string } {
  mkdirSync(join(ROOT, 'dist'), { recursive: true });
  const base = mkdtempSync(join(ROOT, 'dist', 'export-exact-'));
  const repo = join(base, 'r');
  const listed = spawnSync('git', ['ls-files', '-z', '--cached', '--others', '--exclude-standard'], { cwd: ROOT, encoding: 'utf8' });
  expect(listed.status).toBe(0);
  for (const f of listed.stdout.split('\0').filter((p) => p !== '')) {
    const from = join(ROOT, f);
    if (!existsSync(from)) continue;
    const to = join(repo, f);
    mkdirSync(dirname(to), { recursive: true });
    if (lstatSync(from).isSymbolicLink()) symlinkSync(readlinkSync(from), to);
    else copyFileSync(from, to);
  }
  git(repo, ['init', '-q', '-b', 'main']);
  git(repo, ['add', '-A']);
  git(repo, ['commit', '-q', '-m', 'exact test']);
  symlinkSync(join(ROOT, 'node_modules'), join(repo, 'node_modules'));
  return { base, repo };
}

function flagged(err: string): string[] {
  const lines = err.split('\n');
  const i = lines.findIndex((l) => l.startsWith('FAIL: email address not on the export allow-list'));
  return i < 0 ? [] : lines.slice(i + 1).filter((l) => l.trim() !== '');
}

/** The EMAIL_OK line, its entries (split on top-level `|`), and the comment block directly above it. */
function readAllowList(): { regex: RegExp; entries: string[]; comments: string[] } {
  const lines = readFileSync(SCRIPT, 'utf8').split('\n');
  const idx = lines.findIndex((l) => l.startsWith('EMAIL_OK='));
  expect(idx).toBeGreaterThan(0);
  const line = lines[idx];
  const body = line.slice("EMAIL_OK='".length, line.lastIndexOf("'"));
  const inner = body.replace(/^\^\(/, '').replace(/\)\$$/, '');
  const entries: string[] = [];
  let depth = 0;
  let cls = false;
  let cur = '';
  for (let i = 0; i < inner.length; i++) {
    const c = inner[i];
    if (c === '\\') { cur += c + inner[++i]; continue; }
    if (cls) { if (c === ']') cls = false; cur += c; continue; }
    if (c === '[') cls = true;
    else if (c === '(') depth++;
    else if (c === ')') depth--;
    else if (c === '|' && depth === 0) { entries.push(cur); cur = ''; continue; }
    cur += c;
  }
  entries.push(cur);
  const comments: string[] = [];
  for (let i = idx - 1; i >= 0 && lines[i].startsWith('#'); i--) comments.push(lines[i]);
  return { regex: new RegExp(body), entries, comments };
}

const RESERVED_PATTERNS = [/^\[a-z0-9\.\+_-\]\+@example\\\.\(com\|net\|org\)$/, /^\[a-z0-9\._%\+-\]\+@\(\[a-z0-9-\]\+\\\.\)\*\(example\|invalid\|test\)$/];

describe.skipIf(!existsSync(SCRIPT))('#256 the export email allow-list is exact', () => {
  it('1: WHEN `j` at `g.co` and `someone` at `evil.com` are added to an exported file of a copy of this tree and `scripts/publish-export.sh --draft --no-check` runs THEN it exits `1` and the scrub names exactly those `2` addresses', () => {
    const { base, repo } = copyRepo();
    try {
      const planted = [at('j', 'g.co'), at('someone', 'evil.com')];
      appendFileSync(join(repo, 'docs', 'scrub-plant.md'), planted.map((p) => `contact ${p}\n`).join(''));
      git(repo, ['add', '-A']);
      git(repo, ['commit', '-q', '-m', 'plant']);
      const r = spawnSync('bash', [join(repo, SCRIPT), '--draft', '--no-check', '--out', join(base, 'out')], { cwd: repo, encoding: 'utf8' });
      expect(r.status, r.stderr).toBe(1);
      expect(flagged(r.stderr)).toEqual([...planted].sort());
    } finally {
      rmSync(base, { recursive: true, force: true });
    }
  }, 60000);

  it('2: WHEN EMAIL_OK is tested against `x@example.com`, `x@example.org`, `x@example.net` and `x@mail.example` THEN each matches, and against `x` at `b.co`, `j` at `g.co`, `zz` at `evil.com` and `me` at `x.org.attacker.io` THEN none matches', () => {
    const { regex } = readAllowList();
    for (const ok of ['x@example.com', 'x@example.org', 'x@example.net', 'x@mail.example']) expect([ok, regex.test(ok)]).toEqual([ok, true]);
    for (const bad of [at('x', 'b.co'), at('j', 'g.co'), at('zz', 'evil.com'), at('me', 'x.org.attacker.io')]) expect([bad, regex.test(bad)]).toEqual([bad, false]);
  });

  it('3: WHEN EMAIL_OK and the comment lines directly above it are read THEN every entry is a reserved-domain pattern or a literal address with no `[`, `*`, `+` quantifier (an escaped `\\+` is a literal), `?` or group, and each literal address that is not on a reserved domain appears in one of those comment lines followed by a reason; an unescaped `.` counts as a wildcard: in every literal address entry each `.` is escaped, so with its backslashes removed the entry equals the address named in its reason comment', () => {
    const { entries, comments } = readAllowList();
    expect(entries.length).toBeGreaterThan(2);
    const reserved = entries.filter((e) => RESERVED_PATTERNS.some((p) => p.test(e)));
    expect(reserved.length).toBe(2);
    const literals = entries.filter((e) => !reserved.includes(e));
    expect(literals.length).toBeGreaterThan(0);
    for (const e of literals) {
      expect([e, /[[\]*?(){}|^$]/.test(e)]).toEqual([e, false]);
      expect([e, /(^|[^\\])\+/.test(e)]).toEqual([e, false]);
      expect([e, /(^|[^\\])\./.test(e)]).toEqual([e, false]);
      const address = e.replace(/\\(.)/g, '$1');
      expect([address, address.split('@').length]).toEqual([address, 2]);
      const reasoned = comments.some((c) => c.startsWith(`# ${address}: `) && c.slice(`# ${address}: `.length).trim().length > 0);
      expect([address, reasoned]).toEqual([address, true]);
    }
  });

  it('4: WHEN EMAIL_OK is tested against `qq` at `c.co`, `qq` at `c.cod`, `qq` at `b.co` and `x` at `example.com.attacker.io` (each built at run time) THEN none matches, and `a@b.co`, `ab@c.cod` and `201689496+qteamdon@users.noreply.github.com` each match', () => {
    const { regex } = readAllowList();
    for (const bad of [at('qq', 'c.co'), at('qq', 'c.cod'), at('qq', 'b.co'), at('x', 'example.com.attacker.io')]) expect([bad, regex.test(bad)]).toEqual([bad, false]);
    for (const ok of ['a@b.co', 'ab@c.cod', '201689496+qteamdon@users.noreply.github.com']) expect([ok, regex.test(ok)]).toEqual([ok, true]);
  });
});
