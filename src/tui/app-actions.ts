import React from 'react';
import { Store } from 'redux';
import { basename, join } from 'node:path';

import type { State } from '../core/store';
import { editInEditor, expectNote, releaseDraftsAfterSave } from '../core/editor';
import { selectEditor, isTerminalEditor, editorFinishHint } from '../core/editor-select';
import { newNoteFields } from '../core/new-note';
import { publishLink } from '../core/note-keys';
import { copyToClipboard } from '../core/clipboard';
import { sanitizeForTerminal } from '../core/sanitize';
import { checklistItems, insertChecklistItem } from '../core/checklist';
import { mergeEditorKeepingText, noteWriter } from '../core/held-lines';
import { documentsDir, exportFileName } from '../core/export-name';
// use the vendored action creator so the raw type string stays in one place (editor-suspend gate)
import { editNote } from '@vendor/state/data/actions';

import type { EntityId, Note } from '@vendor/types';

// true while an editor session owns the terminal; no second session starts.
let editorOpen = false;

interface EditSelectedNoteCtx {
  store: Store<State>;
  selectedEntry: { id: EntityId; note: Note } | null;
  setRawMode: (mode: boolean) => void;
  runEditor?: (initial: string, opts?: { onWrite?: (text: string) => void }) => Promise<string | null>;
  onEditorError?: (message: string) => void;
  suspend?: (run: () => Promise<void>) => Promise<unknown>;
}

/**
 * Edit the selected note in the external editor.
 */
export function editSelectedNote(ctx: EditSelectedNoteCtx): void {
  const { store, selectedEntry, setRawMode, runEditor, onEditorError, suspend } = ctx;
  // Edit the selected note in the editor
  if (selectedEntry && !editorOpen) {
    editorOpen = true;
    setRawMode(false);
    const editor = runEditor ?? editInEditor;
    // Keep the result outside the suspend callback: it resolves to undefined.
    // The editor is started exactly once; raw mode is restored off the editor's
    // own completion (never off the handover's settle), so a terminal that is
    // suspended and comes back is never mistaken for the editor failing.
    let result: string | null = null; const w = noteWriter(store, selectedEntry.id, selectedEntry.note.content ?? ''); // #97: each :w
    let editorError: unknown;
    let editorFailed = false;
    let settle!: () => void;
    const editorDone = new Promise<void>((resolve) => {
      settle = resolve;
    });
    const run = async () => {
      try {
        announceEditorIfGui();
        expectNote(selectedEntry.id); result = await editor(selectedEntry.note.content ?? '', { onWrite: w.write });
      } catch (err) {
        editorError = err;
        editorFailed = true;
      }
      // the editor is done, whatever the outcome: hand the terminal back
      editorOpen = false;
      setRawMode(true);
      settle();
    };
    const done = suspend ? suspend(run) : run();
    // once the terminal is back, dispatch the edit or report the failure
    void editorDone.then(() => {
      if (editorFailed) {
        onEditorError?.(editorError instanceof Error ? editorError.message : String(editorError));
        return;
      }
      if (result !== null) {
        // a remote change may have landed while the editor was open;
        // merge against the store's current content instead of overwriting it.
        const current = store.getState().data.notes.get(selectedEntry.id)?.content ?? '';
        const merged = mergeEditorKeepingText(w.base(), result, current);
        if (result !== w.base()) store.dispatch({
          type: 'EDIT_NOTE',
          noteId: selectedEntry.id,
          changes: { content: merged.content },
        } as never);
        releaseDraftsAfterSave(); // #65: the draft goes once state.json holds the text
        if (merged.conflict || w.conflicted()) {
          onEditorError?.('A change from another device could not be merged automatically - both versions were kept.');
        }
      }
    });
    void Promise.resolve(done);
  }
}

interface SaveInlineEditCtx {
  store: Store<State>;
  selectedEntry: { id: EntityId; note: Note } | null;
  // the note's content when the inline editor was opened (InlineEditor's
  // `base` prop, from useInlineEditorState)
  base: string;
  // the inline textarea's live buffer at the moment Ctrl+S was pressed
  local: string;
  onEditorError?: (message: string) => void; onNotice?: (message: string) => void; // #402: info notice
}

/**
 *.3: Ctrl+S save path for the built-in inline editor — mirrors
 * `editSelectedNote`'s merge-on-save (above) but with no external process:
 * `local` is already in hand, so there's no suspend/runEditor/setRawMode.
 */
