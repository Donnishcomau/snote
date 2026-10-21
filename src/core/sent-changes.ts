import * as fs from 'node:fs';
import * as path from 'node:path';

import { secureMkdir, secureWriteFileSync } from './secure-fs';

const SENT_CHANGES_FILE = 'sent-changes.json';

/**
 * The record of changes sent to the server but not yet confirmed:
 * noteId -> the ccid the change went out with. A restart before the
 * server's reply arrives would otherwise apply the server's echo of the
 * change a second time on top of the local copy that already has it.
 */
export type SentRecord = Record<string, string>;

/**
 * Read the record from disk. A missing or damaged file is an empty
 * record; an entry whose value is not a string drops only that entry.
 */
export function loadSentChanges(dir: string): SentRecord {
  const filePath = path.join(dir, SENT_CHANGES_FILE);
  if (!fs.existsSync(filePath)) {
    return {};
  }
  try {
    const parsed = JSON.parse(fs.readFileSync(filePath, 'utf8')) as unknown;
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      return {};
    }
    const record: SentRecord = {};
    for (const [id, ccid] of Object.entries(parsed as Record<string, unknown>)) {
      if (typeof ccid !== 'string') {
        continue;
      }
      record[id] = ccid;
    }
    return record;
  } catch {
    return {};
  }
}

const writeRecord = (dir: string, record: SentRecord): void => {
  const filePath = path.join(dir, SENT_CHANGES_FILE);
  const tmpPath = filePath + '.tmp';
  try {
    secureMkdir(dir);
    secureWriteFileSync(tmpPath, JSON.stringify(record));
    fs.renameSync(tmpPath, filePath);
  } catch {
    // A failed write (EACCES, ENOSPC, EISDIR) must not crash the app;
    // the record is a safety net, the notes themselves live in state.json.
  }
};

interface SentChangeEntry {
  id: string;
  ccid: string;
}

/**
 * Tracker over `sent-changes.json`: `sent` records an outgoing change,
 * `acknowledged` and `settle` remove entries, and `echoes` recognises
 * incoming `c`-message changes that are the server echoing a loaded
 * record entry back at us.
 */
export interface SentChanges {
  sent(id: string, ccid: string): void;
  acknowledged(id: string, ccid: string): void;
  echoes(
    data: string,
    inFlight: Readonly<Record<string, unknown>>
  ): SentChangeEntry[];
  settle(): void;
}

/**
 * Open the tracker on `dir`, reading the file once; those entries are
 * the "loaded" ones. `echoes` only ever matches a loaded entry, so a
 * change recorded this session by `sent` is never treated as its own
 * echo. No function throws.
 */
export function createSentChanges(dir: string): SentChanges {
  // Loaded entries that are still present; `settle` drains these.
  const loaded: SentRecord = loadSentChanges(dir);
  // Entries recorded by `sent` this session; they survive `settle`.
  const fresh: SentRecord = {};
  // #28 — loaded entries a `sent` replaced, kept in memory until `settle`:
  // `echoes` matches one only for an echo whose note has a stale change in
  // flight (one the server rejects), never as a plain loaded entry.
  const superseded: SentRecord = {};

  const current = (): SentRecord => ({ ...loaded, ...fresh });

  return {
    sent(id: string, ccid: string): void {
      fresh[id] = ccid;
      if (loaded[id] !== undefined) superseded[id] = loaded[id];
      delete loaded[id];
      writeRecord(dir, current());
    },

    acknowledged(id: string, ccid: string): void {
      const record = current();
      if (record[id] === ccid) {
        delete loaded[id];
        delete fresh[id];
      }
      writeRecord(dir, current());
    },

    settle(): void {
      for (const id of Object.keys(loaded)) {
        delete loaded[id];
      }
      for (const id of Object.keys(superseded)) {
        delete superseded[id];
      }
      writeRecord(dir, current());
    },

    echoes(
      data: string,
      inFlight: Readonly<Record<string, unknown>>
    ): SentChangeEntry[] {
      let changes: unknown;
      try {
        changes = JSON.parse(data);
      } catch {
        return [];
      }
      if (!Array.isArray(changes)) {
        return [];
      }
      const found: SentChangeEntry[] = [];
      for (const change of changes as Array<Record<string, unknown>>) {
        if (!change || typeof change !== 'object' || Array.isArray(change)) {
          continue;
        }
        const id = change.id;
        if (typeof id !== 'string' || 'error' in change) {
          continue;
        }
        // #28 — a change in flight from the echo's own source version is
        // stale (the server already holds the echoed change and rejects it
        // with 405): it does not block the echo, and the entry its `sent`
        // replaced still matches. #93 (F226) — a remove in flight (it has no
        // source version) does not block it either. Any other change in flight
        // blocks it.
        const flying = inFlight[id] as { sv?: unknown; o?: unknown } | undefined;
        const stale = (typeof flying?.sv === 'number' && flying.sv === change.sv) || flying?.o === '-';
        const ccid = flying ? (stale ? (loaded[id] ?? superseded[id]) : undefined) : loaded[id];
        if (ccid === undefined) {
          continue;
        }
        const { ccids } = change;
        if (Array.isArray(ccids) && ccids.includes(ccid)) {
          found.push({ id, ccid });
        }
      }
      return found;
    }
  };
}
