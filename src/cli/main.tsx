// snote entry point (, part 1): builds the store the real app runs on.
// No top-level side effects: importing this file starts nothing.

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import React from 'react';
import { render } from 'ink';

// one new import.
import { crashReport } from '../core/crash-report';
import { isLockError } from '../core/crash-redact';
import { storedCrashBundle } from '../core/crash-bundle';
// data files private: mkdirs 0o700, files 0o600.
// proof: test/core/private-files.test.ts
import { isSymlinkFolder, secureMkdir, secureRename, secureWriteFileSync } from '../core/secure-fs';
// the crash bundle carries a redacted session snapshot.
// proof: test/cli/crash-handler.test.ts
import { sessionSnapshot } from '../core/crash-ring';
import type { SessionSnapshot } from '../core/crash-ring';
// the last key presses before the crash.
import { getKeyLog } from '../tui/app-keys';
import { makeStore } from '../core/store';
// loadState for the live `--report` bundle.
import { loadState, persistOnChange } from '../core/persistence';
import { FileGhostStore } from '../core/ghost-store';
// a note the server holds but state.json lost (killed inside the
// save debounce) is added back from the ghost file at start-up.
import { restoreNotesFromGhosts } from '../core/ghost-restore';
// #65: editor drafts left by a failed editor or a crash come back as notes.
import { draftsDir, recoverDrafts, recoveryNotice, setDraftsDir } from '../core/editor-drafts';
import type { TooLargeDraft } from '../core/editor-drafts';
// T85 — re-queue notes newer than their ghost on start-up.
import { requeueUnsynced } from '../core/requeue';
// the record of local changes the server never confirmed: kept and
// re-sent on restart whatever the ghost's date says.
import { loadUnsynced, loadUnsyncedNotes, overlayUnsyncedNotes, trackUnsynced } from '../core/unsynced';
import { whenCatchUpApplied } from '../core/simperium-reconnect-fix';
// make the server's echo of a pre-quit change the library's own
// acknowledgement after a restart (, issue #9).
import { trackOwnEchoes } from '../core/own-echoes';
// resend offline "delete forever" ops at start-up (FR-5).
import { dropTombstonedNotes, resendDeletions, trackDeletions } from '../core/tombstones';
import { installTombstoneIndexFix } from '../core/simperium-tombstone-index-fix';
import { installStaleChangeFix } from '../core/simperium-stale-change-fix';
import { parseCli, checkReport, splitNewFlag, splitNotifyFlag, USAGE } from './args';
// #17 — opt-in screen-reader mode: `--screen-reader` or SNOTE_SCREEN_READER=1.
import { screenReaderMode } from './screen-reader';
// a fire-and-forget failure that cannot reach the screen shows on the notice line.
import { problemText, publishInfo, publishProblem } from '../core/problem-signal';
// the bar widget's status file: watch, path, and removal on logout.
import {
  statusDir,
  watchStatus,
  removeStatusFile,
  clearUpdateStatusFile,
} from '../core/status-file';
// cross-process "open a new note": the sender and the running watcher.
import {
  requestNewNote,
  watchNewRequests,
  emitNewRequest,
} from '../core/new-request';
// `--version`/`-v` prints `snote <version>` from package.json.
import { VERSION } from './version'; import { setShownVersion } from '../core/shown-version';
import { sanitizeForTerminal } from '../core/sanitize';
import { envReport } from './env-check';
import { checkEndpoints } from '../core/endpoint-check';
// one data folder per account: accountDir + prepareDataDir.
import {
  defaultDataDir,
  logout,
  sweepStaleTemps,
  prepareDataDir,
  loadToken,
} from '../core/token';
import { setDataRoot } from '../core/data-root';
import { recordAccountId, recordSavedAccountId, resolveAccountDir } from '../core/account-id';
// start-up update checks (local first, then the daily remote one).
// one snote process per account dir: stale locks reclaimed, live ones refuse.
import { acquireInstanceLock, UNLOCKED_NOTICE } from '../core/instance-lock';
// T73 — login calls now come from ./login-calls, not direct auth imports.
import { loginCalls } from './login-calls';
import { APP_ID } from '../core/config';
import { Root } from '../tui/Root';
import type { Auth } from '../tui/Root';
// the output guard. process.stdout meets
// the guard's MinimalOutputStream (write(chunk, ...args)) structurally.
import { guardOutputStream, setPlainOutput } from '../core/output-guard';
import { quitTarget } from '../core/quit-target';

