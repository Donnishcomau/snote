#!/usr/bin/env node
import { createRequire as __cr } from 'node:module';
const require = __cr(import.meta.url);
import {
  REMOTE_GIT_FLAGS,
  gitEnv
} from "./chunk-Z3QLLVDS.js";
import {
  compareVersions
} from "./chunk-C347G3S2.js";
import {
  secureExclusiveCreate,
  secureMkdtemp,
  secureRemoveTree
} from "./chunk-BQ6AXYOB.js";

// src/core/release-verify.ts
import { execFile } from "node:child_process";
import { createHash } from "node:crypto";
import * as fs2 from "node:fs";
import * as os from "node:os";
import * as path from "node:path";

// src/core/allowed-signers.ts
import * as fs from "node:fs";
var MAX_SIGNERS_BYTES = 4096;
var SK_TYPES = ["sk-ssh-ed25519", "sk-ecdsa-sha2-nistp256"].map((t) => [t, "openssh.com"].join("@"));
var LINE_RE = /^snote-release namespaces="snote-release" (sk-ssh-ed25519@openssh\.com|sk-ecdsa-sha2-nistp256@openssh\.com|ssh-ed25519) ([A-Za-z0-9+/]+={0,2})(?: ([^\u0000-\u001f\u007f]*))?$/;
function keyBlobType(b64) {
  const blob = Buffer.from(b64, "base64");
  if (blob.length < 4) return null;
  const n = blob.readUInt32BE(0);
  if (n > blob.length - 4) return null;
  return blob.subarray(4, 4 + n).toString("latin1");
}
function validateAllowedSigners(text, opts = {}) {
  const keys = [];
  for (const line of text.split("\n")) {
    if (line === "" || line.startsWith("#")) continue;
    const m = LINE_RE.exec(line);
    if (!m) return { ok: false, reason: "allowed_signers holds a line that is not a plain snote-release key." };
    let type = null;
    try {
      type = keyBlobType(m[2]);
    } catch {
      type = null;
    }
    if (type !== m[1]) {
      return { ok: false, reason: "allowed_signers holds a key whose label does not match its key type." };
    }
    if (opts.skOnly === true && !SK_TYPES.includes(m[1])) {
      return { ok: false, reason: "allowed_signers holds a key that is not a security key." };
    }
    const key = `${m[1]} ${m[2]}`;
    const bytes = Buffer.from(m[2], "base64").toString("hex");
    if (keys.some((k) => Buffer.from(k.split(" ")[1], "base64").toString("hex") === bytes)) {
      return { ok: false, reason: "allowed_signers holds the same key twice." };
    }
    keys.push(key);
  }
  if (keys.length < 2) return { ok: false, reason: "allowed_signers must hold at least 2 keys." };
  return { ok: true, keys, text };
}
function checkInstalledAllowedSigners(file, opts = {}) {
  const bad = (why) => ({ ok: false, reason: `The installed allowed_signers ${why}.` });
  try {
    const st = fs.lstatSync(file);
    if (!st.isFile()) return bad("is not a regular file");
    if (st.uid !== (opts.uid ?? process.getuid?.() ?? st.uid)) return bad("is not owned by the user");
    if ((st.mode & 18) !== 0) return bad("is writable by others");
    if (st.size > MAX_SIGNERS_BYTES) return bad("is larger than 4 KB");
    return validateAllowedSigners(fs.readFileSync(file, "utf8"), { skOnly: opts.skOnly });
  } catch {
    return bad("cannot be read");
  }
}

