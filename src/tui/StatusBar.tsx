import { Box, Text } from 'ink';
import React from 'react';
import { theme } from './theme';
import type { ConnectionWord } from '../core/connection-word';
import { statusTag } from '../core/shown-version';

// Props shape a theme colour role is spread as; local because theme.ts is read-only.
type RoleProps = (typeof theme)[keyof typeof theme];
type Part = { text: string; role?: RoleProps };

interface StatusBarProps {
  connected: boolean;
  // #79: which kind of not-connected; absent means `connected` decides (connected or offline)
  word?: ConnectionWord;
  count: number;
  width: number;
  label?: string;
  pending?: number;
  // #79: the fixed reason after `[offline]`; #619: the `synced hh:mm` text. Absent = not shown.
  reason?: string;
  synced?: string;
}

// Whole parts while they fit; otherwise cut so the line is exactly `width` characters, ending in `…`.
function fit(parts: Part[], width: number): Part[] {
  const total = parts.reduce((n, p) => n + p.text.length, 0);
  if (total <= width) return parts;
  const budget = Math.max(0, width - 1);
  const out: Part[] = [];
  let used = 0;
  for (const p of parts) {
    const take = Math.min(p.text.length, budget - used);
    if (take > 0) out.push({ ...p, text: p.text.slice(0, take) });
    used += take;
    if (used >= budget) break;
  }
  const last = out[out.length - 1];
  if (last) last.text += '…';
  else out.push({ text: '…' });
  return out;
}

/**
 * Status bar - shows connection status and note count.
 */
export function StatusBar({ connected, word, count, width, label, pending, reason, synced }: StatusBarProps): React.JSX.Element {
  const shown: ConnectionWord = connected ? 'connected' : word && word !== 'connected' ? word : 'offline';
  const parts: Part[] = [
    { text: '[', role: theme.muted },
    { text: shown, role: connected ? theme.success : theme.error },
    { text: ']', role: theme.muted },
    { text: ' ' },
    { text: `${count} ${count === 1 ? 'note' : 'notes'}`, role: theme.muted },
  ];
  if (pending && pending > 0) parts.push({ text: ` ${pending} pending${connected ? '' : ' (no sync)'}`, role: theme.warning });
  if (label) parts.push({ text: ` ${label}`, role: theme.warning });
  // #79/#619: `[word] reason · synced hh:mm · N notes`; a line too wide drops the time first, then the reason
  // (the reason in the word's red, the time and dots in the brackets' muted role: both are in the pty guard's drawing set)
  const dim = parts[0].role;
  const segs = [reason && { text: reason, role: theme.error }, synced && { text: synced, role: dim }];
  const room = (): number => width - parts.reduce((n, p) => n + p.text.length, 0) - segs.reduce((n, p) => n + (p ? p.text.length + 3 : 0), 0);
  if (room() < 0) segs[1] = undefined;
  if (room() < 0) segs[0] = undefined;
  for (const p of segs.reverse()) if (p) parts.splice(4, 0, p, { text: ' · ', role: dim });
  const tag = statusTag();
  const gap = width - parts.reduce((n, p) => n + p.text.length, 0) - tag.length;
  if (tag && width >= 80 && gap >= 1) parts.push({ text: ' '.repeat(gap) }, { text: tag });

  return (
    <Box>
      {fit(parts, width).map((p, i) => (
        <Text key={i} {...p.role}>
          {p.text}
        </Text>
      ))}
    </Box>
  );
}

export default StatusBar;
