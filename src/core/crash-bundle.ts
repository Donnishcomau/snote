/**
 * F230: the `--report` bundle built from the newest crash file. The file
 * is plain JSON on disk and may have been edited, so the report is built
 * from an explicit allow-list of the fields snote's own crash writer
 * (crashReport and sessionSnapshot) produces. Unknown top-level and
 * unknown `session` fields are dropped; a known field of the wrong type
 * is dropped, never stringified; `error` and `session.keys` keep their
 * existing redaction.
 */
import { redactStoredError, redactStoredKeys } from './crash-redact';

const TOP_TEXT = ['version', 'when', 'terminal'] as const;
const SESSION_TEXT = ['version', 'terminal', 'collectionType'] as const;
const SESSION_COUNTS = ['noteCount', 'tagCount'] as const;

function isCount(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

function storedSession(raw: unknown): Record<string, unknown> | undefined {
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) {
    return undefined;
  }
  const old = raw as Record<string, unknown>;
  const session: Record<string, unknown> = {};
  for (const name of SESSION_TEXT) {
    if (typeof old[name] === 'string') {
      session[name] = old[name];
    }
  }
  for (const name of SESSION_COUNTS) {
    if (isCount(old[name])) {
      session[name] = old[name];
    }
  }
  if (Array.isArray(old.noteLengths) && old.noteLengths.every(isCount)) {
    session.noteLengths = old.noteLengths;
  }
  // S5d-01: a file without the `keysMasked` marker is from 0.2.3 or older,
  // which stored inline-editor typing one character per entry: drop its keys.
  if (old.keysMasked === true) {
    session.keys = redactStoredKeys(old.keys);
    session.keysMasked = true;
  } else {
    session.keys = [];
    session.keysDropped = 'older version';
  }
  return session;
}

export function storedCrashBundle(old: Record<string, unknown>, home: string): Record<string, unknown> {
  const bundle: Record<string, unknown> = {};
  for (const name of TOP_TEXT) {
    if (typeof old[name] === 'string') {
      bundle[name] = old[name];
    }
  }
  const error = redactStoredError(old.error, home);
  if (error !== undefined) {
    bundle.error = error;
  }
  const session = storedSession(old.session);
  if (session !== undefined) {
    bundle.session = session;
  }
  bundle.source = 'crash';
  return bundle;
}