// src/core/release-verify.ts
var SSH_KEYGEN = "/usr/bin/ssh-keygen";
var NAMESPACE = "snote-release";
var TIMEOUT_MS = 1e4;
var READ_CAP = 1048576;
var BATCH_HEAD = 64;
var TREE_CAP = 8 * 1048576;
var VERSION_RE = /^[0-9]{1,6}\.[0-9]{1,6}\.[0-9]{1,6}(?:\.[0-9]{1,6})?$/;
var SUM_RE = /^([0-9a-f]{64}) {2}(.+)$/;
var GOOD_PREFIX = 'Good "snote-release" signature for snote-release with ';
var NEEDS_OPENSSH = "update refused: OpenSSH (ssh-keygen) is needed to verify updates";
var BAD_RUNNING_VERSION = "The running version is not a plain version number.";
var C1_BIDI = "\\u0080-\\u009f\\u202a-\\u202e\\u2066-\\u2069";
var BAD_PATH_RE = new RegExp("^/|(?:^|/)\\.\\.(?:/|$)|[\\u0000-\\u001f\\u007f" + C1_BIDI + "\\\\]");
var MANIFEST = "SHA256SUMS";
var SIG = "SHA256SUMS.sig";
var defaultProcRunner = (file, args, opts) => new Promise((resolve) => {
  const child = execFile(
    file,
    args,
    { cwd: opts.cwd, timeout: opts.timeoutMs, env: opts.env, maxBuffer: 1048576, encoding: "buffer" },
    (error, stdout) => {
      const out = Buffer.isBuffer(stdout) ? stdout : Buffer.alloc(0);
      const err = error;
      if (!err) resolve({ code: 0, stdout: out });
      else if (err.killed === true || err.signal != null || typeof err.code !== "number") resolve({ code: null, stdout: out });
      else resolve({ code: err.code, stdout: out });
    }
  );
  child.stdin?.on("error", () => void 0);
  child.stdin?.end(opts.input ?? Buffer.alloc(0));
});
function sshKeygenUsable(file) {
  try {
    const st = fs2.lstatSync(file);
    return st.isFile() && st.uid === 0 && (st.mode & 18) === 0;
  } catch {
    return false;
  }
}
function cleanEnv(env) {
  const out = gitEnv(env);
  delete out.SSH_AUTH_SOCK;
  return out;
}
function parseBatch(buf, ids) {
  const out = /* @__PURE__ */ new Map();
  let pos = 0;
  for (const id of ids) {
    const nl = buf.indexOf(10, pos);
    const head = nl < 0 ? null : /^([0-9a-f]{40}) blob ([0-9]+)$/.exec(buf.toString("latin1", pos, nl));
    if (!head || head[1] !== id) return null;
    const start = nl + 1;
    const end = start + Number(head[2]);
    if (end >= buf.length || buf[end] !== 10) return null;
    out.set(id, buf.subarray(start, end));
    pos = end + 1;
  }
  return pos === buf.length ? out : null;
}
var no = (reason) => ({ ok: false, reason });
function signerPreflight(sshKeygen, allowedSignersPath) {
  if (!sshKeygenUsable(sshKeygen)) return NEEDS_OPENSSH;
  if (!path.isAbsolute(allowedSignersPath)) return "The installed allowed_signers path is not absolute.";
  const signers = checkInstalledAllowedSigners(allowedSignersPath);
  return signers.ok === false ? signers.reason : null;
}
async function verifySignature(o) {
  const { run, sshKeygen, allowedSignersPath, data, sig } = o;
  let tmp = null;
  try {
    tmp = secureMkdtemp(path.join(os.tmpdir(), "snote-verify-"));
    const sigFile = path.join(tmp, SIG);
    secureExclusiveCreate(sigFile, sig.toString("utf8"), 384);
    const v = await run(
      sshKeygen,
      ["-Y", "verify", "-f", allowedSignersPath, "-I", NAMESPACE, "-n", NAMESPACE, "-s", sigFile],
      { cwd: tmp, timeoutMs: TIMEOUT_MS, env: { PATH: "/usr/bin:/bin", LC_ALL: "C" }, input: data }
    );
    return v.code === 0 && v.stdout.toString("utf8").startsWith(GOOD_PREFIX);
  } catch {
    return false;
  } finally {
    if (tmp !== null) {
      try {
        secureRemoveTree(tmp);
      } catch {
      }
    }
  }
}
async function verifyReleaseCommit(opts) {
  try {
    if (!VERSION_RE.test(opts.runningVersion)) return no(BAD_RUNNING_VERSION);
    const run = opts.run ?? defaultProcRunner;
    const env = cleanEnv(process.env);
    const git = (args, input) => run("git", [...REMOTE_GIT_FLAGS, ...args], { cwd: opts.cloneDir, timeoutMs: TIMEOUT_MS, env, input });
    const sshKeygen = opts.sshKeygenPath ?? SSH_KEYGEN;
    const pre = signerPreflight(sshKeygen, opts.allowedSignersPath);
    if (pre !== null) return no(pre);
    if (!/^[0-9a-f]{40}$/.test(opts.commit)) return no("The release commit is not a full commit id.");
    const tagVersion = /^v(.+)$/.exec(opts.tag)?.[1];
    if (tagVersion === void 0 || !VERSION_RE.test(tagVersion)) return no("The release tag is not a version.");
    const ls = await git(["ls-tree", "-r", "-l", "-z", "--full-tree", opts.commit]);
    if (ls.code !== 0) return no("The release commit could not be read.");
    const blobs = /* @__PURE__ */ new Map();
    const sizes = /* @__PURE__ */ new Map();
    let total = 0;
    for (const rec of ls.stdout.toString("utf8").split("\0")) {
      if (rec === "") continue;
      const m = /^(100644|100755) blob ([0-9a-f]{40}) +([0-9]+)\t(.+)$/s.exec(rec);
      if (!m) return no("The release holds an entry that is not a plain file.");
      if (blobs.has(m[4])) return no("The release holds a file twice.");
      blobs.set(m[4], m[2]);
      sizes.set(m[2], Number(m[3]));
      total += Number(m[3]);
      if (total > TREE_CAP) return no("The release is larger than 8 MiB.");
    }
    const groups = [];
    let used = READ_CAP;
    for (const id of new Set(blobs.values())) {
      const need = (sizes.get(id) ?? READ_CAP) + BATCH_HEAD;
      if (used + need > READ_CAP) {
        groups.push([]);
        used = 0;
      }
      groups[groups.length - 1].push(id);
      used += need;
    }
    const contents = /* @__PURE__ */ new Map();
    for (const ids of groups) {
      const cat = await git(["cat-file", "--batch"], Buffer.from(`${ids.join("\n")}
`));
      const part = cat.code === 0 ? parseBatch(cat.stdout, ids) : null;
      if (part === null) return no("The release files could not be read.");
      for (const [id, bytes] of part) contents.set(id, bytes);
    }
    const manifestId = blobs.get(MANIFEST);
    const sigId = blobs.get(SIG);
    if (manifestId === void 0 || sigId === void 0) return no("The release has no signed manifest.");
    const manifest = contents.get(manifestId) ?? null;
    const sig = contents.get(sigId) ?? null;
    if (manifest === null || sig === null) return no("The signed manifest could not be read.");
    if (!await verifySignature({ run, sshKeygen, allowedSignersPath: opts.allowedSignersPath, data: manifest, sig })) {
      return no("The release signature did not verify.");
    }
    const lines = manifest.toString("utf8").split("\n");
    if (lines[lines.length - 1] === "") lines.pop();
    const head = /^snote (\S+) ([0-9a-f]{40})$/.exec(lines[0] ?? "");
    if (!head || !VERSION_RE.test(head[1])) return no("The manifest has no version line.");
    const version = head[1];
    if (version !== tagVersion) return no("The signed version differs from the tag.");
    if (compareVersions(version, opts.runningVersion) <= 0) return no("The release is not newer than the running version.");
    const listed = /* @__PURE__ */ new Map();
    let last = "";
    for (const line of lines.slice(1)) {
      const m = SUM_RE.exec(line);
      const file = m?.[2];
      if (!m || BAD_PATH_RE.test(file) || file <= last) return no("The manifest has a bad line.");
      listed.set(file, m[1]);
      last = file;
    }
    const files = [...blobs.keys()].filter((p) => p !== MANIFEST && p !== SIG);
    if (files.length !== listed.size || files.some((p) => !listed.has(p))) return no("The manifest and the release files differ.");
    for (const p of files) {
      const bytes = contents.get(blobs.get(p)) ?? null;
      if (bytes === null) return no("A release file could not be read.");
      if (createHash("sha256").update(bytes).digest("hex") !== listed.get(p)) return no("A release file does not match the manifest.");
    }
    return { ok: true, version };
  } catch {
    return no("The release could not be verified.");
  }
}

export {
  SSH_KEYGEN,
  defaultProcRunner,
  signerPreflight,
  verifySignature,
  verifyReleaseCommit
};
