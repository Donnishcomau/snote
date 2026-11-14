import * as fs from 'node:fs';
import * as path from 'node:path';

import { verifyReleaseCommit } from './release-verify';

/**
 * #68 (L4): `snote --verify-release <clone> <commit> <tag>`. packaging/omarchy/setup runs it with the INSTALLED build
 * before the bar update moves the plugin clone. The signature is checked with the allowed_signers in the running
 * build's own folder (beside its real cli.js), never with a file of the fetched release; any failure is a refusal.
 * proof: test/core/release-check-cli.test.ts
 */
export async function releaseCheck(args: string[], runningVersion: string, entry: string | undefined, log: (text: string) => void): Promise<number> {
  const [cloneDir, commit, tag] = args;
  if (args.length !== 3 || cloneDir === undefined || commit === undefined || tag === undefined || entry === undefined) {
    log('The release check needs a clone folder, a commit and a tag.');
    return 1;
  }
  let own: string;
  try {
    own = path.dirname(fs.realpathSync(entry));
  } catch {
    log('The running snote could not find its own folder.');
    return 1;
  }
  const r = await verifyReleaseCommit({ cloneDir: path.resolve(cloneDir), commit, tag, runningVersion, allowedSignersPath: path.join(own, 'allowed_signers') });
  if (r.ok === false) {
    log(r.reason);
    return 1;
  }
  return 0;
}
