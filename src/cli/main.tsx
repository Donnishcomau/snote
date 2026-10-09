// snote entry point (T111, part 1): builds the store the real app runs on.
// No top-level side effects: importing this file starts nothing.

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import React from 'react';
import { render } from 'ink';

// T214 — one new import.
import { crashReport } from '../core/crash-report';
import { redactStoredError, redactStoredKeys, isLockError } from '../core/crash-redact';
// T291 — data files private: mkdirs 0o700, files 0o600.
import { secureMkdir, secureWriteFileSync } from '../core/secure-fs';
// T232 — the crash bundle carries a redacted session snapshot (T230).
import { sessionSnapshot } from '../core/crash-ring';
import type { SessionSnapshot } from '../core/crash-ring';
// T232 — the last key presses before the crash (T231).
import { getKeyLog } from '../tui/app-keys';
import { makeStore } from '../core/store';
// T233 — loadState for the live `--report` bundle.
import { loadState, persistOnChange } from '../core/persistence';
import { FileGhostStore } from '../core/ghost-store';
// T445 — a note the server holds but state.json lost (killed inside the
// save debounce) is added back from the ghost file at start-up.
import { restoreNotesFromGhosts } from '../core/ghost-restore';
// T85 — re-queue notes newer than their ghost on start-up.
import { requeueUnsynced } from '../core/requeue';
// T493 — the record of local changes the server never confirmed: kept and
// re-sent on restart whatever the ghost's date says.
import { loadUnsynced, trackUnsynced } from '../core/unsynced';
import { whenCatchUpApplied } from '../core/simperium-reconnect-fix';
// T151 — resend offline "delete forever" ops at start-up (FR-5).
import { dropTombstonedNotes, resendDeletions, trackDeletions } from '../core/tombstones';
import { parseCli, checkReport, splitNewFlag, splitNotifyFlag, USAGE } from './args';
// T443 — a fire-and-forget failure that cannot reach the screen shows on the notice line.
import { problemText, publishProblem } from '../core/problem-signal';
// T358 — the bar widget's status file: watch, path, and removal on logout.
import {
  statusDir,
  watchStatus,
  removeStatusFile,
  clearUpdateStatusFile,
} from '../core/status-file';
// T374 — cross-process "open a new note": the sender and the running watcher.
import {
  requestNewNote,
  watchNewRequests,
  emitNewRequest,
} from '../core/new-request';
// T323 — `--version`/`-v` prints `snote <version>` from package.json.
import { VERSION } from './version';
import { envReport } from './env-check';
import { checkEndpoints } from '../core/endpoint-check';
// T156 — one data folder per account: accountDir + prepareDataDir.
import {
  defaultDataDir,
  logout,
  accountDir,
  prepareDataDir,
  loadToken,
} from '../core/token';
import { setDataRoot } from '../core/data-root';
// T390 — start-up update checks (local first, then the daily remote one).
import { runUpdateChecks } from '../core/update-run';
import { updateCheckEnabled } from '../core/update-check';
// T303 — one snote process per account dir: stale locks reclaimed, live ones refuse.
import { acquireInstanceLock } from '../core/instance-lock';
// T73 — login calls now come from ./login-calls, not direct auth imports.
import { loginCalls } from './login-calls';
import { APP_ID } from '../core/config';
import { Root } from '../tui/Root';
import type { Auth } from '../tui/Root';
// T402 — the output guard. process.stdout meets
// the guard's MinimalOutputStream (write(chunk, ...args)) structurally.
import { guardOutputStream } from '../core/output-guard';

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
  // T303 — claim the dir before anything reads or writes it. A live
  // process's lock throws synchronously, naming its pid; a stale one
  // (crash, kill -9) is reclaimed. Released by `stopSaving` below, and on
  // logout — both run the same closure, and release is synchronous so no
  // debounced save can land after the dir is gone.
  const instanceLock = acquireInstanceLock(opts.dataDir);
  // T73 — stop the saver before onLogout wipes the data dir,
  // so no debounced timer can rewrite state.json after a logout.
  let stopSaving = instanceLock.release;
  // T85 — keep the note bucket's ghost store so start-up can
  // re-queue notes whose local copy is newer than the last sync.
  let noteGhosts: FileGhostStore<unknown> | undefined;
  // T493 — read the record of unconfirmed local changes before the store is
  // built: restoreNotesFromGhosts and requeueUnsynced both consult it, and
  // it is only ever written by trackUnsynced below, never by the 500 ms save.
  const unsynced = loadUnsynced(opts.dataDir);
  const store = makeStore({
    preloadedState: dropTombstonedNotes(opts.dataDir, loadState(opts.dataDir)),
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
  // T445 — state.json lands on a 500 ms debounce while the ghost file and its
  // cv land at once, so a note the server confirmed inside that window is
  // missing from state.json when the process dies. The ghost holds the
  // server's copy, so add those notes back to the store; nothing is sent.
  // Deferred one turn so no start-up dispatch races the sync bucket's setup.
  if (noteGhosts) {
    const ghosts = noteGhosts;
    setTimeout(() => {
      restoreNotesFromGhosts(store, ghosts, unsynced);
    }, 0);
  }
  const startSaving = persistOnChange(store, opts.dataDir);
  // T493 — keep the unsynced record fresh: written at once whenever the
  // pending set changes, never by the debounced state.json save.
  const unsyncedTracker = trackUnsynced(store, opts.dataDir);
  const stopUnsynced = unsyncedTracker.stop;
  // T358 — with a status dir (the bar plugin's), keep status.json fresh;
  // stopStatus flushes any pending write at shutdown.
  const stopStatus = opts.statusDir
    ? watchStatus(store, opts.statusDir, { delayMs: opts.statusDelayMs })
    : () => {};
  // T374 — the running instance listens for `new-note.request` dropped by
  // `snote --notify-new`; each request becomes an emitNewRequest().
  const stopNewRequests = watchNewRequests(opts.dataDir, emitNewRequest, {
    pollMs: opts.newRequestPollMs,
  });
  // T303 — the returned stopSaving also releases the instance lock. The
  // marker line below is the OMARCHY: boundary cast one structure.test counts.
  stopSaving = () => {
    startSaving();
    stopUnsynced();
    stopStatus();
    // T417 — quit clears the notice: status.json loses its `update` key.
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
      // T313/T314 — offline edits wait for the note bucket's catch-up, then rebase
      () => whenCatchUpApplied(store.client, 'note'),
      // T493 — a change the record says the server never confirmed is
      // re-sent even when the ghost's date is newer.
      unsynced
    ).then(
      // T502 — the start-up re-send is over: a carried entry that never went
      // pending with it was found equal to its ghost, so it leaves the record.
      () => unsyncedTracker.settle(),
      (err) => {
        publishProblem(problemText('could not re-send offline edits', err));
      }
    );
  // T151 — record every "delete forever" in the tombstone file and
  // resend the removal for each tombstone the server still holds (FR-5).
  trackDeletions(store, opts.dataDir);
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

// T156 — one data folder per account: the store lives under
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
  // T156 — the account folder must exist before the ghost store and
  // persistence write into it; create it (root migration is done by the
  // caller's prepareDataDir, which only moves files when a token is present).
  const dir = accountDir(opts.dataDir, auth.email);
  secureMkdir(dir);
  return buildStore({ ...opts, dataDir: dir }, auth, onLogout);
}

// T214 — the crash state dir: `<XDG_STATE_HOME or ~/.local/state>/snote`.
// Deliberately NOT the data dir, so a logout never removes a crash report.
function stateDir(): string {
  const xdg = process.env.XDG_STATE_HOME;
  if (xdg && xdg !== '') {
    return path.join(xdg, 'snote');
  }
  return path.join(os.homedir(), '.local', 'state', 'snote');
}

// T233 — `snote --report`: write the same kind of bundle a crash would,
// from the CURRENT (live) data, so a user can hand it to their coding
// agent any time. If a crash just happened, reuse that crash's own bundle
// instead of a fresh snapshot.
async function writeReport(log: (text: string) => void, dataDir: string): Promise<number> {
  const dir = stateDir();
  let bundle: Record<string, unknown>;
  try {
    // T214's crash files sort by filename: ISO timestamps sort
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
      const old = JSON.parse(raw) as Record<string, unknown>;
      const oldSession = old.session;
      // S5d-01: a file without the `keysMasked` marker is from 0.2.3 or older,
      // which stored inline-editor typing one character per entry: drop its keys.
      const session =
        typeof oldSession === 'object' && oldSession !== null
          ? (oldSession as { keysMasked?: unknown }).keysMasked === true
            ? { ...(oldSession as Record<string, unknown>), keys: redactStoredKeys((oldSession as { keys?: unknown }).keys) }
            : { ...(oldSession as Record<string, unknown>), keys: [], keysDropped: 'older version' }
          : oldSession;
      bundle = { ...old, error: redactStoredError(old.error, os.homedir()), session, source: 'crash' };
    }
  } catch (err) {
    if ((err as { code?: string }).code !== 'ENOENT') {
      log('could not be saved');
      return 0;
    }
  }
  if (!bundle!) {
    try {
      // T508 — the app saves state.json inside the saved account's folder
      // (T156), so read it from the same folder --notify-new uses. With no
      // auth.json there is no saved account and the root is the source.
      const saved = await loadToken(dataDir);
      const stateFolder = saved ? accountDir(dataDir, saved.email) : dataDir;
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
  const log = io?.log ?? console.log;

  // T233 — `--report` is stripped before parseCli: CliOptions's shape is
  // fixed (strict parseArgs would reject it), and the report runs instead
  // of the login/render flow.
  const reportOnly = argv.includes('--report');
  // T374 — `--notify-new` is stripped here too (same strict-parser reason);
  // it sends a request to a running instance instead of rendering.
  const { args: argsWithoutReport, notifyNew } = splitNotifyFlag(
    argv.filter((a) => a !== '--report')
  );
  const { args, startNew } = splitNewFlag(argsWithoutReport);

  // T323 — `--version`/`-v` is stripped before parseCli too: CliOptions's
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

  // T233 — write the bundle and leave before the normal flow starts.
  if (reportOnly) {
    return writeReport(log, o.dataDir ?? defaultDataDir());
  }

  const dataDir = o.dataDir ?? defaultDataDir();
  // T408 — publish the resolved root so the blog sites read/write there.
  setDataRoot(dataDir);
  const appId = o.appId ?? APP_ID;

  if (o.help) {
    log(USAGE);
    return 0;
  }

  // T419 — an endpoint override carries credentials, so refuse http unless
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

  // T374 — ask the running instance to open a new note and leave: 0 when a
  // request was sent, 3 when there is no auth.json or no running instance.
  // Prints nothing either way; runs before prepareDataDir so it never
  // creates or migrates anything.
  if (notifyNew) {
    const saved = await loadToken(dataDir);
    if (!saved) {
      return 3;
    }
    return requestNewNote(accountDir(dataDir, saved.email)) === 'sent' ? 0 : 3;
  }

  // T156 — move an old single-folder install into the saved
  // account's folder before the store is built (after the --check/--logout
  // branches, so those never touch the dir).
  await prepareDataDir(dataDir);

  // T73 — three login calls (code, complete, password) for the root screen.
  const calls = loginCalls(o.server, appId);

  // T73 — keep the stopSaving of the latest buildStore call and
  // flush it after waitUntilExit (T33 dropped it, losing the last 500ms on quit).
  let stopSaving = () => {};
  // T232 — keep the latest store too, so the crash handler can snapshot it.
  let lastStore: ReturnType<typeof accountStore>['store'] | undefined;
  const makeStoreFor = (auth: Auth, onLogout: () => void) => {
    // T358 — only users who installed the bar plugin (its setup creates
    // the directory) get the status file; snote never creates it.
    const dir = statusDir(process.env);
    const built = accountStore(
      { dataDir, appId, server: o.server, statusDir: fs.existsSync(dir) ? dir : undefined },
      auth,
      onLogout
    );
    stopSaving = built.stopSaving;
    lastStore = built.store;
    // T390 — start checks only when the opt-out switch allows it, so no test path spawns git.
    // test/setup.ts sets the sentinel `disabled` (not `off`, which update-check.test.ts pins to its own per-test env).
    if (updateCheckEnabled(process.env) && process.env.SNOTE_UPDATE_CHECK !== 'disabled') {
      void runUpdateChecks({
        version: VERSION,
        home: os.homedir(),
        env: process.env,
        stateDir: statusDir(process.env),
      }).catch(() => {});
    }
    return built.store;
  };

  // T304: flag set by onLockError so main() returns non-zero on stale lock.
  let locked = false;

  // T402 — wrap stdout with the output guard before Ink renders, so no
  // note text can program the terminal.
  // NodeJS.WriteStream is the guard's MinimalOutputStream at the boundary.
  guardOutputStream(process.stdout);
  // T414 — stderr needs the same guard: Ink's patchConsole and debug
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
      // T304: when another process holds the instance lock, show the message
      // and return non-zero instead of swallowing into the login screen.
      onLockError: (msg: string) => {
        try {
          log(msg);
          locked = true;
          try { unmount(); } catch { /* ink-testing-library may throw */ }
        } catch { /* already handled */ }
      },
    }),
    // T402 — never take Ink's screen-reader output path (it skips the
    // stage that drops OSC sequences).
    { isScreenReaderEnabled: false }
  );

  // T214 — one shared crash handler: an error anywhere (React render, an
  // event handler, a rejected promise) unmounts Ink, clears the screen,
  // saves the crash record to the state dir and prints three calm lines,
  // then main resolves 1. Runs at most once, even if two errors arrive.
  let crashed: Promise<number> | undefined;
  const crash = (err: unknown): Promise<number> => {
    if (crashed) return crashed;
    // T304: if onLockError already handled a lock error, just return 1 —
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
    // T232 — the bundle is a replayable recipe: notes/tags/keys as they were
    // at the moment of the crash, redacted (lengths and keys only; typed and
    // pasted text is stored as `<text>`, never the characters themselves).
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
  // T214 — Ink's devtools-window-polyfill sets `globalThis.window`, so
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
    // T214 — ink's polyfill only sets `window ||= globalThis`, so neither
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

  stopSaving();
  if (locked) return 1;
  return 0;
}
