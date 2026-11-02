/**
 * Issue #68 (SG-2): the rules an allowed_signers file must meet before a release is built or tagged.
 * ssh-keygen -Y verify trusts every line of the file it is given (a `*` principal or a missing namespaces option makes it accept
 * any key), so the file is checked before it is used. This is a copy of the rules in src/core/allowed-signers.ts for the
 * scripts, which cannot import the TypeScript source; both are tested with the same cases.
 *
 *   node scripts/check-allowed-signers.mjs <file> [--min N] [--types a,b]
 *     exit 0 when the file is valid (prints one line), exit 1 with one reason per line on stderr.
 *     --min N: at least N keys. --types: the allowed key types (default: the two hardware-key types); tests only.
 */
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

/** The hardware-key types a release key may have (FIDO2 on a YubiKey). */
export const SK_TYPES = ['sk-ssh-ed25519' + '@openssh.com', 'sk-ecdsa-sha2-nistp256' + '@openssh.com'];
const MAX_BYTES = 4096;

/**
 * @param {string} text the allowed_signers file
 * @param {{types?: string[], minKeys?: number}} [opts]
 * @returns {{ok: boolean, errors: string[], keys: {type: string, key: string}[]}}
 */
export function checkAllowedSigners(text, opts = {}) {
  const types = opts.types ?? SK_TYPES;
  const minKeys = opts.minKeys ?? 0;
  /** @type {string[]} */
  const errors = [];
  /** @type {{type: string, key: string}[]} */
  const keys = [];
  if (Buffer.byteLength(text) > MAX_BYTES) errors.push(`file is larger than ${MAX_BYTES} bytes`);
  const seen = new Set();
  text.split('\n').forEach((line, i) => {
    if (line === '' || line.startsWith('#')) return;
    const n = i + 1;
    const m = /^snote-release namespaces="snote-release" (\S+) ([A-Za-z0-9+/]+={0,2})( [A-Za-z0-9._@+:=-]+)?$/.exec(line);
    if (!m) { errors.push(`line ${n}: not exactly: snote-release namespaces="snote-release" <type> <base64> [comment]`); return; }
    const type = /** @type {string} */ (m[1]);
    const key = /** @type {string} */ (m[2]);
    if (!types.includes(type)) { errors.push(`line ${n}: key type ${type} is not allowed`); return; }
    if (seen.has(key)) { errors.push(`line ${n}: duplicate key`); return; }
    seen.add(key);
    keys.push({ type, key });
  });
  if (keys.length < minKeys) errors.push(`pins ${keys.length} key(s); at least ${minKeys} are required`);
  return { ok: errors.length === 0, errors, keys };
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  const args = process.argv.slice(2);
  const file = args[0];
  const flag = (/** @type {string} */ name) => (args.includes(name) ? args[args.indexOf(name) + 1] : undefined);
  if (!file || !fs.existsSync(file)) {
    process.stderr.write(`no such file: ${file ?? '(none given)'}\n`);
    process.exit(1);
  }
  // --min must be a whole number: Number('x') is NaN and "keys.length < NaN" is false, which would accept any file.
  const minAt = args.indexOf('--min');
  if (minAt >= 0 && !/^[0-9]+$/.test(args[minAt + 1] ?? '')) {
    process.stderr.write('--min takes a whole number\n');
    process.exit(1);
  }
  const result = checkAllowedSigners(fs.readFileSync(file, 'utf8'), {
    minKeys: minAt >= 0 ? Number(args[minAt + 1]) : 0,
    types: flag('--types')?.split(','),
  });
  if (result.ok) process.stdout.write(`allowed_signers: ${result.keys.length} key(s) ok\n`);
  else {
    process.stderr.write(result.errors.join('\n') + '\n');
    process.exit(1);
  }
}