interface BuildStoreOptions {
  dataDir: string;
  appId: string;
  server?: string;
  noteEditDelayMs?: number;
  authWatchdogMs?: number;
  statusDir?: string;
  statusDelayMs?: number;
  newRequestPollMs?: number;
}

export function buildStore(
  opts: BuildStoreOptions,
  auth: { email: string; token: string },
  onLogout: () => void
): { store: ReturnType<typeof makeStore>; stopSaving: () => void } {
  // claim the dir before anything reads or writes it. A live
  // process's lock throws synchronously, naming its pid; a stale one
  // (crash, kill -9) is reclaimed. Released by `stopSaving` below, and on
  // logout — both run the same closure, and release is synchronous so no
  // debounced save can land after the dir is gone.
  const instanceLock = acquireInstanceLock(opts.dataDir);
  if (instanceLock.unlocked) publishInfo(UNLOCKED_NOTICE[instanceLock.unlocked]); // #385
  sweepStaleTemps(opts.dataDir);
  // T73 — stop the saver before onLogout wipes the data dir,
  // so no debounced timer can rewrite state.json after a logout.
  let stopSaving = instanceLock.release;
  // T85 — keep the note bucket's ghost store so start-up can
  // re-queue notes whose local copy is newer than the last sync.
  let noteGhosts: FileGhostStore<unknown> | undefined;
  // read the record of unconfirmed local changes before the store is
  // built: restoreNotesFromGhosts and requeueUnsynced both consult it, and
  // it is only ever written by trackUnsynced below, never by the 500 ms save.
  const unsynced = loadUnsynced(opts.dataDir);
  const loadedState = loadState(opts.dataDir);
  const savedNotes = loadUnsyncedNotes(opts.dataDir);
  // #545: no loadable state.json but saved pending notes: lay them over an empty notes Map (the reducers fill the rest of the data slice)
  const basisState = loadedState ?? (Object.keys(savedNotes).length > 0 ? { data: { notes: new Map() } } : undefined);
  const preloadedState = dropTombstonedNotes(opts.dataDir, overlayUnsyncedNotes(basisState as typeof loadedState, unsynced, savedNotes));
  const store = makeStore({
    preloadedState,
    sync: {
      appId: opts.appId,
      token: auth.token,
      username: auth.email,
      clientOptions: opts.server ? { url: opts.server } : undefined,
      ghostStoreProvider: (b) => {
        const g = new FileGhostStore(opts.dataDir, b.name);
        if (b.name === 'note') {
          noteGhosts = g as FileGhostStore<unknown>;
        }
        return g;
      },
      noteEditDelayMs: opts.noteEditDelayMs,
      authWatchdogMs: opts.authWatchdogMs,
      onLogout: () => {
        stopSaving();
        if (opts.statusDir) {
          removeStatusFile(opts.statusDir);
        }
        onLogout();
      },
    },
  });
  // the owed-ack tracker: records every change the note channel
  // sends and its acknowledgements, so after a restart the server's echo
  // of a change sent before the last quit reads as this client's own
  // confirmation instead of being applied a second time. Created before
  // the first start-up save can run.
  // it also reads each note as loaded from state.json, to tell a
  // change made in this session from the echo of one sent before the quit.
  const ownEchoes = trackOwnEchoes(store.client, opts.dataDir, preloadedState?.data?.notes);
  const startSaving = persistOnChange(store, opts.dataDir);
  // #65: editor drafts live in this account's folder, under its instance
  // lock. A draft no note holds (the editor failed, or snote died before
  // the note was saved) comes back as a new note; queued after the ghost
  // restore above, so a note the ghost holds is not added twice.
  setDraftsDir(path.join(opts.dataDir, 'drafts'));
  setTimeout(() => {
    const tooLarge: TooLargeDraft[] = [];
    const report = { changed: 0 };
    const notice = recoveryNotice(recoverDrafts(store, draftsDir(), tooLarge, report), tooLarge, report.changed);
    if (notice !== null) publishInfo(notice); // #89: not a failure, so not the error style
  }, 0);
  // keep the unsynced record fresh: written at once whenever the
  // pending set changes, never by the debounced state.json save.
  const unsyncedTracker = trackUnsynced(store, opts.dataDir, loadedState === undefined && fs.existsSync(path.join(opts.dataDir, 'state.json')));
  // #545: an unloadable state.json is kept as state.json.corrupt before the first full save replaces it
  if (loadedState === undefined) { try { secureRename(path.join(opts.dataDir, 'state.json'), path.join(opts.dataDir, 'state.json.corrupt')); } catch { /* missing: nothing to keep */ } }
  const stopUnsynced = unsyncedTracker.stop;
  // with a status dir (the bar plugin's), keep status.json fresh;
  // stopStatus flushes any pending write at shutdown.
  const stopStatus = opts.statusDir
    ? watchStatus(store, opts.statusDir, { delayMs: opts.statusDelayMs })
    : () => {};
  // the running instance listens for `new-note.request` dropped by
  // `snote --notify-new`; each request becomes an emitNewRequest().
  const stopNewRequests = watchNewRequests(opts.dataDir, emitNewRequest, {
    pollMs: opts.newRequestPollMs,
  });
  // the returned stopSaving also releases the instance lock. The
  // marker line below is the OMARCHY: boundary cast one structure.test counts.
  stopSaving = () => {
    startSaving();
    stopUnsynced();
    // quit and logout both stop the owed-ack tracker here: the
    // library keeps sending until client.end(), and a late write would
    // re-create sent-changes.json (and the account folder) after a stop.
    ownEchoes.stop();
    stopStatus();
    // quit clears the notice: status.json loses its `update` key.
    // the same write sets `alive` to the epoch so the bar
    // says "snote is not running" at once; it runs after stopStatus, so
    // no later heartbeat can overwrite the mark.
    if (opts.statusDir) clearUpdateStatusFile(opts.statusDir);
    stopNewRequests();
    instanceLock.release();
  };
  // T85 — re-queue notes newer than their ghost on start-up (FR-5).
  // OMARCHY: boundary cast — FileGhostStore structurally satisfies GhostReader.
  if (noteGhosts)
    void requeueUnsynced(
      store,
      noteGhosts as unknown as Parameters<typeof requeueUnsynced>[1],
      // offline edits wait for the note bucket's catch-up, then rebase
      () => whenCatchUpApplied(store.client, 'note'),
      // a change the record says the server never confirmed is
      // re-sent even when the ghost's date is newer.
      unsynced,
      preloadedState?.data?.notes
    ).then(
      // the start-up re-send is over: a carried entry that never went
      // pending with it was found equal to its ghost, so it leaves the record.
      () => unsyncedTracker.settle(),
      (err) => {
        publishProblem(problemText('could not re-send offline edits', err));
      }
    );
  // once the start-up catch-up is applied, entries the record
  // loaded whose echo never came leave it (they were never owed).
  // #27 — only a catch-up that was really applied, not the 4 s fallback: an
  // echo that comes later must still be recognised.
  void whenCatchUpApplied(store.client, 'note', false).then(
    () => ownEchoes.settle(),
    () => ownEchoes.settle()
  );
  void whenCatchUpApplied(store.client, 'note').then(() => { (store as unknown as Record<symbol, boolean>)[Symbol.for('snote.noteCatchUpApplied')] = true; }); // #401: the quit step sends only after this store's catch-up
  // state.json lands on a 500 ms debounce while the ghost file and its
  // cv land at once, so a note the server confirmed inside that window is
  // missing from state.json when the process dies. The ghost holds the
  // server's copy, so add those notes back to the store; nothing is sent.
  // #130 — at once, before buildStore returns: no socket message (a later
  // task) can arrive first. Deferred one turn, a catch-up that landed first
  // had its echo confirmed, then this restore put the ghost's older copy back
  // in the store and the next edit removed the confirmed change on the server.
  // After the re-send above took its snapshot of the notes, as before.
  if (noteGhosts) restoreNotesFromGhosts(store, noteGhosts, unsynced);
  // record every "delete forever" in the tombstone file and
  // resend the removal for each tombstone the server still holds (FR-5).
  trackDeletions(store, opts.dataDir);
  // (#125) — an index page never re-creates a note deleted forever here.
  installTombstoneIndexFix(store.client, opts.dataDir);
  // #543 — a remote change applies only on its own source version.
  installStaleChangeFix(store.client);
  if (noteGhosts) {
    // OMARCHY: boundary cast — FileGhostStore structurally satisfies GhostVersions.
    void resendDeletions(
      store,
      opts.dataDir,
      noteGhosts as unknown as Parameters<typeof resendDeletions>[2]
    ).catch((err) => {
      publishProblem(problemText('could not re-send deletions', err));
    });
  }
  return { store, stopSaving };
}

