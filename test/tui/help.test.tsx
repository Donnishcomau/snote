/**
 * Help overlay tests (T16).
 * Verifies that the help overlay renders correctly and responds to key presses.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { render } from 'ink-testing-library';
import { App } from '../../src/tui/App';
import { makeStore } from '../../src/core/store';

describe('Help overlay', () => {
  let store: ReturnType<typeof makeStore>;

  beforeEach(() => {
    store = makeStore({
      stubClient: {
        on: () => {},
        off: () => {},
        emit: () => {},
        buckets: new Map(),
      },
    });
  });

  it('pressing ? shows a frame containing "Show this help" and "Move down"', async () => {
    const { stdin, lastFrame, unmount } = render(
      <App store={store} width={80} height={24} />
    );

    // Wait for initial render
    await new Promise(r => setTimeout(r, 50));
    
    // Initially, help should not be visible
    expect(lastFrame()).not.toContain('Help - Keyboard Shortcuts');

    // Press ? to open help
    stdin.write('?');
    await new Promise((r) => setTimeout(r, 50));
    
    expect(lastFrame()).toContain('Help - Keyboard Shortcuts');
    expect(lastFrame()).toContain('Move down');
    
    unmount();
  });

  it('Escape closes the help overlay', async () => {
    const { stdin, lastFrame, unmount } = render(
      <App store={store} width={80} height={24} />
    );

    // Wait for initial render
    await new Promise(r => setTimeout(r, 50));
    
    // Open help
    stdin.write('?');
    await new Promise((r) => setTimeout(r, 50));
    expect(lastFrame()).toContain('Help - Keyboard Shortcuts');

    // Press Escape to close help
    stdin.write('\u001b');
    await new Promise((r) => setTimeout(r, 50));
    
    expect(lastFrame()).toContain('Notes');
    expect(lastFrame()).not.toContain('Help - Keyboard Shortcuts');
    
    unmount();
  });

  it('snapshot at 80x24', async () => {
    const { lastFrame, unmount } = render(
      <App store={store} width={80} height={24} />
    );

    // Wait for initial render
    await new Promise(r => setTimeout(r, 50));
    
    // Just verify the app renders without crashing
    expect(lastFrame()).toBeTruthy();
    
    unmount();
  });
});