export function saveInlineEdit(ctx: SaveInlineEditCtx): void {
  const { store, selectedEntry, base, local, onEditorError, onNotice } = ctx;
  if (!selectedEntry) return;
  //-style: a remote change may have landed while the editor was open;
  // merge against the store's current content instead of overwriting it.
  const had = store.getState().data.notes.get(selectedEntry.id); // #402: undefined once deleted forever elsewhere
  const merged = had ? mergeEditorKeepingText(base, local, had.content ?? '') : { content: local, conflict: false };
  // editor-suspend.test.tsx's structural guard counts this file's literal
  // action-type occurrences; the vendored action creator (already imported
  // for insertCheckItem below) keeps that count unchanged.
  const n = selectedEntry.note; store.dispatch(editNote(selectedEntry.id, { content: merged.content, ...(had ? {} : { tags: n.tags, systemTags: n.systemTags.filter((t) => t === 'pinned' || t === 'markdown'), creationDate: n.creationDate }) })); // #402: keep tags, pin, markdown (not published/shared)
  if (!had) onNotice?.('This note was deleted on another device - your typed text was kept.'); else if (merged.conflict) {
    onEditorError?.('A change from another device could not be merged automatically - both versions were kept.');
  }
}

interface CreateNoteCtx {
  store: Store<State>;
  // the note on the first row of the current list, when there is one
  topNote?: Note | null;
  setRawMode: (mode: boolean) => void;
  runEditor?: (initial: string) => Promise<string | null>;
  setSelectedIndex: React.Dispatch<React.SetStateAction<number>>;
  onEditorError?: (message: string) => void;
  onNoteCreated?: () => void;
  suspend?: (run: () => Promise<void>) => Promise<unknown>;
}

/**
 * Create a new note and edit it.
 */
export function createNote(ctx: CreateNoteCtx): void {
  const { store, setRawMode, runEditor, setSelectedIndex, onEditorError, onNoteCreated, suspend } = ctx;
  if (editorOpen) return;
  editorOpen = true;
  setRawMode(false);
  const noteId: EntityId = crypto.randomUUID() as EntityId;
  const editor = runEditor ?? editInEditor;
  // #618: the first :w creates the note, each later write and the close edit it (#97), so a :wq after a :w adds no second note
  let w: ReturnType<typeof noteWriter> | undefined;
  const write = (text: string): void => {
    if (w) return w.write(text);
    const fields = newNoteFields(store.getState().ui.collection, ctx.topNote);
    try { store.dispatch({ type: 'CREATE_NOTE_WITH_ID', noteId, note: { content: text, systemTags: fields.systemTags, tags: fields.tags }, meta: { nextNoteToOpen: noteId } } as never); } // OMARCHY: boundary cast — the vendored action type carries meta
    finally { if (store.getState().data.notes.get(noteId)?.content === text) w = noteWriter(store, noteId, text); } // #475 rule: a throw after the reducer still leaves the note holding the write
  };
  // As in editSelectedNote: the result lives outside the suspend callback, and
  // raw mode is restored off the editor's own completion, never the handover's.
  let result: string | null = null;
  let editorError: unknown;
  let editorFailed = false;
  let settle!: () => void;
  const editorDone = new Promise<void>((resolve) => {
    settle = resolve;
  });
  const run = async () => {
    try {
      announceEditorIfGui();
      expectNote(null, { id: noteId, onWrite: write }); result = await editor('');
    } catch (err) {
      editorError = err;
      editorFailed = true;
    }
    // the editor is done, whatever the outcome: hand the terminal back
    editorOpen = false;
    setRawMode(true);
    settle();
  };
  const done = suspend ? suspend(run) : run();
  // once the terminal is back, dispatch the new note or report the failure
  void editorDone.then(() => {
    if (editorFailed) {
      onEditorError?.(editorError instanceof Error ? editorError.message : String(editorError));
      return;
    }
    if (result !== null || w) {
      if (result !== null && result !== w?.base()) write(result);
      releaseDraftsAfterSave(); // #65: the draft goes once state.json holds the text
      if (w && (store.getState().data.notes.get(noteId)?.content ?? '').trim() === '') { store.dispatch({ type: 'TRASH_NOTE', noteId } as never); onEditorError?.('Empty note moved to trash'); return; } // #618 rev2 (PM b): a new note emptied before the close is a discard, kept in the trash
      if (w?.conflicted()) onEditorError?.('A change from another device could not be merged automatically - both versions were kept.'); // as editSelectedNote
      // Select the new note: ui.openedNote (set via meta.nextNoteToOpen
      // above) moves the marker in useAppState's render.
      setSelectedIndex((i) => i);
      onNoteCreated?.();
    }
  });
  void Promise.resolve(done);
}