// one data folder per account: the store lives under
// `<dataDir>/<email>/`; only `auth.json` stays in the root. Same contract
// as buildStore, pointed at the account's own folder.
export function accountStore(
  opts: {
    dataDir: string;
    appId: string;
    server?: string;
    noteEditDelayMs?: number;
    authWatchdogMs?: number;
    statusDir?: string;
    statusDelayMs?: number;
  },
  auth: { email: string; token: string },
  onLogout: () => void
): { store: ReturnType<typeof makeStore>; stopSaving: () => void } {
  // the account folder must exist before the ghost store and
  // persistence write into it; create it (root migration is done by the
  // caller's prepareDataDir, which only moves files when a token is present).
  const dir = resolveAccountDir(opts.dataDir, auth.email, opts.server);
  secureMkdir(dir);
  const built = buildStore({ ...opts, dataDir: dir }, auth, onLogout);
  try { recordAccountId(dir, auth.email, opts.server); } catch (e) { built.stopSaving(); throw e; }
  return built;
}

// the crash state dir: `<XDG_STATE_HOME or ~/.local/state>/snote`.
// Deliberately NOT the data dir, so a logout never removes a crash report.
function stateDir(): string {
  const xdg = process.env.XDG_STATE_HOME;
  if (xdg && xdg !== '') {
    return path.join(xdg, 'snote');
  }
  return path.join(os.homedir(), '.local', 'state', 'snote');
}

