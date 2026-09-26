import { render } from 'ink-testing-library';
import React from 'react';

import { App } from '../../src/tui/App';
import { makeStore } from '../../src/core/store';
import { sanitizeForTerminal } from '../../src/core/sanitize';
import type { EntityId } from '@vendor/types';
import { makeNote } from '../tui/fixtures';

const eid = (id: string): EntityId => id as unknown as EntityId;

const VS16 = '\uFE0F';
const VS15 = '\uFE0E';

describe('emoji presentation selectors', () => {
  it('1: WHEN sanitizeForTerminal(\'I ❤️ you\') is called THEN it returns `I ❤ you`', () => {
    expect(sanitizeForTerminal('I ❤️ you')).toBe('I ❤ you');
  });

  it('2: WHEN sanitizeForTerminal(\'☺︎ ok\') is called THEN it returns `☺ ok`', () => {
    expect(sanitizeForTerminal('☺︎ ok')).toBe('☺ ok');
  });

  it('3: WHEN sanitizeForTerminal(\'Emoji \\u{1F600}\\u{1F389} 日本語\') is called THEN it returns the same string unchanged', () => {
    const input = 'Emoji \u{1F600}\u{1F389} 日本語';
    expect(sanitizeForTerminal(input)).toBe('Emoji \u{1F600}\u{1F389} 日本語');
  });

  it('4: WHEN <App> is rendered at width `118` with a note titled `Love ❤️ note` THEN the frame contains `Love ❤ note` and contains no `️`', async () => {
    const store = makeStore({ stubClient: {} });
    store.dispatch({
      type: 'IMPORT_NOTE_WITH_ID',
      noteId: eid('e1') as never,
      note: makeNote('e1', `Love ❤️ note\nbody`, {
        creationDate: 1000,
        modificationDate: 1000,
      }),
    });
    const { lastFrame } = render(<App store={store} width={118} height={24} />);
    await new Promise(r => setTimeout(r, 50));
    const frame = lastFrame() ?? '';
    expect(frame).toContain('Love ❤ note');
    expect(frame).not.toContain(VS16);
    expect(frame).not.toContain(VS15);
  });
});
