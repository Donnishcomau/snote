#!/usr/bin/env node
import { createRequire as __cr } from 'node:module';
const require = __cr(import.meta.url);
import {
  secureWriteFileSync
} from "./chunk-BQ6AXYOB.js";

// src/core/star-prompt.ts
import { spawn } from "node:child_process";
import * as fs from "node:fs";
import { join } from "node:path";
var MIN_LAUNCHES = 8;
var MIN_DAYS = 7;
var AGE_MS = 6e4;
var QUIET_MS = 3e4;
var GUARD_MS = 300;
var DAY_MS = 864e5;
var FILE = "star-prompt.json";
var AUTH_MS = 5e3;
var STAR_MS = 1e4;
var OPEN_MS = 5e3;
var REPO_URL = "https://github.com/Donnishcomau/snote";
var AUTH_ARGV = ["auth", "status", "--hostname", "github.com"];
var STAR_ARGV = ["api", "--hostname", "github.com", "-X", "PUT", "user/starred/Donnishcomau/snote"];
var GH_CANDIDATES = ["/usr/bin/gh", "/usr/local/bin/gh", "/opt/homebrew/bin/gh", "/home/linuxbrew/.linuxbrew/bin/gh"];
var PROMPT_WITH_GH = "Enjoying snote? s: star it on GitHub, using your GitHub CLI   n: no thanks";
var PROMPT_NO_GH = "Enjoying snote? s: open its GitHub page to star it   n: no thanks";
var CONSENT_LINE = "Star Donnishcomau/snote with gh, as the account gh is signed in to? [y/N]";
var RESULT_STARRED = "Starred Donnishcomau/snote on GitHub. Thank you.";
var RESULT_OPENED = "Opened the snote page on GitHub. Thank you.";
var RESULT_GH_FAILED = "gh could not star it, so snote opened the GitHub page instead.";
var RESULT_BROWSER = "Could not open a browser. The page is github.com/Donnishcomau/snote";
var RESULT_NO = "No problem. snote will not ask again.";
var bridge = null;
var pokeStar = () => {
  bridge?.poke();
};
var updateAskOpen = () => bridge?.askOpen() ?? false;
var updateAskSeen = () => bridge?.askSeen() ?? false;
function attachStarUi(next) {
  bridge = next;
  if (armedDir || phase !== "closed") bind();
  pokeStar();
}
var phase = "closed";
var text = "";
var result = "";
var guardUntil = 0;
var consentGuardUntil = 0;
var clock = () => Date.now();
var booted = Date.now();
var armedDir = null;
var counted = false;
var mem;
var primed = null;
var quietAt = null;
var wasBusy = false;
var customRun = null;
var pageOpener;
var forcedGh;
var lastChild = null;
var now = () => clock();
function setStarNow(fn) {
  clock = fn;
}
function setStarBoot(ms) {
  booted = ms;
}
function setForcedGh(gh) {
  forcedGh = gh;
}
function setPageOpener(file) {
  pageOpener = file;
}
function setStarRun(fn) {
  customRun = fn;
}
function starPromptPath(dir) {
  return join(dir, FILE);
}
function starOff(env, flag) {
  return flag || env.SNOTE_STAR_PROMPT === "off" || env.SNOTE_STAR_PROMPT === "0";
}
function starShows() {
  return text;
}
function starConsent() {
  return phase === "consent";
}
function takeStarResult() {
  const r = result;
  result = "";
  return r;
}
function starEnv(env) {
  const out = {};
  for (const [k, v] of Object.entries(env)) if (!k.startsWith("SNOTE_")) out[k] = v;
  out.GH_PROMPT_DISABLED = "1";
  out.GH_NO_UPDATE_NOTIFIER = "1";
  out.NO_COLOR = "1";
  return out;
}
function replaceable(file) {
  try {
    return fs.lstatSync(file).isFile();
  } catch (e) {
    return e.code === "ENOENT";
  }
}
function readBody(dir) {
  const file = starPromptPath(dir);
  let st;
  try {
    st = fs.lstatSync(file);
  } catch (e) {
    return e.code === "ENOENT" ? null : "bad";
  }
  if (st.isSymbolicLink() || !st.isFile() || st.size > 512) return "bad";
  let raw;
  try {
    raw = fs.readFileSync(file, "utf8");
  } catch {
    return "bad";
  }
  if (Buffer.byteLength(raw) > 512) return "bad";
  try {
    const v = JSON.parse(raw);
    if (!v || typeof v !== "object" || Array.isArray(v)) return "bad";
    const o = v;
    const keys = Object.keys(o);
    if (keys.length !== 3 || keys.some((k) => k !== "launches" && k !== "firstLaunch" && k !== "asked")) return "bad";
    if (!Number.isInteger(o.launches) || o.launches < 0 || !Number.isInteger(o.firstLaunch) || typeof o.asked !== "boolean") return "bad";
    return { launches: o.launches, firstLaunch: o.firstLaunch, asked: o.asked };
  } catch {
    return "bad";
  }
}
function writeState(dir, state) {
  const file = starPromptPath(dir);
  if (!replaceable(file)) return false;
  try {
    secureWriteFileSync(file, JSON.stringify({ launches: state.launches, firstLaunch: state.firstLaunch, asked: state.asked }));
    return true;
  } catch {
    return false;
  }
}
function markAsked(dir) {
  const cur = primed ?? readBody(dir);
  primed = null;
  if (cur === null || cur === "bad") return false;
  return writeState(dir, { launches: cur.launches, firstLaunch: cur.firstLaunch, asked: true });
}
function recordLaunch(dir, nowMs) {
  if (starOff(process.env, false)) return false;
  const cur = readBody(dir);
  if (cur === "bad" || cur !== null && cur.asked) return false;
  const next = cur === null ? { launches: 1, firstLaunch: nowMs, asked: false } : { launches: cur.launches + 1, firstLaunch: cur.firstLaunch, asked: cur.asked };
  return writeState(dir, next);
}
function eligible(state, s) {
  if (s.off || state.asked || s.busy || state.launches < MIN_LAUNCHES) return false;
  if (s.now - state.firstLaunch < MIN_DAYS * DAY_MS) return false;
  if (s.now - s.startedAt <= AGE_MS) return false;
  if (s.quietAt !== null && s.now - s.quietAt < QUIET_MS) return false;
  if (updateAskSeen() && !updateAskOpen() || bridge?.handed?.()) return false;
  if (updateAskOpen() || s.syncError || s.conflict || s.unsent) return false;
  return true;
}
function tryOpen(dir, s) {
  if (phase !== "closed" || s.off || starOff(process.env, false)) return false;
  const st = readBody(dir);
  if (st === "bad" || st === null || !eligible(st, s)) return false;
  primed = st;
  if (!markAsked(dir)) return false;
  showAsk(ghPath() !== null);
  return true;
}
function trusted(cand) {
  try {
    const real = fs.realpathSync(cand);
    const st = fs.lstatSync(real);
    if (!st.isFile() || (st.mode & 73) === 0) return null;
    const uid = typeof process.getuid === "function" ? process.getuid() : st.uid;
    if (st.uid !== 0 && st.uid !== uid) return null;
    if ((st.mode & 18) !== 0) return null;
    return real;
  } catch {
    return null;
  }
}
function resolveGh(list = GH_CANDIDATES) {
  for (const cand of list) {
    const hit = trusted(cand);
    if (hit) return hit;
  }
  return null;
}
function ghPath() {
  return forcedGh === void 0 ? resolveGh() : forcedGh;
}
function defaultOpener() {
  const p = process.platform === "darwin" ? "/usr/bin/open" : "/usr/bin/xdg-open";
  try {
    return fs.lstatSync(p).isFile() ? p : null;
  } catch {
    return null;
  }
}
function startChild(file, args, timeoutMs, detached) {
  if (customRun) return customRun(file, args, timeoutMs, detached);
  return new Promise((resolve) => {
    let code = 1;
    let settled = false;
    const done = (c) => {
      if (!settled) {
        settled = true;
        resolve(c);
      }
    };
    const child = spawn(file, [...args], {
      shell: false,
      stdio: "ignore",
      timeout: timeoutMs,
      env: starEnv(process.env),
      detached,
      killSignal: "SIGKILL"
    });
    lastChild = child;
    if (detached) child.unref();
    child.once("error", () => done(1));
    if (detached) child.once("spawn", () => done(0));
    else {
      child.once("exit", (c) => {
        code = c === 0 ? 0 : 1;
      });
      child.once("close", () => done(code));
    }
  });
}
function runBounded(file, args, timeoutMs) {
  return startChild(file, args, timeoutMs, false);
}
async function openPage(kind) {
  const bin = pageOpener === void 0 ? defaultOpener() : pageOpener;
  if (!bin) {
    finish(RESULT_BROWSER);
    return;
  }
  const code = await startChild(bin, [REPO_URL], OPEN_MS, true);
  finish(kind === "gh-failed" ? code === 0 ? RESULT_GH_FAILED : RESULT_BROWSER : code === 0 ? RESULT_OPENED : RESULT_BROWSER);
}
function finish(line) {
  phase = "done";
  text = "";
  result = line;
  pokeStar();
}
function showAsk(hasGh) {
  phase = "ask";
  text = hasGh ? PROMPT_WITH_GH : PROMPT_NO_GH;
  guardUntil = now() + GUARD_MS;
  pokeStar();
}
function showConsent() {
  phase = "consent";
  text = CONSENT_LINE;
  consentGuardUntil = now() + GUARD_MS;
  pokeStar();
}
function starIgnores() {
  return phase === "auth" || phase === "ask" && now() < guardUntil || phase === "consent" && now() < consentGuardUntil;
}
function starNo() {
  if (phase === "closed" || phase === "done") return;
  finish(RESULT_NO);
}
function starAsk(input, escape) {
  if (phase !== "ask" || starIgnores()) return;
  if (input === "n" || escape) {
    starNo();
    return;
  }
  if (input !== "s") return;
  const gh = ghPath();
  if (!gh) {
    void openPage("opened");
    return;
  }
  phase = "auth";
  text = "";
  pokeStar();
  void startChild(gh, AUTH_ARGV, AUTH_MS, false).then((code) => {
    if (phase !== "auth") return;
    if (code === 0) showConsent();
    else void openPage("gh-failed");
  });
}
async function starYes() {
  if (phase !== "consent" || starIgnores()) return;
  const gh = ghPath();
  if (!gh) return;
  phase = "auth";
  text = "";
  pokeStar();
  const code = await startChild(gh, STAR_ARGV, STAR_MS, false);
  if (phase !== "auth") return;
  if (code === 0) finish(RESULT_STARRED);
  else await openPage("gh-failed");
}
function starConsumesKey(input, escape) {
  if (phase !== "ask" && phase !== "auth" && phase !== "consent") return false;
  return starIgnores() || phase === "consent" || input === "s" || input === "n" || escape;
}
function noteFromApp() {
  const s = bridge?.read?.();
  if (!s) return;
  const m = s.message ?? "";
  const busy = s.busy;
  const t = now();
  const flags = { conflict: m.includes("kept both versions") || m.includes("could not be merged") || m.includes("conflicting"), unsent: s.pending > 0 || m.includes("not sent yet") || m.includes("unsynced"), syncError: s.word === "offline" || s.word === "stale" || m.includes("could not re-send") || m.includes("sync server") || m.includes("sync connection") };
  if (busy && phase !== "closed" && phase !== "done" || (flags.syncError || flags.conflict || flags.unsent) && (phase !== "closed" || result !== "")) {
    if (flags.syncError || flags.conflict || flags.unsent) result = "";
    if (phase !== "closed" && (phase !== "done" || flags.syncError || flags.conflict || flags.unsent)) {
      phase = "closed";
      text = "";
    }
    pokeStar();
  }
  if (wasBusy && !busy) quietAt = t;
  wasBusy = busy;
  if (!armedDir || starOff(process.env, false)) return;
  consider({ now: t, startedAt: booted, quietAt, busy, ...flags, off: false });
}
function consider(s) {
  const c = mem;
  if (!armedDir || c === "stop" || c === void 0 || phase !== "closed") return;
  if (c === "bad" || c === null || c.asked || c.launches < MIN_LAUNCHES) {
    mem = "stop";
    return;
  }
  if (!eligible(c, s)) return;
  mem = "stop";
  tryOpen(armedDir, s);
}
function bind() {
  bridge?.bind(noteFromApp, starConsumesKey, () => phase === "ask" || phase === "auth" || phase === "consent", takeStarResult, () => phase === "consent");
}
function armStar(dir) {
  if (starOff(process.env, false)) return;
  armedDir = dir;
  if (!counted) {
    counted = true;
    recordLaunch(dir, now());
    mem = readBody(dir);
  }
  bind();
  pokeStar();
}
function openLineForTest(hasGh) {
  bind();
  showAsk(hasGh);
}
function resetStarPrompt() {
  lastChild?.kill("SIGKILL");
  lastChild = null;
  phase = "closed";
  text = "";
  result = "";
  guardUntil = 0;
  consentGuardUntil = 0;
  clock = () => Date.now();
  booted = Date.now();
  armedDir = null;
  counted = false;
  mem = void 0;
  primed = null;
  quietAt = null;
  wasBusy = false;
  customRun = null;
  pageOpener = void 0;
  forcedGh = void 0;
}

export {
  MIN_LAUNCHES,
  MIN_DAYS,
  AGE_MS,
  QUIET_MS,
  GUARD_MS,
  GH_CANDIDATES,
  PROMPT_WITH_GH,
  PROMPT_NO_GH,
  CONSENT_LINE,
  RESULT_STARRED,
  RESULT_OPENED,
  RESULT_GH_FAILED,
  RESULT_BROWSER,
  RESULT_NO,
  attachStarUi,
  setStarNow,
  setStarBoot,
  setForcedGh,
  setPageOpener,
  setStarRun,
  starPromptPath,
  starOff,
  starShows,
  starConsent,
  takeStarResult,
  starEnv,
  recordLaunch,
  eligible,
  tryOpen,
  resolveGh,
  runBounded,
  starIgnores,
  starNo,
  starAsk,
  starYes,
  starConsumesKey,
  armStar,
  openLineForTest,
  resetStarPrompt
};
