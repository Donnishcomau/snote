/**
 * T349: the notice line was always red, so success messages like "draft
 * sent to your blog" and "New note saved" read as errors. Error notices
 * stay red; success/informational notices render green.
 */

import { describe, it, expect } from 'vitest';
import { render } from 'ink-testing-library';
import React from 'react';
import { createRequire } from 'module';
import { pathToFileURL } from 'url';
import path from 'path';

import { makeStore } from '../../src/core/store';
import { App } from '../../src/tui/App';
import { testNotes } from './fixtures';
import type { EntityId } from '@vendor/types';

const inkPkgDir = path.dirname(path.dirname(createRequire(import.meta.url).resolve('ink')));
const inkChalk = (await import(pathToFileURL(path.join(inkPkgDir, 'node_modules/chalk/source/index.js')).href)).default;

const eid = (id: string): EntityId => id as unknown as EntityId;

const wait = () => new Promise((r) => setTimeout(r, 50));

function seedStore(): ReturnType<typeof makeStore> {
  const store = makeStore({ stubClient: {} });
  testNotes.forEach((note, idx) => {
    store.dispatch({
      type: 'CREATE_NOTE_WITH_ID',
      noteId: eid(`note-${idx + 1}`),
      note: {
        content: note.content,
        systemTags: note.systemTags,
        tags: note.tags,
        deleted: note.deleted,
        modificationDate: note.modificationDate,
        creationDate: note.creationDate,
      },
    });
  });
  return store;
}

describe('notice color (T349)', () => {
  it('1: WHEN n is written with an editor that resolves "fresh note" THEN the frame contains the green ANSI wrapped text \\u001b[32mNew note saved — press g to add tags\\u001b[39m and does not contain that text wrapped in \\u001b[31m', async () => {
    inkChalk.level = 3;
    const store = seedStore();
    const okEditor = async () => 'fresh note';
    const { stdin, lastFrame } = render(
      <App store={store} width={80} height={24} runEditor={okEditor} />
    );

    await wait();
    stdin.write('n');
    await wait();

    const frame = lastFrame() ?? '';
    expect(frame).toContain('\u001b[32mNew note saved — press g to add tags\u001b[39m');
    expect(frame).not.toContain('\u001b[31mNew note saved — press g to add tags');
  });

  it('2: WHEN n is written with a failing editor THEN the frame contains the red ANSI wrapped text \\u001b[31meditor failed: ENOENT\\u001b[39m', async () => {
    inkChalk.level = 3;
    const store = seedStore();
    const failing = async () => {
      throw new Error('editor failed: ENOENT');
    };
    const { stdin, lastFrame } = render(
      <App store={store} width={80} height={24} runEditor={failing} />
    );

    await wait();
    stdin.write('n');
    await wait();

    const frame = lastFrame() ?? '';
    expect(frame).toContain('\u001b[31meditor failed: ENOENT\u001b[39m');
  });
});
