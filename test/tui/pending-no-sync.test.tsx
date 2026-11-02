/**
 * Issue #79 (slice A, pending part): a pending count that is not syncing says
 * so. `N pending (no sync)` while the connection is not green, `N pending`
 * (no suffix) while it is.
 */
import { describe, it, expect } from 'vitest';
import { render } from 'ink-testing-library';
import React from 'react';

import { StatusBar } from '../../src/tui/StatusBar';

const strip = (s: string | undefined): string => (s ?? '').replace(/\u001b\[[0-9;]*m/g, '');

describe('issue #79 a pending count that is not syncing says so', () => {
  it('1: WHEN 2 notes are pending and the connection is not green THEN the status line is `[offline] 4 notes 2 pending (no sync)`', () => {
    const r = render(<StatusBar connected={false} count={4} width={80} pending={2} />);
    expect(strip(r.lastFrame())).toBe('[offline] 4 notes 2 pending (no sync)');
    r.unmount();
  });

  it('2: WHEN 2 notes are pending and the connection is green THEN the status line is `[connected] 4 notes 2 pending` with no `(no sync)`, which the same bar not green adds', () => {
    const off = render(<StatusBar connected={false} count={4} width={80} pending={2} />);
    expect(strip(off.lastFrame())).toContain('(no sync)');
    off.unmount();
    const r = render(<StatusBar connected={true} count={4} width={80} pending={2} />);
    expect(strip(r.lastFrame())).toBe('[connected] 4 notes 2 pending');
    expect(strip(r.lastFrame())).not.toContain('(no sync)');
    r.unmount();
  });

  it('3: WHEN no note is pending and the connection is not green THEN the status line is `[offline] 4 notes` with no `(no sync)`, which 2 pending adds', () => {
    const two = render(<StatusBar connected={false} count={4} width={80} pending={2} />);
    expect(strip(two.lastFrame())).toContain('(no sync)');
    two.unmount();
    const r = render(<StatusBar connected={false} count={4} width={80} pending={0} />);
    expect(strip(r.lastFrame())).toBe('[offline] 4 notes');
    expect(strip(r.lastFrame())).not.toContain('(no sync)');
    r.unmount();
  });

  it('4: WHEN 2 notes are pending, the connection is not green and the width is 30 THEN the status line is `[offline] 4 notes 2 pending (…`', () => {
    const r = render(<StatusBar connected={false} count={4} width={30} pending={2} />);
    expect(strip(r.lastFrame())).toBe('[offline] 4 notes 2 pending (…');
    r.unmount();
  });
});
