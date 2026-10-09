import { guardOutputStream } from '../../src/core/output-guard';

interface Recorder {
  stream: { write(chunk: unknown, ...args: unknown[]): unknown };
  records: unknown[];
}

/** A fresh recorder: every write that gets through the guard lands in `records`. */
function recorder(): Recorder {
  const records: unknown[] = [];
  const stream = {
    write(chunk: unknown, ..._args: unknown[]): unknown {
      records.push(chunk);
      return true;
    },
  };
  guardOutputStream(stream);
  return { stream, records };
}

describe('output guard: string sequences end on CAN, SUB or a new ESC', () => {
  it('1: WHEN a wrapped recorder gets write(\'a\\x1b]0;x\\x1b[31m\') then write(\'next frame\') THEN the records join to `a\\x1b[31mnext frame`', () => {
    const { stream, records } = recorder();
    stream.write('a\x1b]0;x\x1b[31m');
    stream.write('next frame');
    expect(records.join('')).toBe('a\x1b[31mnext frame');
  });

  it('2: WHEN it gets `a\\x1b]52;c;AA\\x18b` and, on a fresh recorder, `a\\x1bPq#0\\x1ab` THEN they record `ab` and `ab`', () => {
    const osc = recorder();
    osc.stream.write('a\x1b]52;c;AA\x18b');
    expect(osc.records.join('')).toBe('ab');
    const dcs = recorder();
    dcs.stream.write('a\x1bPq#0\x1ab');
    expect(dcs.records.join('')).toBe('ab');
  });

  it('3: WHEN it gets `a\\x1b]8;;http://e\\x1b\\\\L` THEN it records `aL` (the ST terminator still ends the string)', () => {
    const { stream, records } = recorder();
    stream.write('a\x1b]8;;http://e\x1b\\L');
    expect(records.join('')).toBe('aL');
  });

  it('4: WHEN it gets `a\\x1b]0;x\\x1bcb` THEN it records `ab` (the new sequence `ESC c` is itself dropped)', () => {
    const { stream, records } = recorder();
    stream.write('a\x1b]0;x\x1bcb');
    expect(records.join('')).toBe('ab');
  });

  it('5: WHEN it gets write(\'a\\x1b]0;x\\x1b\') then write(\'\\\\b\') THEN the records join to `ab`', () => {
    const { stream, records } = recorder();
    stream.write('a\x1b]0;x\x1b');
    stream.write('\\b');
    expect(records.join('')).toBe('ab');
  });
});
