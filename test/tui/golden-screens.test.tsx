import { describe, it, expect, vi } from 'vitest';
import { render } from 'ink-testing-library';
import React from 'react';

import { makeStore } from '../../src/core/store';
import { App } from '../../src/tui/App';
import { Login } from '../../src/tui/Login';
import { makeNote } from './fixtures';
import type { EntityId } from '@vendor/types';

// Helper to create branded types for testing
const eid = (id: string): EntityId => id as unknown as EntityId;

function seededStore() {
  const store = makeStore({ stubClient: {} });

  // Seed two notes: g1 (pinned) and g2 (other)
  store.dispatch({
    type: 'IMPORT_NOTE_WITH_ID',
    noteId: eid('g1'),
    note: makeNote('g1', 'Pinned note\ncurrent text', {
      pinned: true,
      creationDate: 1000,
      modificationDate: 1000000200,
    }),
  } as never);

  store.dispatch({
    type: 'IMPORT_NOTE_WITH_ID',
    noteId: eid('g2'),
    note: makeNote('g2', 'Other note\nbody', {
      creationDate: 1000,
      modificationDate: 3000,
    }),
  } as never);

  return store;
}

describe('Golden frames', () => {
  it('1: WHEN at 80x24 h is written and the two versions are loaded THEN the frame contains History, >v2  2001-09-09 01:48,  v1  2001-09-09 01:46 and second text, not loading... and not Other note; snapshot history-80x24', async () => {
    const store = seededStore();
    const { stdin, lastFrame, unmount } = render(
      <App store={store} width={80} height={24} />
    );

    await new Promise((r) => setTimeout(r, 50));

    // Press h to open history
    stdin.write('h');

    await new Promise((r) => setTimeout(r, 50));

    // Load revisions for g1 (selected note)
    const noteV1 = makeNote('g1', 'Pinned note\nfirst text', {
      creationDate: 1000,
      modificationDate: 1000000000,
    });
    const noteV2 = makeNote('g1', 'Pinned note\nsecond text', {
      creationDate: 1000,
      modificationDate: 1000000100,
    });

    store.dispatch({
      type: 'LOAD_REVISIONS',
      noteId: eid('g1'),
      revisions: [
        [1, noteV1],
        [2, noteV2],
      ],
    } as never);

    await new Promise((r) => setTimeout(r, 50));

    const frame = lastFrame();
    expect(frame).toContain('History');
    expect(frame).toContain('>v2  2001-09-09 01:48');
    expect(frame).toContain(' v1  2001-09-09 01:46');
    expect(frame).toContain('second text');
    expect(frame).not.toContain('loading...');
    expect(frame).not.toContain('Other note');

    expect(frame).toMatchSnapshot('history-80x24');

    unmount();
  });

  it('2: WHEN the same is done at 120x40 THEN the frame contains History, >v2  2001-09-09 01:48  Pinned note and second text; snapshot history-120x40', async () => {
    const store = seededStore();
    const { stdin, lastFrame, unmount } = render(
      <App store={store} width={120} height={40} />
    );

    await new Promise((r) => setTimeout(r, 50));

    // Press h to open history
    stdin.write('h');

    await new Promise((r) => setTimeout(r, 50));

    // Load revisions for g1
    const noteV1 = makeNote('g1', 'Pinned note\nfirst text', {
      creationDate: 1000,
      modificationDate: 1000000000,
    });
    const noteV2 = makeNote('g1', 'Pinned note\nsecond text', {
      creationDate: 1000,
      modificationDate: 1000000100,
    });

    store.dispatch({
      type: 'LOAD_REVISIONS',
      noteId: eid('g1'),
      revisions: [
        [1, noteV1],
        [2, noteV2],
      ],
    } as never);

    await new Promise((r) => setTimeout(r, 50));

    const frame = lastFrame();
    expect(frame).toContain('History');
    expect(frame).toContain('>v2  2001-09-09 01:48  Pinned note');
    expect(frame).toContain('second text');

    expect(frame).toMatchSnapshot('history-120x40');

    unmount();
  });

  it('3: WHEN <Login width={80} height={24} ... /> is rendered THEN the frame contains Simplenote login, Email: and Tab: log in with a password, not Code: and not Password:; snapshot login-80x24', async () => {
    const requestCode = vi.fn().mockResolvedValue(undefined);
    const completeLogin = vi.fn();
    const onLoggedIn = vi.fn();
    const passwordLogin = vi.fn();

    const { lastFrame, unmount } = render(
      <Login
        width={80}
        height={24}
        requestCode={requestCode}
        completeLogin={completeLogin}
        onLoggedIn={onLoggedIn}
        passwordLogin={passwordLogin}
      />
    );

    await new Promise((r) => setTimeout(r, 50));

    const frame = lastFrame();
    expect(frame).toContain('Simplenote login');
    expect(frame).toContain('Email:');
    expect(frame).toContain('Tab: log in with a password');
    expect(frame).not.toContain('Code:');
    expect(frame).not.toContain('Password:');

    expect(frame).toMatchSnapshot('login-80x24');

    unmount();
  });

  it('4: WHEN <Login width={120} height={40} ... /> is rendered, and a@b.co then \\r are written THEN the frame contains Code sent to a@b.co and Code:, and requestCode was called 1 time; snapshot login-code-120x40', async () => {
    const requestCode = vi.fn().mockResolvedValue(undefined);
    const completeLogin = vi.fn();
    const onLoggedIn = vi.fn();
    const passwordLogin = vi.fn();

    const { stdin, lastFrame, unmount } = render(
      <Login
        width={120}
        height={40}
        requestCode={requestCode}
        completeLogin={completeLogin}
        onLoggedIn={onLoggedIn}
        passwordLogin={passwordLogin}
      />
    );

    await new Promise((r) => setTimeout(r, 50));

    // Type email
    stdin.write('a@b.co');

    await new Promise((r) => setTimeout(r, 50));

    // Press Enter
    stdin.write('\r');

    await new Promise((r) => setTimeout(r, 50));

    const frame = lastFrame();
    expect(frame).toContain('Code sent to a@b.co');
    expect(frame).toContain('Code:');
    expect(requestCode).toHaveBeenCalledTimes(1);

    expect(frame).toMatchSnapshot('login-code-120x40');

    unmount();
  });

  it('5: WHEN at 80x24 a@b.co, \\t, s3cret are written THEN the frame contains Password login for a@b.co and Password: ******, not s3cret, and requestCode was not called; snapshot login-password-80x24', async () => {
    const requestCode = vi.fn().mockResolvedValue(undefined);
    const completeLogin = vi.fn();
    const onLoggedIn = vi.fn();
    const passwordLogin = vi.fn();

    const { stdin, lastFrame, unmount } = render(
      <Login
        width={80}
        height={24}
        requestCode={requestCode}
        completeLogin={completeLogin}
        onLoggedIn={onLoggedIn}
        passwordLogin={passwordLogin}
      />
    );

    await new Promise((r) => setTimeout(r, 50));

    // Type email
    stdin.write('a@b.co');

    await new Promise((r) => setTimeout(r, 50));

    // Press Tab to switch to password step
    stdin.write('\t');

    await new Promise((r) => setTimeout(r, 50));

    // Type password
    stdin.write('s3cret');

    await new Promise((r) => setTimeout(r, 50));

    const frame = lastFrame();
    expect(frame).toContain('Password login for a@b.co');
    expect(frame).toContain('Password: ******');
    expect(frame).not.toContain('s3cret');
    expect(requestCode).not.toHaveBeenCalled();

    expect(frame).toMatchSnapshot('login-password-80x24');

    unmount();
  });
});
