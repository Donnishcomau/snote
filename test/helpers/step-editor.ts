/**
 * #97: a fake external editor driven step by step from a test. The script
 * takes the draft path as its last argument and, for step i, waits for
 * `go<i>` in its control folder; then it writes `text<i>` to the draft (in
 * place, or by renaming a new file over it when `mv<i>` exists, as nvim
 * does) and touches `done<i>`, or exits with the code in `exit<i>`. It gives
 * up after about 10 s, so a failed test never leaves it running.
 */
import { chmodSync, existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

export interface StepEditor {
  bin: string;
  write(text: string, how?: 'inplace' | 'rename'): void;
  quit(code?: number): void;
  exited(): boolean;
  done(step: number): boolean;
  remove(): void;
}

/** `name` decides the editor kind: `vi` is a terminal editor, any unknown name a GUI one. */
export function stepEditor(name = 'vi'): StepEditor {
  const root = mkdtempSync(join(tmpdir(), 'snote-step-editor-'));
  const ctl = join(root, 'ctl');
  mkdirSync(ctl);
  const bin = join(root, name);
  writeFileSync(
    bin,
    [
      '#!/bin/sh',
      'for f in "$@"; do last="$f"; done',
      `d='${ctl}'`,
      'i=1',
      'while :; do',
      '  n=0',
      '  while [ ! -e "$d/go$i" ]; do n=$((n+1)); if [ $n -gt 500 ]; then touch "$d/exited"; exit 3; fi; sleep 0.02; done',
      '  if [ -e "$d/exit$i" ]; then c=$(cat "$d/exit$i"); touch "$d/exited"; exit "$c"; fi',
      '  if [ -e "$d/mv$i" ]; then cat "$d/text$i" > "$last.new" && mv "$last.new" "$last"; else cat "$d/text$i" > "$last"; fi',
      '  touch "$d/done$i"',
      '  i=$((i+1))',
      'done',
      '',
    ].join('\n'),
  );
  chmodSync(bin, 0o755);
  let step = 0;
  const go = (): void => writeFileSync(join(ctl, `go${step}`), '');
  return {
    bin,
    write(text, how = 'inplace') {
      step++;
      writeFileSync(join(ctl, `text${step}`), text);
      if (how === 'rename') writeFileSync(join(ctl, `mv${step}`), '');
      go();
    },
    quit(code = 0) {
      step++;
      writeFileSync(join(ctl, `exit${step}`), String(code));
      go();
    },
    exited: () => existsSync(join(ctl, 'exited')),
    done: (n) => existsSync(join(ctl, `done${n}`)),
    remove: () => rmSync(root, { recursive: true, force: true }),
  };
}
