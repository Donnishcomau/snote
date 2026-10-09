import { parseArgs } from 'node:util';

interface CliOptions {
  check: boolean;
  logout: boolean;
  help: boolean;
  dataDir?: string;
  appId?: string;
  server?: string;
}

export function splitNewFlag(argv: string[]): {
  args: string[];
  startNew: boolean;
} {
  return {
    args: argv.filter((a) => a !== '--new'),
    startNew: argv.includes('--new'),
  };
}

export function splitNotifyFlag(argv: string[]): {
  args: string[];
  notifyNew: boolean;
} {
  return {
    args: argv.filter((a) => a !== '--notify-new'),
    notifyNew: argv.includes('--notify-new'),
  };
}

export function parseCli(argv: string[]): CliOptions {
  const result = parseArgs({
    args: argv,
    options: {
      check: { type: 'boolean' },
      logout: { type: 'boolean' },
      help: { type: 'boolean', short: 'h' },
      'data-dir': { type: 'string' },
      'app-id': { type: 'string' },
      server: { type: 'string' },
    },
  });

  const values = result.values;

  return {
    check: values.check ?? false,
    logout: values.logout ?? false,
    help: values.help ?? false,
    dataDir: values['data-dir'] ?? undefined,
    appId: values['app-id'] ?? undefined,
    server: values.server ?? undefined,
  };
}

export function checkReport(info: {
  editor: string;
  dataDir: string;
  columns: number;
  rows: number;
}): string {
  return [
    `editor: ${info.editor}`,
    `data dir: ${info.dataDir}`,
    `terminal: ${info.columns}x${info.rows}`,
  ].join('\n');
}

export const USAGE: string = [
  'usage: snote [options]',
  '',
  'Options:',
  '  --check          Check configuration and exit',
  '  --logout         Logout current account',
  '  --help, -h       Show this help message',
  '  --version, -v    Print the snote version and exit',
  '  --data-dir <value>   Data directory path',
  '  --app-id <value>     Simperium app ID',
  '  --server <value>     Simperium server URL',
  '  --report        Write a bundle for your coding agent',
  '  --new            Open the editor for a new note at start',
  '  --notify-new     Ask a running snote to open a new note, then exit',
].join('\n');
