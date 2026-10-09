import { redactMessage, redactStack, safeCode, safeName } from './crash-redact';

export type CrashContext = {
  version: string;
  columns: number;
  rows: number;
  when: Date;
  home: string;
};

type CrashRecord = {
  version: string;
  when: string;
  terminal: string;
  error: { name: string; message: string; code?: string; stack: string[] };
};

export function crashReport(
  err: unknown,
  ctx: CrashContext,
): { record: CrashRecord; message: string } {
  let name = 'Unknown';
  let message = 'Unknown';
  let code: string | undefined;
  let stackLines: string[] = [];

  // The crash path must never throw: hostile getters, a non-string
  // message or stack, or an object String() cannot convert all fall back.
  try {
    if (err instanceof Error) {
      name = safeName(err.name);
      const rawMessage: unknown = err.message;
      message = typeof rawMessage === 'string' ? redactMessage(rawMessage) : 'Unknown';
      code = safeCode((err as { code?: unknown }).code);
      const stack: unknown = err.stack;
      if (typeof stack === 'string' && stack && typeof rawMessage === 'string') {
        stackLines = redactStack(stack, ctx.home, String(err.name), rawMessage);
      }
    } else {
      message = redactMessage(String(err));
    }
  } catch {
    // keep what was gathered so far
  }

  const record: CrashRecord = {
    version: ctx.version,
    when: ctx.when.toISOString(),
    terminal: `${ctx.columns}x${ctx.rows}`,
    error: {
      name,
      message,
      ...(code === undefined ? {} : { code }),
      stack: stackLines,
    },
  };

  const messageText = [
    'snote hit a bug and stopped.',
    `A report was saved to: {path}`,
    'Hand that file to your coding agent, or read it before you attach it to an issue.',
  ].join('\n');

  return { record, message: messageText };
}