// `snote --report`: write the same kind of bundle a crash would,
// from the CURRENT (live) data, so a user can hand it to their coding
// agent any time. If a crash just happened, reuse that crash's own bundle
// instead of a fresh snapshot.
async function writeReport(log: (text: string) => void, dataDir: string): Promise<number> {
  const dir = stateDir();
  let bundle: Record<string, unknown>;
  try {
    //'s crash files sort by filename: ISO timestamps sort
    // lexicographically = chronologically, so the last name is the latest.
    // (The dir may not exist yet; that is not an error, just no crash.)
    const crashes = fs
      .readdirSync(dir)
      .filter((f) => f.startsWith('crash-') && f.endsWith('.json'))
      .sort();
    if (crashes.length > 0) {
      const raw = fs.readFileSync(path.join(dir, crashes.at(-1)!), 'utf8');
      // The file may predate redaction: its error goes through the same
      // redaction before it is re-shared.
      // proof: test/cli/report-old-crash.test.ts
      bundle = storedCrashBundle(JSON.parse(raw) as Record<string, unknown>, os.homedir());
    }
  } catch (err) {
    if ((err as { code?: string }).code !== 'ENOENT') {
      log('could not be saved');
      return 0;
    }
  }
  if (!bundle!) {
    try {
      // the app saves state.json inside the saved account's folder
      //, so read it from the same folder --notify-new uses. With no
      // auth.json there is no saved account and the root is the source.
      const saved = await loadToken(dataDir);
      const stateFolder = saved ? resolveAccountDir(dataDir, saved.email, saved.server) : dataDir;
      const store = makeStore({ preloadedState: loadState(stateFolder), stubClient: {} });
      const session = sessionSnapshot(store.getState(), getKeyLog(), {
        columns: process.stdout.columns ?? 80,
        rows: process.stdout.rows ?? 24,
        version: '0.0.1',
      });
      bundle = { source: 'live', session };
    } catch {
      log('could not be saved');
      return 0;
    }
  }
  const file = path.join(
    dir,
    `report-${new Date().toISOString().replaceAll(':', '-')}.json`,
  );
  try {
    secureMkdir(dir);
    secureWriteFileSync(file, JSON.stringify(bundle, null, 2));
  } catch {
    log('could not be saved');
    return 0;
  }
  log(file);
  log(
    'Hand this file to your coding agent and say: "reproduce and fix this". ' +
      'It knows what to do (.claude/skills/snote-fix).',
  );
  return 0;
}

