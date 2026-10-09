import { Box, Text } from 'ink';
import React from 'react';
import { theme } from './theme';

// Props shape a theme colour role is spread as; local because theme.ts is read-only.
type RoleProps = (typeof theme)[keyof typeof theme];
type Part = { text: string; role?: RoleProps };

interface StatusBarProps {
  connected: boolean;
  count: number;
  width: number;
  label?: string;
  pending?: number;
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
export function StatusBar({ connected, count, width, label, pending }: StatusBarProps): React.JSX.Element {
  const parts: Part[] = [
    { text: '[', role: theme.muted },
    { text: connected ? 'connected' : 'offline', role: connected ? theme.success : theme.error },
    { text: ']', role: theme.muted },
    { text: ' ' },
    { text: `${count} ${count === 1 ? 'note' : 'notes'}`, role: theme.muted },
  ];
  if (pending && pending > 0) parts.push({ text: ` ${pending} pending`, role: theme.warning });
  if (label) parts.push({ text: ` ${label}`, role: theme.warning });

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
