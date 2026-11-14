/**
 * #600: the one terminal hyperlink (OSC 8) snote writes: the fixed Simplenote
 * sign-up address on the login screen's email step. The target and the shown
 * text are this constant; no note, tag, server or typed text is ever placed
 * in it. The output guard (src/core/output-guard.ts) keeps exactly
 * SIGNUP_LINK, whole, and drops every other string sequence.
 * proof: test/core/hyperlink.test.tsx
 */
export const SIGNUP_URL = 'https://app.simplenote.com/signup/';

/** The whole link: OSC 8 open to SIGNUP_URL, SIGNUP_URL as its text, OSC 8 close. The only string sequence the output guard lets through. */
export const SIGNUP_LINK = '\x1b]8;;' + SIGNUP_URL + '\x1b\\' + SIGNUP_URL + '\x1b]8;;\x1b\\';

/** The sign-up URL as shown text: wrapped in OSC 8 on a terminal, the plain URL otherwise. */
export function signupLink(terminal: boolean): string {
  return terminal ? SIGNUP_LINK : SIGNUP_URL;
}