// T33 entry point below.
export async function main(
  argv: string[],
  io?: { log: (text: string) => void }
): Promise<number> {
  const rawLog = io?.log ?? console.log;
  const log = (text: string): void => rawLog(sanitizeForTerminal(text)); // #200: every pre-start line

  // `--report` is stripped before parseCli: CliOptions's shape is
  // fixed (strict parseArgs would reject it), and the report runs instead
  // of the login/render flow.
  const reportOnly = argv.includes('--report');
  // `--notify-new` is stripped here too (same strict-parser reason);
  // it sends a request to a running instance instead of rendering.
  const { args: argsWithoutReport, notifyNew } = splitNotifyFlag(
    argv.filter((a) => a !== '--report')
  );
  const { args: argsWithoutNew, startNew } = splitNewFlag(argsWithoutReport);
  const { args, on: screenReader } = screenReaderMode(argsWithoutNew, process.env);

  // `--version`/`-v` is stripped before parseCli too: CliOptions's
  // shape is fixed, so the strict parser would reject it. Print the
  // version from package.json and leave.
  if (argv.includes('--version') || argv.includes('-v')) {
    log(`snote ${VERSION}`);
    return 0;
  }

  let o;
  try {
    o = parseCli(args);
  } catch (e) {
    log(`error: ${(e as Error).message}`);
    log(USAGE);
    return 2;
  }

  // write the bundle and leave before the normal flow starts.
  if (reportOnly) {
    return writeReport(log, o.dataDir ?? defaultDataDir());
  }

  const dataDir = o.dataDir ?? defaultDataDir();
  // publish the resolved root so the blog sites read/write there.
  setDataRoot(dataDir); setShownVersion(VERSION);
  const appId = o.appId ?? APP_ID;

  if (o.help) {
    log(USAGE);
    return 0;
  }

  // #214 — a symlinked data folder (or bar plugin data folder) is refused
  // before anything is read, written or removed through it.
  // proof: test/core/secure-mkdir-symlink.test.ts
  if ([dataDir, statusDir(process.env)].some(isSymlinkFolder)) {
    log('snote data folder is a symlink: remove it and start again');
    return 2;
  }

  // an endpoint override carries credentials, so refuse http unless
  // it points at the loopback, and flag any run with TLS checks disabled.
  const endpoints = checkEndpoints(process.env);
  for (const w of endpoints.warnings) log(w);
  if (endpoints.errors.length > 0) {
    for (const e of endpoints.errors) log(e);
    return 2;
  }

  if (o.check) {
    log(
      checkReport({
        editor: process.env.EDITOR ?? 'nvim',
        dataDir,
        columns: process.stdout.columns ?? 80,
        rows: process.stdout.rows ?? 24,
      })
    );
    log(envReport(process.env));
    return 0;
  }

  if (o.logout) {
    await logout(dataDir);
    removeStatusFile(statusDir(process.env));
    log('logged out');
    return 0;
  }

  // ask the running instance to open a new note and leave: 0 when a
  // request was sent, 3 when there is no auth.json or no running instance.
  // Prints nothing either way; runs before prepareDataDir so it never
  // creates or migrates anything.
  if (notifyNew) {
    const saved = await loadToken(dataDir);
    if (!saved) {
      return 3;
    }
    return requestNewNote(resolveAccountDir(dataDir, saved.email, saved.server)) === 'sent' ? 0 : 3;
  }

  // move an old single-folder install into the saved
  // account's folder before the store is built (after the --check/--logout
  // branches, so those never touch the dir).
  await prepareDataDir(dataDir);
  await recordSavedAccountId(dataDir);

  // T73 — three login calls (code, complete, password) for the root screen.
  const calls = loginCalls(o.server, appId);

  // T73 — keep the stopSaving of the latest buildStore call and
  // flush it after waitUntilExit (T33 dropped it, losing the last 500ms on quit).
  let stopSaving = () => {};
  // keep the latest store too, so the crash handler can snapshot it.
  let lastStore: ReturnType<typeof accountStore>['store'] | undefined;
  // #428 — the quit step's store: the account signed in now (lastStore stays the crash snapshot's).
  const quit = quitTarget<ReturnType<typeof accountStore>['store']>();
  const makeStoreFor = (auth: Auth, onLogout: () => void) => {
    const tracked = quit.track(onLogout);
    // only users who installed the bar plugin (its setup creates
    // the directory) get the status file; snote never creates it.
    const dir = statusDir(process.env);
    const built = accountStore(
      { dataDir, appId, server: o.server, statusDir: fs.existsSync(dir) ? dir : undefined },
      auth,
      tracked.onLogout
    );
    stopSaving = built.stopSaving;
    lastStore = built.store;
    tracked.bind(built.store);
    // start checks only when the opt-out switch allows it, so no test path spawns git.
    // test/setup.ts sets the sentinel `disabled` (not `off`, which update-check.test.ts pins to its own per-test env).
    // diet3 (#30): the update check and watch (the release fetch and its parsing) load with import() once the store exists, so the start set does not carry them.
    if (process.env.SNOTE_UPDATE_CHECK !== 'disabled') {
      void (async () => {
        const { updateCheckEnabled } = await import('../core/update-check');
        if (!updateCheckEnabled(process.env)) return;
        const { homepageGuard, runningInstallKind, updateChecksFor } = await import('../core/install-kind');
        if (!updateChecksFor(runningInstallKind())) return;
        const { runUpdateChecks } = await import('../core/update-run');
        const { startUpdateWatch } = await import('../core/update-watch');
        void runUpdateChecks({ version: VERSION, home: os.homedir(), env: process.env, stateDir: statusDir(process.env), run: homepageGuard() }).catch(() => {});
        // #66 — keep checking every 24 h while snote stays open; the banner shows a newer release.
        startUpdateWatch({ version: VERSION, home: os.homedir(), env: process.env, stateDir: statusDir(process.env), run: homepageGuard() });
      })().catch(() => {});
    }
    return built.store;
  };

  // flag set by onLockError so main() returns non-zero on stale lock.
  let locked = false;

  // #17 — the screen-reader mode prints no colour and no bidi controls.
  setPlainOutput(screenReader);
  // wrap stdout with the output guard before Ink renders, so no
  // note text can program the terminal.
  // NodeJS.WriteStream is the guard's MinimalOutputStream at the boundary.
  guardOutputStream(process.stdout);
  // stderr needs the same guard: Ink's patchConsole and debug
  // logs write server-supplied text there.
  guardOutputStream(process.stderr);

  const { waitUntilExit, unmount, clear } = render(
    React.createElement(Root, {
      dataDir,
      server: o.server,
      width: process.stdout.columns ?? 80,
      height: process.stdout.rows ?? 24,
      makeStoreFor,
      startNew,
      requestCode: calls.requestCode,
      completeLogin: calls.completeLogin,
      passwordLogin: calls.passwordLogin,
      // when another process holds the instance lock, show the message
      // and return non-zero instead of swallowing into the login screen.
      onLockError: (msg: string) => {
        try {
          log(msg);
          locked = true;
          try { unmount(); } catch { /* ink-testing-library may throw */ }
        } catch { /* already handled */ }
      },
    }),
    // #17 — Ink's screen-reader output path is taken only on the opt-in
    // above, never from the environment Ink reads (an explicit boolean beats it); the
    // output guard filters that path too. Ink's own exit on Ctrl+C
    // is off; Root quits on Ctrl+C through the read gate, only when Ctrl+C is
    // a read of its own.
    { isScreenReaderEnabled: screenReader, exitOnCtrlC: false }
  );

  // one shared crash handler: an error anywhere (React render, an
  // event handler, a rejected promise) unmounts Ink, clears the screen,
  // saves the crash record to the state dir and prints three calm lines,
  // then main resolves 1. Runs at most once, even if two errors arrive.
  let crashed: Promise<number> | undefined;
  const crash = (err: unknown): Promise<number> => {
    if (crashed) return crashed;
    // if onLockError already handled a lock error, just return 1 —
    // don't call process.exit(1) again (which vitest blocks in tests).
    if (locked) {
      if (isLockError(err)) return Promise.resolve(1); // S5c-04: never throws
    }
    const report = crashReport(err, {
      version: '0.0.1',
      columns: process.stdout.columns ?? 80,
      rows: process.stdout.rows ?? 24,
      when: new Date(),
      home: os.homedir(),
    });
    const dir = stateDir();
    const file = path.join(
      dir,
      `crash-${report.record.when.replaceAll(':', '-')}.json`,
    );
    // the bundle is a replayable recipe: notes/tags/keys as they were
    // at the moment of the crash, redacted (lengths and keys only; typed and
    // pasted text is stored as `<text>`, never the characters themselves).
    // proof: test/cli/crash-handler.test.ts
    // proof: test/tui/key-ring-text.test.tsx
    let session: SessionSnapshot;
    try {
      if (lastStore) {
        session = sessionSnapshot(lastStore.getState(), getKeyLog(), {
          columns: process.stdout.columns ?? 80,
          rows: process.stdout.rows ?? 24,
          version: '0.0.1',
        });
      } else {
        // A crash before any store was built (e.g. before login): no real
        // State exists, so build the empty snapshot directly.
        session = {
          version: '0.0.1',
          terminal: `${process.stdout.columns ?? 80}x${process.stdout.rows ?? 24}`,
          noteCount: 0,
          noteLengths: [],
          tagCount: 0,
          collectionType: 'all',
          keys: getKeyLog(),
        };
      }
    } catch {
      session = {
        version: '0.0.1',
        terminal: `${process.stdout.columns ?? 80}x${process.stdout.rows ?? 24}`,
        noteCount: 0,
        noteLengths: [],
        tagCount: 0,
        collectionType: 'all',
        keys: [],
      };
    }
    let pathText: string;
    try {
      secureMkdir(dir);
      secureWriteFileSync(file, JSON.stringify({ ...report.record, session: { ...session, keysMasked: true } }, null, 2));
      pathText = file;
    } catch {
      pathText = 'could not be saved';
    }
    try {
      unmount();
    } catch {
      // already unmounted
    }
    try {
      clear();
    } catch {
      // not a TTY
    }
    process.stderr.write(report.message.replace('{path}', pathText) + '\n');
    // A crash ends the run with status 1. Node flushes pending writes on a
    // natural exit, but `process.exit()` discards a piped stdout write that
    // has not flushed yet, so drop to a synchronous fd write first.
    try {
      fs.fsyncSync(1);
    } catch {
      // not a seekable/regular fd; the buffered write will flush on exit
    }
    process.exit(1);
  };
  // `process.on` returns the process, so without void a window
  // handler would become a promise main() resolves with. An uncaught error
  // ends the process and Node's own exit code for one is 1, so set
  // `process.exitCode` synchronously here and let the natural exit finish
  // the job; forcing `process.exit()` from a microtask lands as status 0
  // under a piped stdio.
  const onUncaught = (err: Error): void => {
    process.exitCode = 1;
    void crash(err);
  };
  const onRejection = (reason: unknown): void => {
    process.exitCode = 1;
    void crash(reason);
  };
  process.on('uncaughtException', onUncaught);
  process.on('unhandledRejection', onRejection);
  // Ink's devtools-window-polyfill sets `globalThis.window`, so
  // React 19 dispatches render errors as a window ErrorEvent instead of
  // emitting 'uncaughtException'. Route them into the same handler and
  // mark the event handled so React does not fall through to console.error.
  // `window.error` is set so a missing real ErrorEvent constructor (plain
  // Node) cannot make the dispatch throw out of React's error reporter.
  const win = globalThis as unknown as {
    window?: {
      error?: unknown;
      addEventListener?: (t: string, l: (e: unknown) => void) => void;
    };
  };
  if (win.window && typeof win.window.addEventListener === 'function') {
    // ink's polyfill only sets `window ||= globalThis`, so neither
    // `window.ErrorEvent` nor `window.addEventListener` exists under Node and
    // React's `window.dispatchEvent(event)` would be undefined. Provide a
    // minimal EventTarget stand-in on the global (Node has no addEventListener
    // and does not use it elsewhere), dispatching by hand and honouring
    // preventDefault as the return value.
    const g = globalThis as unknown as {
      addEventListener?: (t: string, l: (e: unknown) => void) => void;
      dispatchEvent?: (e: unknown) => boolean;
    };
    const listeners = new Map<string, Set<(e: unknown) => void>>();
    g.addEventListener ??= (type: string, l: (e: unknown) => void): void => {
      let set = listeners.get(type);
      if (!set) {
        set = new Set();
        listeners.set(type, set);
      }
      set.add(l);
    };
    g.dispatchEvent ??= (e: unknown): boolean => {
      const type = (e as { type?: string }).type ?? 'error';
      for (const l of listeners.get(type) ?? []) l(e);
      return (e as { defaultPrevented?: boolean }).defaultPrevented !== true;
    };
    win.window.error ??= class ErrorEvent {
      type: string;
      message: string;
      error: unknown;
      defaultPrevented = false;
      constructor(type?: string, opts?: { message?: string; error?: unknown }) {
        this.type = type ?? 'error';
        this.message = opts?.message ?? '';
        this.error = opts?.error;
      }
      preventDefault(): void {
        this.defaultPrevented = true;
      }
    };
    win.window.addEventListener('error', (event: unknown) => {
      const e = event as {
        error?: unknown;
        message?: string;
        defaultPrevented?: boolean;
        preventDefault?: () => void;
      };
      // A listener ahead of ours already claimed this error; leave it alone.
      if (e.defaultPrevented === true) return;
      e.preventDefault?.();
      onUncaught((e.error ?? new Error(String(e.message))) as Error);
    });
  }

  let code = 0;
  try {
    await waitUntilExit();
  } catch (err) {
    code = await crash(err);
  }
  process.off('uncaughtException', onUncaught);
  process.off('unhandledRejection', onRejection);
  if (code !== 0) return code;

  // #401 — a normal quit hands pending note changes to the server and waits
  // at most 4 s; loaded lazily, and a failed load quits as before.
  const quitStore = quit.current();
  if (quitStore && !locked && !crashed) {
    try { (await import('../core/editor-write-watch')).settleDraftWrites(); } catch { /* quit as before */ } // #478
    try {
      const { sendBeforeQuit, unsentLine } = await import('../core/quit-send');
      const unsent = await sendBeforeQuit(quitStore);
      if (unsent > 0) log(unsentLine(unsent));
    } catch { /* quit as before */ }
    try { (await import('../core/editor-write-watch')).settleDraftWrites(); } catch { /* quit as before */ } // also a write made during the send wait
  }
  stopSaving();
  if (locked) return 1;
  return 0;
}
