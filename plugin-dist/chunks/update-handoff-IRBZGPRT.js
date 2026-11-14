#!/usr/bin/env node
import { createRequire as __cr } from 'node:module';
const require = __cr(import.meta.url);
import {
  pluginCloneDir
} from "./chunk-C347G3S2.js";
import "./chunk-SRSFEH3H.js";

// src/core/update-handoff.ts
import { spawn as nodeSpawn } from "node:child_process";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
var q = (s) => `'${s.replace(/'/g, `'\\''`)}'`;
function pluginHandOffArgv(home, env, waitSeconds = 10) {
  const l = q(path.join(env.XDG_DATA_HOME || path.join(home, ".local", "share"), "omarchy-snote-plugin", "run.lock"));
  const bar = q(path.join(pluginCloneDir(home), "packaging", "omarchy", "bar-update"));
  return ["omarchy-launch-floating-terminal-with-presentation", `if [ ! -f ${l} ] || [ -L ${l} ] || /usr/bin/flock -x -w ${waitSeconds} ${l} true; then ${bar} && omarchy-launch-or-focus-tui snote; else echo 'another snote is still running: quit it and press U again'; false; fi`];
}
async function startHandOff(o) {
  const no = (why) => ({ code: 1, line: `snote did not update: ${why}` });
  if (!o.saved) return no("your notes could not be saved");
  const home = o.home ?? os.homedir();
  const env = { ...o.env ?? process.env };
  delete env.NODE_OPTIONS;
  if (o.kind === "direct") return (await import("./direct-download-FMEB6A5I.js")).startDirectHandOff({ home, env, log: o.log, run: o.run ?? nodeSpawn });
  try {
    if (o.kind !== "plugin" || !fs.lstatSync(path.join(pluginCloneDir(home), "packaging", "omarchy", "bar-update")).isFile()) return no("the update script was not found");
  } catch {
    return no("the update script was not found");
  }
  const [cmd, ...args] = pluginHandOffArgv(home, env);
  return new Promise((resolve) => {
    try {
      const child = (o.run ?? nodeSpawn)(cmd, args, { detached: true, stdio: "ignore", env, timeout: 1e4 });
      child.once("error", () => resolve(no("the update terminal could not be started")));
      child.once("spawn", () => resolve((child.unref(), { code: 0, line: "" })));
    } catch {
      resolve(no("the update terminal could not be started"));
    }
  });
}
export {
  pluginHandOffArgv,
  startHandOff
};
