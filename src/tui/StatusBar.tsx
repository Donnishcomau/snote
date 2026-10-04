import { Box, Text } from 'ink';
import React from 'react';
import { theme } from './theme';

// Props shape a theme colour role is spread as; local because theme.ts is read-only.
type RoleProps = { bold?: boolean; inverse?: boolean; color?: string };

interface StatusBarProps {
  connected: boolean;
  count: number;
  width: number;
  label?: string;
  pending?: number;
}

/**
 * Status bar - shows connection status and note count.
 */
export function StatusBar({ connected, count, width, label, pending }: StatusBarProps): React.JSX.Element {
  const statusText = connected ? 'connected' : 'offline';
  const statusRole: RoleProps = connected ? theme.success : theme.error;
  
  return (
    <Box>
      <Text {...theme.muted}>[</Text>
      <Text {...statusRole}>{statusText}</Text>
      <Text {...theme.muted}>]</Text>
      <Text> </Text>
      <Text>{count} notes</Text>
      {pending && pending > 0 ? <Text {...theme.warning}> {pending} pending</Text> : null}
      {label ? <Text {...theme.warning}> {label}</Text> : null}
    </Box>
  );
}

export default StatusBar;
