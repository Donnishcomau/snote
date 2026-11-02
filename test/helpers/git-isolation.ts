// #278: a test's scratch git repo must never resolve to the enclosing worktree. Two ways it did:
// 1. the run inherited git's repo-locating variables (GIT_DIR, GIT_WORK_TREE, GIT_INDEX_FILE ...), for example when
//    vitest is started from a git hook; every `git commit` then lands in that repo whatever `cwd` says;
// 2. the scratch dir sat under the worktree (a TMPDIR inside it) and discovery climbed into it.
// isolateGitEnv() drops the first and sets GIT_CEILING_DIRECTORIES to the scratch root for the second.
import os from 'node:os';

export const REPO_LOCATING_VARS = [
  'GIT_DIR',
  'GIT_WORK_TREE',
  'GIT_INDEX_FILE',
  'GIT_OBJECT_DIRECTORY',
  'GIT_ALTERNATE_OBJECT_DIRECTORIES',
  'GIT_COMMON_DIR',
  'GIT_PREFIX',
  'GIT_NAMESPACE',
  'GIT_CEILING_DIRECTORIES',
] as const;

export function isolateGitEnv(env: NodeJS.ProcessEnv = process.env, scratchRoot: string = os.tmpdir()): void {
  for (const k of REPO_LOCATING_VARS) delete env[k];
  env.GIT_CEILING_DIRECTORIES = scratchRoot;
}
