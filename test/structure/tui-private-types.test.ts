import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const read = (f: string): string =>
  readFileSync(resolve(process.cwd(), "src/tui", f), "utf8");

const exportsName = (src: string, name: string): boolean =>
  new RegExp(
    `^export\\s+(interface|type|function|const)\\s+${name}\\b`,
    "m",
  ).test(src);
const declaresName = (src: string, name: string): boolean =>
  new RegExp(
    `^(export\\s+)?(interface|type|function|const)\\s+${name}\\b`,
    "m",
  ).test(src);

function check(
  files: string[],
  names: string[],
  mustDeclare: boolean,
): string[] {
  const srcs = files.map(read);
  for (const name of names) {
    expect(
      srcs.some((s) => exportsName(s, name)),
      `${name} exported`,
    ).toBe(false);
    if (mustDeclare)
      expect(
        srcs.some((s) => declaresName(s, name)),
        `${name} declared`,
      ).toBe(true);
  }
  return names;
}

describe("T454 private tui types", () => {
  it("1: WHEN tag-input.ts, pane-arrows.ts, notice.ts and use-reselect.ts are read THEN no line exports `TagStep`, `PaneArrowCtx`, `NoticeState`, `updateMessage` or `ReselectCtx`, and each name is still declared.", () => {
    expect(
      check(
        ["tag-input.ts", "pane-arrows.ts", "notice.ts", "use-reselect.ts"],
        [
          "TagStep",
          "PaneArrowCtx",
          "NoticeState",
          "updateMessage",
          "ReselectCtx",
        ],
        true,
      ).length,
    ).toBeGreaterThan(0);
  });
  it("2: WHEN src/tui/app-keys.ts is read THEN no line exports `SearchKeyCtx`, `TagsKeyCtx`, `dispatchTagRow`, `HistoryKeyCtx`, `OpenHistoryCtx` or `IdleKeyCtx`, and each is still declared.", () => {
    expect(
      check(
        ["app-keys.ts"],
        [
          "SearchKeyCtx",
          "TagsKeyCtx",
          "dispatchTagRow",
          "HistoryKeyCtx",
          "OpenHistoryCtx",
          "IdleKeyCtx",
        ],
        true,
      ).length,
    ).toBeGreaterThan(0);
  });
  it("3: WHEN src/tui/app-actions.ts is read THEN no line exports `EditSelectedNoteCtx`, `SaveInlineEditCtx`, `CreateNoteCtx`, `CopyLinkCtx`, `ForceSyncNowCtx`, `InsertCheckItemCtx` or `ExportSelectedNoteCtx`.", () => {
    expect(
      check(
        ["app-actions.ts"],
        [
          "EditSelectedNoteCtx",
          "SaveInlineEditCtx",
          "CreateNoteCtx",
          "CopyLinkCtx",
          "ForceSyncNowCtx",
          "InsertCheckItemCtx",
          "ExportSelectedNoteCtx",
        ],
        false,
      ).length,
    ).toBeGreaterThan(0);
  });
  it("4: WHEN TagEditor.tsx, blog-send-ask.ts, note-focus.ts and KeyHints.tsx are read THEN no line exports `TagEditorProps`, `BlogSendAskState`, `NoteKeyCtx`, `HintEntry` or `EDITING_HINTS`, and each is still declared.", () => {
    expect(
      check(
        ["TagEditor.tsx", "blog-send-ask.ts", "note-focus.ts", "KeyHints.tsx"],
        [
          "TagEditorProps",
          "BlogSendAskState",
          "NoteKeyCtx",
          "HintEntry",
          "EDITING_HINTS",
        ],
        true,
      ).length,
    ).toBeGreaterThan(0);
  });
  it("5: WHEN Root.tsx, dialog-actions.ts, Login.tsx, MainPanes.tsx and InlineEditor.tsx are read THEN no line exports `RootProps`, `TagDialogState`, `LoginProps`, `MainPanesProps` or `InlineEditorProps`.", () => {
    expect(
      check(
        [
          "Root.tsx",
          "dialog-actions.ts",
          "Login.tsx",
          "MainPanes.tsx",
          "InlineEditor.tsx",
        ],
        [
          "RootProps",
          "TagDialogState",
          "LoginProps",
          "MainPanesProps",
          "InlineEditorProps",
        ],
        false,
      ).length,
    ).toBeGreaterThan(0);
  });
});