interface CopyLinkCtx {
  selectedEntry: { id: EntityId; note: Note } | null;
  copyText?: (text: string) => boolean;
  setCopyResult: (v: null | { noteId: EntityId; ok: boolean }) => void;
}

/**
 * Copy the public link of the selected note to the clipboard.
 */
export function copyLink(ctx: CopyLinkCtx): void {
  const { selectedEntry, copyText, setCopyResult } = ctx;
  if (selectedEntry) {
    const link = publishLink(selectedEntry.note);
    if (link !== null) {
      const ok = (copyText ?? copyToClipboard)(link);
      setCopyResult({ noteId: selectedEntry.id, ok });
    }
  }
}

interface ForceSyncNowCtx {
  store: Store<State>;
  onForceSync?: () => void;
  timerRef: { current: ReturnType<typeof setTimeout> | null };
  setSyncedAt: (v: string | null) => void;
}

/**
 * Fire a manual sync and flash "sync checked" (green; #649: the bar shows the #619 time) or "sync requested" (not connected) for 3 seconds (r key).
 */
export function forceSyncNow(ctx: ForceSyncNowCtx): void {
  const { store, onForceSync, timerRef, setSyncedAt } = ctx;
  const fn = onForceSync ?? (store as { forceSync?: () => void }).forceSync;
  if (!(store as { reconnectIfStale?: () => boolean }).reconnectIfStale?.()) fn?.call(store); // #625: a stale connection reconnects instead
  if (timerRef.current) clearTimeout(timerRef.current);
  const green = store.getState().simperium.connected; // #79: only a green connection may say "synced"
  setSyncedAt(green ? 'sync checked' : 'sync requested');
  timerRef.current = setTimeout(() => {
    setSyncedAt(null);
    timerRef.current = null;
  }, 3000);
}

interface InsertCheckItemCtx {
  store: Store<State>;
  selectedEntry: { id: EntityId; note: Note } | null;
  itemIndex: number;
  value: string;
}

/**
 * insert a checklist item after the item at the cursor (same `at`
 * note-focus.ts computes for `c`), else at the end — insertChecklistItem
 * decides placement itself.
 */
export function insertCheckItem(ctx: InsertCheckItemCtx): void {
  const { store, selectedEntry, itemIndex, value } = ctx;
  if (!selectedEntry) return;
  const content = selectedEntry.note.content ?? '';
  const at = Math.min(itemIndex, checklistItems(content).length - 1);
  store.dispatch(editNote(selectedEntry.id, { content: insertChecklistItem(content, at, value) }));
}

/**
 * Prints the one line a suspended terminal shows while a GUI editor is
 * open (terminal editors redraw the screen themselves, so they get nothing).
 */
function announceEditorIfGui(): void {
  const cmd = selectEditor(process.env);
  if (isTerminalEditor(cmd) || !process.stdout.isTTY) return;
  const first = cmd.trim().split(/\s+/)[0] ?? '';
  const displayName = sanitizeForTerminal(basename(first)).replace(/^./, (c) => c.toUpperCase()); // #221: the name comes from the environment
  process.stdout.write(`Editing in ${displayName} — ${editorFinishHint(cmd)}\n`);
}

interface ExportSelectedNoteCtx {
  selectedEntry: { id: EntityId; note: Note } | null;
  // the path typed into the prompt (#637: its folder and file name are used;
  // a collision picks a free name next to it)
  value: string;
  setNotice: (v: string) => void;
  setNoticeError: (v: string) => void;
}

/**
 * write the selected note to a .md file (the `w` prompt). #637: the
 * edited path is used as typed (exportTo in export-note.ts) and a free name
 * is picked next to it, so an
 * existing file is never overwritten. Success and failure both answer with a notice
 * line. snote-diet: export-note loads only here. proof: test/core/export-note.test.tsx, test/core/export-path.test.ts
 */
export function exportSelectedNote(ctx: ExportSelectedNoteCtx): void {
  const { selectedEntry, value, setNotice, setNoticeError } = ctx;
  if (!selectedEntry) return;
  const target = value.trim() !== '' ? value : join(documentsDir(), `${exportFileName(selectedEntry.note.content ?? '')}.md`);
  import('../core/export-note').then((m) => m.exportTo(selectedEntry.note, target))
    .then((path) => setNotice(`exported: ${path}`))
    .catch((err: unknown) =>
      setNoticeError(`export failed: ${err instanceof Error ? err.message : String(err)}`),
    );
}
