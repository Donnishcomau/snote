import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render } from "ink-testing-library";
import * as os from "node:os";
import * as path from "node:path";
import * as fs from "node:fs";
import { readFileSync } from "node:fs";
import React from "react";
import type { Store } from "redux";

import { Root } from "../../src/tui/Root";
import { makeStore } from "../../src/core/store";
import { saveToken } from "../../src/core/token";
import type { State } from "../../src/core/store";
import { waitForFrame, waitForInput } from "../helpers/ink-waits";

const NOTICE = "In trash: press u to restore first";

function makeStoreFor(): () => Store<State> {
  const store = makeStore({ stubClient: {} });
  for (const id of ["n1", "n2", "n3"]) {
    store.dispatch({
      type: "CREATE_NOTE_WITH_ID",
      noteId: id as never,
      note: {
        content: `Trashed ${id}\nbody`,
        systemTags: [],
        tags: [],
        deleted: true,
      },
    });
  }
  return () => store as Store<State>;
}

async function showNotice(
  dir: string,
  cols: number,
  rows: number,
  until: (f: string) => boolean,
) {
  await saveToken(dir, { email: "a@b.co", token: "tok" });
  const r = render(
    <Root
      dataDir={dir}
      width={80}
      height={24}
      makeStoreFor={makeStoreFor()}
      requestCode={vi.fn().mockResolvedValue(undefined)}
      completeLogin={vi.fn().mockResolvedValue("tok")}
    />,
  );
  Object.defineProperty(r.stdout, "columns", {
    get: () => cols,
    configurable: true,
  });
  Object.defineProperty(r.stdout, "rows", {
    get: () => rows,
    configurable: true,
  });
  r.stdout.emit("resize");
  await waitForInput(r.stdin);
  r.stdin.write("T");
  await waitForFrame(r.lastFrame, "Trashed");
  r.stdin.write("p");
  await waitForFrame(r.lastFrame, "In trash", 2000);
  await waitForFrameBy(r.lastFrame, until);
  return r;
}

async function waitForFrameBy(
  lastFrame: () => string | undefined,
  ok: (f: string) => boolean,
) {
  const end = Date.now() + 2000;
  while (Date.now() < end && !ok(lastFrame() ?? ""))
    await new Promise((r) => setTimeout(r, 10));
}

describe("T462 notice fits one row", () => {
  let dir: string;
  beforeEach(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), "snote-notice-fit-"));
  });
  afterEach(() => {
    fs.rmSync(dir, { recursive: true, force: true });
  });

  it("1: WHEN Root at 30x10 shows the trash notice THEN exactly one line starts with `In trash: press u to restore`, it ends with `…`, no line is `first`, and no line is longer than `30`.", async () => {
    const ok = (f: string) =>
      f
        .split("\n")
        .some(
          (l) =>
            l.startsWith("In trash: press u to restore") && l.endsWith("…"),
        );
    const { lastFrame, unmount } = await showNotice(dir, 30, 10, ok);
    const lines = (lastFrame() ?? "").split("\n");
    const hits = lines.filter((l) =>
      l.startsWith("In trash: press u to restore"),
    );
    expect(hits.length).toBe(1);
    expect(hits[0].trimEnd().endsWith("…")).toBe(true);
    expect(lines.some((l) => l.trim() === "first")).toBe(false);
    expect(Math.max(...lines.map((l) => l.length))).toBeLessThanOrEqual(30);
    unmount();
  });

  it("2: WHEN Root at 20x10 shows the trash notice THEN a line starts with `u Restore`, exactly one line starts with `In trash`, and the frame has at most `10` lines.", async () => {
    const ok = (f: string) =>
      f.split("\n").some((l) => l.startsWith("In trash")) &&
      f.split("\n").some((l) => l.startsWith("u Restore"));
    const { lastFrame, unmount } = await showNotice(dir, 20, 10, ok);
    const lines = (lastFrame() ?? "").split("\n");
    expect(lines.some((l) => l.startsWith("u Restore"))).toBe(true);
    expect(lines.filter((l) => l.startsWith("In trash")).length).toBe(1);
    expect(lines.length).toBeLessThanOrEqual(10);
    unmount();
  });

  it("3: WHEN Root at 80x24 shows the trash notice THEN a line is exactly `In trash: press u to restore first`.", async () => {
    const ok = (f: string) => f.split("\n").some((l) => l.trimEnd() === NOTICE);
    const { lastFrame, unmount } = await showNotice(dir, 80, 24, ok);
    expect(
      (lastFrame() ?? "")
        .split("\n")
        .some((l) => l.trimEnd() === "In trash: press u to restore first"),
    ).toBe(true);
    unmount();
  });

  it("4: WHEN src/tui/App.tsx is read THEN `trimEnd().split('\\n').length` is `247` and it contains `sanitizeForTerminal(notice.message)`.", () => {
    const src = readFileSync(
      path.resolve(process.cwd(), "src/tui/App.tsx"),
      "utf8",
    );
    expect(src.trimEnd().split("\n").length).toBe(247);
    expect(src).toContain("sanitizeForTerminal(notice.message)");
  });
});
