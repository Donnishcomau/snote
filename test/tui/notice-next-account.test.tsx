/**
 * #655: a problem notice published in one account's session does not show in
 * the next account's session after a sign-out and sign-in in the same process.
 */
import { afterEach, beforeEach, describe, expect, it, vi, type Mock } from 'vitest';
import { render } from 'ink-testing-library';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import React from 'react';

import { saveToken } from '../../src/core/token';
import { publishProblem, resetProblemSignal } from '../../src/core/problem-signal';
import { Root, type Auth } from '../../src/tui/Root';
import { makeStore } from '../../src/core/store';
import { waitForInput, waitForFrame } from '../helpers/ink-waits';
import type { Store } from 'redux';
import type { State } from '../../src/core/store';

const OLD = 'could not save notes: EACCES';

describe('#655 the notice of the account that signed out stays out of the next session', () => {
  let tmp: string;
  let dir: string;
  let makeStoreFor: Mock;

  beforeEach(async () => {
    resetProblemSignal();
    tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'snote-655-'));
    dir = path.join(tmp, 'data');
    fs.mkdirSync(dir);
    await saveToken(dir, { email: 'a@b.co', token: 'tok' });
    makeStoreFor = vi.fn((auth: Auth) => {
      const s = makeStore({ stubClient: {} });
      s.dispatch({ type: 'CREATE_NOTE_WITH_ID', noteId: 'n1' as never, note: { content: `Note of ${auth.email}`, systemTags: [], tags: [] } });
      return s as Store<State>;
    });
  });

  afterEach(() => {
    resetProblemSignal();
    fs.rmSync(tmp, { recursive: true, force: true });
  });

  it('1: WHEN account a@b.co shows the notice `could not save notes: EACCES`, logs out (L then y) and c@d.co signs in with a code THEN c@d.co\'s notes show and the frame does not contain that notice', async () => {
    const { stdin, lastFrame, unmount } = render(
      <Root dataDir={dir} width={80} height={24} makeStoreFor={makeStoreFor} requestCode={vi.fn().mockResolvedValue(undefined)} completeLogin={vi.fn().mockResolvedValue('tok2')} />
    );
    await waitForInput(stdin);
    await waitForFrame(lastFrame, 'Note of a@b.co');
    publishProblem(OLD);
    await waitForFrame(lastFrame, OLD);
    stdin.write('L');
    await waitForFrame(lastFrame, 'log out and delete local data?');
    stdin.write('y');
    await waitForFrame(lastFrame, 'Email:');
    stdin.write('c@d.co');
    await waitForFrame(lastFrame, 'Email: c@d.co');
    stdin.write('\r');
    await waitForFrame(lastFrame, 'Code:');
    stdin.write('ABC123');
    await waitForFrame(lastFrame, 'Code: ABC123');
    stdin.write('\r');
    const frame = await waitForFrame(lastFrame, 'Note of c@d.co');
    expect(frame).not.toContain(OLD);
    unmount();
  });
});
