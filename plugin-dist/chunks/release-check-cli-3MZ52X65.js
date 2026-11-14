#!/usr/bin/env node
import { createRequire as __cr } from 'node:module';
const require = __cr(import.meta.url);
import {
  verifyReleaseCommit
} from "./chunk-SKKL7M4H.js";
import "./chunk-Z3QLLVDS.js";
import "./chunk-C347G3S2.js";
import "./chunk-BQ6AXYOB.js";
import "./chunk-SRSFEH3H.js";

// src/core/release-check-cli.ts
import * as fs from "node:fs";
import * as path from "node:path";
async function releaseCheck(args, runningVersion, entry, log) {
  const [cloneDir, commit, tag] = args;
  if (args.length !== 3 || cloneDir === void 0 || commit === void 0 || tag === void 0 || entry === void 0) {
    log("The release check needs a clone folder, a commit and a tag.");
    return 1;
  }
  let own;
  try {
    own = path.dirname(fs.realpathSync(entry));
  } catch {
    log("The running snote could not find its own folder.");
    return 1;
  }
  const r = await verifyReleaseCommit({ cloneDir: path.resolve(cloneDir), commit, tag, runningVersion, allowedSignersPath: path.join(own, "allowed_signers") });
  if (r.ok === false) {
    log(r.reason);
    return 1;
  }
  return 0;
}
export {
  releaseCheck
};
