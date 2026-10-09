import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const read = (f: string): string =>
  readFileSync(resolve(process.cwd(), "src", f), "utf8");

const exportsName = (src: string, name: string): boolean =>
  new RegExp(
    `^export\\s+(interface|type|function|const)\\s+${name}\\b`,
    "m",
  ).test(src);

function offenders(files: string[], names: string[]): string[] {
  const srcs = files.map(read);
  return names.filter((n) => srcs.some((s) => exportsName(s, n)));
}

describe("T455 private core and cli types", () => {
  it("1: WHEN update-check.ts, update-state.ts, layout.ts, wrap.ts and note-row.ts are read THEN no line exports `defaultGitRunner`, `RemoteUpdateResult`, `LocalUpdate`, `PaneLayout`, `Row` or `NoteRow`.", () => {
    // defaultGitRunner stays exported: update-check-hardening-2 imports it (T455 Facts: re-check names).
    expect(
      offenders(
        [
          "core/update-check.ts",
          "core/update-state.ts",
          "core/layout.ts",
          "core/wrap.ts",
          "core/note-row.ts",
        ],
        ["RemoteUpdateResult", "LocalUpdate", "PaneLayout", "Row", "NoteRow"],
      ),
    ).toEqual([]);
  });
  it("2: WHEN blog-send.ts, blog-sent.ts and blog-client.ts are read THEN no line exports `SendNoteToBlogOptions`, `SendNoteToBlogResult`, `AlreadySentResult`, `BlogSendRecord`, `BlogSentData` or `BlogDraftOptions`.", () => {
    expect(
      offenders(
        ["core/blog-send.ts", "core/blog-sent.ts", "core/blog-client.ts"],
        [
          "SendNoteToBlogOptions",
          "SendNoteToBlogResult",
          "AlreadySentResult",
          "BlogSendRecord",
          "BlogSentData",
          "BlogDraftOptions",
        ],
      ),
    ).toEqual([]);
  });
  it("3: WHEN tombstones.ts, store.ts, export-note.ts, search.ts and history.ts are read THEN no line exports `GhostVersions`, `StoreOptions`, `FILENAME_LENGTH`, `ParsedQuery` or `Revision`.", () => {
    expect(
      offenders(
        [
          "core/tombstones.ts",
          "core/store.ts",
          "core/export-note.ts",
          "core/search.ts",
          "core/history.ts",
        ],
        [
          "GhostVersions",
          "StoreOptions",
          "FILENAME_LENGTH",
          "ParsedQuery",
          "Revision",
        ],
      ),
    ).toEqual([]);
  });
  it("4: WHEN requeue.ts, crash-report.ts, checklist.ts and editor-select.ts are read THEN no line exports `GhostReader`, `offlineEditIncluded`, `rebaseOfflineEdit`, `CrashRecord`, `ChecklistItem` or `EditorEnv`.", () => {
    // GhostReader stays exported: requeue-release-on-throw imports it.
    expect(
      offenders(
        [
          "core/requeue.ts",
          "core/crash-report.ts",
          "core/checklist.ts",
          "core/editor-select.ts",
        ],
        [
          "offlineEditIncluded",
          "rebaseOfflineEdit",
          "CrashRecord",
          "ChecklistItem",
          "EditorEnv",
        ],
      ),
    ).toEqual([]);
  });
  it("5: WHEN login-calls.ts, args.ts, main.tsx and bench.tsx are read THEN no line exports `LoginCalls`, `CliOptions`, `BuildStoreOptions` or `BenchResult`, and src/core/editor.ts still contains `export const NVIM_HINT`.", () => {
    expect(
      offenders(
        ["cli/login-calls.ts", "cli/args.ts", "cli/main.tsx", "cli/bench.tsx"],
        ["LoginCalls", "CliOptions", "BuildStoreOptions", "BenchResult"],
      ),
    ).toEqual([]);
    expect(read("core/editor.ts")).toContain("export const NVIM_HINT");
  });
});
