export const HOSTILE = {
  osc52Bel: '\x1b]52;c;UFdORUQ=\x07',
  osc52St: '\x1b]52;c;UFdORUQ=\x1b\\',
  osc8: '\x1b]8;;http://evil.example\x1b\\L\x1b]8;;\x1b\\',
  osc0: '\x1b]0;title\x07',
  oscOpen: '\x1b]52;c;QQ',
  dcs: '\x1bPq#0\x1b\\',
  apc: '\x1b_Gi=1;AA\x1b\\',
  pm: '\x1b^pm\x1b\\',
  sos: '\x1bXsos\x1b\\',
  c1: '\x9d52;c;QQ\x9c\x90q\x9c\x9b2J\x9e\x9f',
  sgr: '\x1b[45m\x1b[8m\x1b[7m',
  csi: '\x1b[2J\x1b[H\x1b[1A\x1b[?1049h\x1b[6n\x1b[c\x1b[21t',
  twoByte: '\x1bc\x1b7\x1b8\x1b=\x1b>\x1bZ\x1bN\x1bO\x1b(0',
  c0: '\x07\x08\r\x00\x7f',
  bidi: '\u202a\u202b\u202c\u202d\u202e\u2066\u2067\u2068\u2069',
  zeroWidth: '\u200b\u200c\u200e\u200f',
  separators: '\u2028\u2029',
} as const;

export function hostileText(marker: string): string {
  return marker + Object.values(HOSTILE).join('');
}

export const LONG_LINE = 'L'.repeat(50_000);
