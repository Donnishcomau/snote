import type { Reporter, TestCase, Vitest } from 'vitest/node';
import { sanitizeForTerminal } from '../../src/core/sanitize';

// #369: a passed test that used most of its own timeout is a flake waiting
// for a slow runner. Warn above half, fail the run above 80 percent.
export const WARN_SHARE = 0.5;
export const FAIL_SHARE = 0.8;

export type HeadroomLevel = 'ok' | 'warn' | 'fail';

export function headroomLevel(t: { state: string; durationMs: number; timeoutMs?: number }): HeadroomLevel {
  const { state, durationMs, timeoutMs } = t;
  if (state !== 'passed' || !timeoutMs) return 'ok';
  if (durationMs > timeoutMs * FAIL_SHARE) return 'fail';
  if (durationMs > timeoutMs * WARN_SHARE) return 'warn';
  return 'ok';
}

// Sink hygiene: file and test names are untrusted text that reaches the CI
// log and a terminal. Strip terminal controls, then flatten line breaks so
// a name cannot start a new line (a `::` line is a workflow command).
function clean(s: string): string {
  return sanitizeForTerminal(s).replace(/[\n\r\t]/g, ' ');
}

export function headroomLine(file: string, name: string, durationMs: number, timeoutMs: number): string {
  return `HEADROOM ${clean(file)} > ${clean(name)}: ${Math.round(durationMs)} ms of ${timeoutMs} ms`;
}

export default class HeadroomReporter implements Reporter {
  private lines: string[] = [];
  private failed = 0;
  private vitest: Vitest | undefined;

  onInit(vitest: Vitest): void {
    this.vitest = vitest;
  }

  onTestCaseResult(testCase: TestCase): void {
    const durationMs = testCase.diagnostic()?.duration ?? 0;
    const timeoutMs = testCase.options.timeout;
    const level = headroomLevel({ state: testCase.result().state, durationMs, timeoutMs });
    if (level === 'ok' || !timeoutMs) return;
    if (level === 'fail') this.failed += 1;
    this.lines.push(headroomLine(testCase.module.relativeModuleId, testCase.fullName, durationMs, timeoutMs));
  }

  onTestRunEnd(): void {
    const log = (s: string): void => {
      if (this.vitest) this.vitest.logger.log(s);
      else console.log(s);
    };
    for (const l of this.lines) log(l);
    if (this.failed > 0) {
      log(`HEADROOM FAIL: ${this.failed} passed test(s) used more than ${FAIL_SHARE * 100} percent of their timeout`);
      process.exitCode = 1;
    }
  }
}
