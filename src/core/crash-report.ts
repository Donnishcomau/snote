export type CrashContext = {
  version: string;
  columns: number;
  rows: number;
  when: Date;
  home: string;
};

export type CrashRecord = {
  version: string;
  when: string;
  terminal: string;
  error: { name: string; message: string; stack: string[] };
};

export function crashReport(
  err: unknown,
  ctx: CrashContext,
): { record: CrashRecord; message: string } {
  let name = 'Unknown';
  let message = 'Unknown';
  let stackLines: string[] = [];

  if (err instanceof Error) {
    name = err.name;
    message = err.message;
    if (err.stack) {
      stackLines = err.stack.split('\n');
    }
  } else {
    message = String(err);
  }

  // Trim message to at most 200 characters
  if (message.length > 200) {
    message = message.slice(0, 200);
  }

  // Replace home path with ~ in stack lines, take at most first 12
  stackLines = stackLines
    .map((line) => line.replaceAll(ctx.home, '~'))
    .slice(0, 12);

  const record: CrashRecord = {
    version: ctx.version,
    when: ctx.when.toISOString(),
    terminal: `${ctx.columns}x${ctx.rows}`,
    error: { name, message, stack: stackLines },
  };

  const messageText = [
    'snote hit a bug and stopped.',
    `A report was saved to: {path}`,
    'Hand that file to your coding agent, or attach it to an issue.',
  ].join('\n');

  return { record, message: messageText };
}
