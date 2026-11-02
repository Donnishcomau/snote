/**
 * #68b1: the shared allowed_signers validator (SECURITY SG-2). Keys are made
 * here with ssh-keygen in a mktemp dir; the files it checks are real files.
 */
import { execFileSync } from 'node:child_process';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { describe, it, expect, afterAll } from 'vitest';

import { checkInstalledAllowedSigners, validateAllowedSigners } from '../../src/core/allowed-signers';

const root = fs.mkdtempSync(path.join(os.tmpdir(), 'snote-68b1-'));
afterAll(() => fs.rmSync(root, { recursive: true, force: true }));

function keyParts(name: string): { type: string; b64: string } {
  const file = path.join(root, name);
  execFileSync('/usr/bin/ssh-keygen', ['-q', '-t', 'ed25519', '-N', '', '-f', file], { stdio: 'ignore' });
  const [type, b64] = fs.readFileSync(`${file}.pub`, 'utf8').trim().split(' ');
  return { type: type as string, b64: b64 as string };
}
const k1 = keyParts('k1');
const k2 = keyParts('k2');
const line = (k: { type: string; b64: string }, c = 'main'): string => `snote-release namespaces="snote-release" ${k.type} ${k.b64} ${c}`;
const GOOD = `# keys\n${line(k1)}\n${line(k2, 'backup')}\n`;
const write = (name: string, text: string, mode = 0o644): string => {
  const f = path.join(root, name);
  fs.writeFileSync(f, text);
  fs.chmodSync(f, mode);
  return f;
};

describe('#68b1 allowed_signers validator', () => {
  it('1: WHEN a file holds two distinct lines of the exact form THEN it is accepted and returns its `2` keys', () => {
    const r = validateAllowedSigners(GOOD);
    expect(r.ok).toBe(true);
    expect(r.ok ? r.keys.length : 0).toBe(2);
  });

  it('2: WHEN a line has a `*` principal, `namespaces="*"`, no namespaces option, `cert-authority`, another option or a comma principal THEN the file is refused', () => {
    const bad = [
      `* namespaces="snote-release" ${k1.type} ${k1.b64}`,
      `snote-release namespaces="*" ${k1.type} ${k1.b64}`,
      `snote-release ${k1.type} ${k1.b64}`,
      `snote-release cert-authority,namespaces="snote-release" ${k1.type} ${k1.b64}`,
      `snote-release namespaces="snote-release",valid-before="20300101" ${k1.type} ${k1.b64}`,
      `snote-release,evil namespaces="snote-release" ${k1.type} ${k1.b64}`,
    ];
    for (const b of bad) expect(validateAllowedSigners(`${b}\n${line(k2)}\n`).ok, b).toBe(false);
  });

  it('3: WHEN a file holds one key, the same key twice, a plain `ssh-ed25519` key under skOnly, a `sk-ssh-ed25519@openssh.com` label on a key blob of another type, or a key blob whose length prefix points past its end or that is truncated (under 4 bytes, or cut inside the type) THEN it is refused', () => {
    expect(validateAllowedSigners(`${line(k1)}\n`).ok).toBe(false);
    expect(validateAllowedSigners(`${line(k1)}\n${line(k1, 'copy')}\n`).ok).toBe(false);
    expect(validateAllowedSigners(GOOD, { skOnly: true }).ok).toBe(false);
    const lie = (k: { type: string; b64: string }, c: string): string => `snote-release namespaces="snote-release" sk-ssh-ed25519@openssh.com ${k.b64} ${c}`;
    expect(validateAllowedSigners(`${lie(k1, 'a')}\n${lie(k2, 'b')}\n`, { skOnly: true }).ok).toBe(false);
    expect(validateAllowedSigners(`${lie(k1, 'a')}\n${lie(k2, 'b')}\n`).ok).toBe(false);
    const SK = 'sk-ssh-ed25519@openssh.com';
    const be = (n: number): Buffer => { const b = Buffer.alloc(4); b.writeUInt32BE(n); return b; };
    const withBlob = (blob: Buffer, c: string): string => `snote-release namespaces="snote-release" ${SK} ${blob.toString('base64')} ${c}`;
    const sound = (c: string): Buffer => Buffer.concat([be(SK.length), Buffer.from(SK), Buffer.from(c)]);
    expect(validateAllowedSigners(`${withBlob(sound('a'), 'a')}\n${withBlob(sound('b'), 'b')}\n`, { skOnly: true }).ok).toBe(true);
    const bad = [
      Buffer.concat([be(0xffffffff), Buffer.from(SK)]),
      Buffer.concat([be(SK.length + 10), Buffer.from(SK)]),
      Buffer.from([0, 0]),
      Buffer.concat([be(SK.length), Buffer.from(SK.slice(0, 5))]),
    ];
    for (const b of bad) {
      expect(() => validateAllowedSigners(`${withBlob(b, 'a')}\n${withBlob(sound('b'), 'b')}\n`, { skOnly: true })).not.toThrow();
      expect(validateAllowedSigners(`${withBlob(b, 'a')}\n${withBlob(sound('b'), 'b')}\n`, { skOnly: true }).ok, b.toString('hex')).toBe(false);
    }
  });

  it('4: WHEN the installed file is a symlink, group writable, owned by another user, or over `4096` bytes THEN it is refused', () => {
    const real = write('real', GOOD);
    const link = path.join(root, 'link');
    fs.symlinkSync(real, link);
    expect(checkInstalledAllowedSigners(link).ok).toBe(false);
    expect(checkInstalledAllowedSigners(write('gw', GOOD, 0o664)).ok).toBe(false);
    expect(checkInstalledAllowedSigners(real, { uid: (process.getuid?.() ?? 0) + 1 }).ok).toBe(false);
    expect(checkInstalledAllowedSigners(write('big', `${GOOD}# ${'x'.repeat(4100)}\n`)).ok).toBe(false);
  });

  it('5: WHEN the installed file is a regular `0644` file of the user with two valid lines THEN it is accepted with its text', () => {
    const r = checkInstalledAllowedSigners(write('ok', GOOD));
    expect(r.ok).toBe(true);
    expect(r.ok ? r.text : '').toBe(GOOD);
  });
});
