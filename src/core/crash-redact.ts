// Crash-bundle redaction (F152): an error message or stack can quote note
// text, tags, ids or paths holding the account email, and the crash file is
// the one the user is told to share. So only a fixed vocabulary survives.

// Lowercase words that may stay in a message: the wording of snote's own
// errors and of the common V8 / Node error messages.
const KNOWN_WORDS = new Set(
  (
    "a an and are as at be before by cannot could not is it of on or to the in for from with within " +
    "no such file directory open read write stat unlink rename scandir mkdir permission denied " +
    "operation permitted already exists exist too many files connection refused reset timed out " +
    "undefined null reading properties property function defined object iterable constructor " +
    "unexpected token json position end input string number invalid valid hook call maximum update " +
    "depth exceeded stack size access initialization assignment constant variable raw mode " +
    "supported enoent eacces eexist eperm enotdir eisdir emfile econnrefused econnreset etimedout " +
    "enotfound epipe eaddrinuse err http blog origin configured unauthorized rate limited title " +
    "required long editor failed exit timeout waiting notes load another snote using pid holds " +
    "instance lock answer reach must start https got non empty"
  ).split(" "),
);

// A quoted string is parked behind a control-character marker so the word
// pass cannot turn the final `<str>` into `<w>`.
const MARK = "\u0001";
const QUOTED = /"[^"]*"|'[^']*'|`[^`]*`/g;
// A word is a run of characters other than whitespace, brackets, `,:;` and
// the marker; the separators stay where they are.
const WORD = /<(?:w|str)>|[^\s()[\]{}<>,:;\u0001]+/g;
const CONTROL = /[\u0000-\u001f\u007f-\u009f‪-‮]/g;

export function redactMessage(raw: string): string {
  const text = raw
    .replace(CONTROL, " ")
    .replace(QUOTED, MARK)
    .replace(WORD, (word) =>
      KNOWN_WORDS.has(word.toLowerCase()) ||
      /^\d{1,3}$/.test(word) ||
      word === "<w>" ||
      word === "<str>"
        ? word
        : "<w>",
    )
    .replaceAll(MARK, "<str>");
  return text.replace(/\s+/g, " ").trim().slice(0, 200);
}

// Keep only the `at ...` frames, the home directory as `~`, any path
// segment holding an `@` (an account email) as `<w>`, at most 12. A V8 stack
// is `<name>: <message>` (the message may span lines) and then the frames, so
// the exact header is removed first and only the text after it is filtered.
// When the header does not match, the stack is kept only if neither name nor
// message has a line break (then no frame-like line can be message text);
// otherwise nothing is kept.
export function redactStack(
  stack: string,
  home: string,
  name: string,
  message: string,
): string[] {
  const header = message ? `${name}: ${message}` : name;
  let body: string;
  if (
    stack.startsWith(header) &&
    (stack.length === header.length || stack[header.length] === "\n")
  ) {
    body = stack.slice(header.length);
  } else {
    // A rewritten stack, or one whose header is not name/message: nothing
    // in it can be trusted to be a V8 frame.
    return [];
  }
  return frameLines(body.split("\n"), home);
}

// A true V8 frame: `    at [async|new] fn (file:line:col)`, `    at file:line:col`
// or `    at fn (<anonymous>)`. Anything else, such as free text that happens
// to start with `at `, is dropped.
const FRAME =
  /^ {4}at (?:(?:async |new )?[^\s()]+ \()?(?:[^\s()]+:\d+:\d+|<anonymous>|native)\)?$/;

export function frameLines(lines: string[], home: string): string[] {
  return lines
    .filter((line) => FRAME.test(line))
    .map((line) => (home ? line.replaceAll(home, "~") : line))
    .map((line) => line.replace(/[^\s/()]*@[^\s/()]*/g, "<w>"))
    .slice(0, 12);
}

export function safeName(name: unknown): string {
  return typeof name === "string" && /^[A-Za-z][A-Za-z0-9]{0,40}$/.test(name)
    ? name
    : "Error";
}

export function safeCode(code: unknown): string | undefined {
  return typeof code === "string" && /^[A-Z][A-Z0-9_]{1,40}$/.test(code)
    ? code
    : undefined;
}

// An error object read back from a crash file (which may predate redaction):
// only the fixed vocabulary survives, as for a live crash.
export function redactStoredError(error: unknown, home: string): unknown {
  if (typeof error !== "object" || error === null) return undefined;
  const e = error as Record<string, unknown>;
  const code = safeCode(e.code);
  return {
    name: safeName(e.name),
    message: typeof e.message === "string" ? redactMessage(e.message) : "Unknown",
    ...(code === undefined ? {} : { code }),
    stack: Array.isArray(e.stack)
      ? frameLines(
          e.stack.filter((l): l is string => typeof l === "string"),
          home,
        )
      : [],
  };
}

// S5c-01: keys read back from a crash file (which may predate the key-ring
// mask and hold typed or pasted note text). Only a recognised single command
// key, or a key with no text input, keeps its input; all else becomes `<text>`.
const COMMAND_KEYS = new Set("/?abcegEhijJkKLnNqrRstvwxyY".split(""));
export function redactStoredKeys(keys: unknown): unknown[] {
  if (!Array.isArray(keys)) return [];
  const out: unknown[] = [];
  for (const k of keys) {
    if (typeof k !== "object" || k === null) continue;
    const { input, key } = k as { input?: unknown; key?: unknown };
    const keep = input === "" || (typeof input === "string" && COMMAND_KEYS.has(input));
    out.push({
      input: keep ? input : "<text>",
      key: typeof key === "object" && key !== null ? key : {},
    });
  }
  return out;
}

// S5c-04: true when a thrown value is the instance-lock error; never throws,
// whatever the value's message or toString is.
export function isLockError(err: unknown): boolean {
  try {
    const msg = err instanceof Error ? err.message : String(err);
    return typeof msg === "string" && msg.includes("holds the instance lock");
  } catch {
    return false;
  }
}
