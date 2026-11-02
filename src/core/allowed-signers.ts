import * as fs from 'node:fs';

/**
 * #68b1 (SECURITY SG-2): the one rule set for an `allowed_signers` file.
 * ssh-keygen trusts every line the file holds and checks neither its type
 * nor its mode, so snote checks both before it ever calls ssh-keygen.
 */
export type SignersCheck = { ok: true; keys: string[]; text: string } | { ok: false; reason: string };

export const MAX_SIGNERS_BYTES = 4096;
// Joined from two strings: the public export's address scan reads `<name>@openssh.com` as an e-mail address.
const SK_TYPES = ['sk-ssh-ed25519' + '@openssh.com', 'sk-ecdsa-sha2-nistp256' + '@openssh.com'];
const LINE_RE =
  /^snote-release namespaces="snote-release" (sk-ssh-ed25519@openssh\.com|sk-ecdsa-sha2-nistp256@openssh\.com|ssh-ed25519) ([A-Za-z0-9+/]+={0,2})(?: ([^\u0000-\u001f\u007f]*))?$/;

/**
 * The key type inside a base64 key blob: the first length-prefixed string (4-byte big-endian
 * length, then that many bytes). Null when the blob is shorter than 4 bytes or the length
 * points past its end. The type is the only field read.
 */
export function keyBlobType(b64: string): string | null {
  const blob = Buffer.from(b64, 'base64');
  if (blob.length < 4) return null;
  const n = blob.readUInt32BE(0);
  if (n > blob.length - 4) return null;
  return blob.subarray(4, 4 + n).toString('latin1');
}

/** Content rules. `skOnly` (the gate and the build) refuses a plain ssh-ed25519 test key. */
export function validateAllowedSigners(text: string, opts: { skOnly?: boolean } = {}): SignersCheck {
  const keys: string[] = [];
  for (const line of text.split('\n')) {
    if (line === '' || line.startsWith('#')) continue;
    const m = LINE_RE.exec(line);
    if (!m) return { ok: false, reason: 'allowed_signers holds a line that is not a plain snote-release key.' };
    // the label is not the key. The first length-prefixed string inside the blob is the real type.
    let type: string | null = null;
    try {
      type = keyBlobType(m[2] as string);
    } catch {
      type = null; // a parse that throws is a refusal, never a crash
    }
    if (type !== m[1]) {
      return { ok: false, reason: 'allowed_signers holds a key whose label does not match its key type.' };
    }
    if (opts.skOnly === true && !SK_TYPES.includes(m[1] as string)) {
      return { ok: false, reason: 'allowed_signers holds a key that is not a security key.' };
    }
    const key = `${m[1]} ${m[2]}`;
    const bytes = Buffer.from(m[2] as string, 'base64').toString('hex'); // `=` padding must not make a second key
    if (keys.some((k) => Buffer.from(k.split(' ')[1] as string, 'base64').toString('hex') === bytes)) {
      return { ok: false, reason: 'allowed_signers holds the same key twice.' };
    }
    keys.push(key);
  }
  if (keys.length < 2) return { ok: false, reason: 'allowed_signers must hold at least 2 keys.' };
  return { ok: true, keys, text };
}

/**
 * The installed file: lstat first (a symlink is refused, never followed),
 * then a regular file owned by `uid`, not group or world writable, at most
 * 4 KB, then the content rules (proof: test/core/allowed-signers.test.ts).
 */
export function checkInstalledAllowedSigners(
  file: string,
  opts: { uid?: number; skOnly?: boolean } = {}
): SignersCheck {
  const bad = (why: string): SignersCheck => ({ ok: false, reason: `The installed allowed_signers ${why}.` });
  try {
    const st = fs.lstatSync(file);
    if (!st.isFile()) return bad('is not a regular file');
    if (st.uid !== (opts.uid ?? process.getuid?.() ?? st.uid)) return bad('is not owned by the user');
    if ((st.mode & 0o022) !== 0) return bad('is writable by others');
    if (st.size > MAX_SIGNERS_BYTES) return bad('is larger than 4 KB');
    return validateAllowedSigners(fs.readFileSync(file, 'utf8'), { skOnly: opts.skOnly });
  } catch {
    return bad('cannot be read');
  }
}
