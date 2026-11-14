// #317: a terminal is not a CI job. Ink (is-in-ci) and its colour library read CI and CONTINUOUS_INTEGRATION once, when
// they load, and then draw no frame until exit and no colour; with either set in a user's shell snote showed a blank
// screen. On a TTY snote drops both from its own environment here, loaded by the entry before main and before either
// library is evaluated (the editor and git children inherit that). Pipes and tests keep them.
// proof: test/integration/pty-ci-env.test.ts
if (process.stdout.isTTY === true) {
  delete process.env.CI;
  delete process.env.CONTINUOUS_INTEGRATION;
}
export {};
