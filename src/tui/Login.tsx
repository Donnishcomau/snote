import { Box, Text, useInput } from 'ink';
import React, { useState } from 'react';
// F162: pasted email/code drawn through sanitizeForTerminal (display only)
import { theme } from './theme'; import { sanitizeForTerminal } from '../core/sanitize';

interface LoginProps {
  width: number;
  height: number;
  requestCode: (email: string) => Promise<unknown>;
  completeLogin: (email: string, code: string) => Promise<string>;
  onLoggedIn: (auth: { email: string; token: string }) => void;
  passwordLogin?: (email: string, password: string) => Promise<string>; // T70
}

/**
 * Login screen: email step → emailed code step.
 */
const hidden = (s: string): boolean => sanitizeForTerminal(s) !== s; // F162: control/direction chars
const REFUSED = 'Email or code has control or hidden characters';

export function Login({
  width,
  height,
  requestCode,
  completeLogin,
  onLoggedIn,
  passwordLogin,
}: LoginProps): React.JSX.Element {
  const [step, setStep] = useState<'email' | 'code' | 'password'>('email'); // T70
  const [email, setEmail] = useState('');
  const [code, setCode] = useState('');
  const [password, setPassword] = useState(''); // T70
  const [error, setError] = useState('');
  const [pending, setPending] = useState(false);

  useInput((input, key) => {
    // Enter first
    if (key.return) {
      if (step === 'email') {
        if (email.trim() === '') return;
        if (hidden(email)) { setError(REFUSED); return; } // F162
        setError('');
        setPending(true);
        requestCode(email.trim())
          .then(() => {
            setStep('code');
          })
          .catch((err: Error) => {
            setError(err.message);
          })
          .finally(() => {
            setPending(false);
          });
      } else if (step === 'code') {
        if (code.trim() === '') return;
        if (hidden(code)) { setError(REFUSED); return; } // F162
        setError('');
        setPending(true);
        completeLogin(email.trim(), code.trim())
          .then((token: string) => {
            onLoggedIn({ email: email.trim(), token });
          })
          .catch((err: Error) => {
            setError(err.message);
            setCode('');
          })
          .finally(() => {
            setPending(false);
          });
      } else if (step === 'password') { // T70
        if (password === '') return;
        if (hidden(email)) { setError(REFUSED); return; } // S5c-02
        setError('');
        setPending(true);
        passwordLogin!(email.trim(), password)
          .then((token: string) => {
            onLoggedIn({ email: email.trim(), token });
          })
          .catch((err: Error) => {
            setError(err.message);
            setPassword('');
          })
          .finally(() => {
            setPending(false);
          });
      }
      return;
    }

    // Tab: switch to password step from email step
    if (key.tab) { // T70
      if (step === 'email' && passwordLogin !== undefined && email.trim() !== '') {
        setStep('password');
        setError('');
      }
      // Tab in code and password steps does nothing
      return;
    }

    // Escape: go back to email step from code step
    if (key.escape) {
      if (step === 'code') {
        setStep('email');
        setCode('');
        setError('');
      } else if (step === 'password') { // T70
        setStep('email');
        setPassword('');
        setError('');
      }
      // Escape in email step does nothing
      return;
    }

    // Backspace / delete
    if (key.backspace || key.delete) {
      if (step === 'email') {
        setEmail((prev) => prev.slice(0, -1));
      } else if (step === 'code') {
        setCode((prev) => prev.slice(0, -1));
      } else if (step === 'password') { // T70
        setPassword((prev) => prev.slice(0, -1));
      }
      return;
    }

    // Regular text entry
    if (input !== '' && !key.ctrl && !key.meta && !key.tab && !key.escape) {
      if (step === 'email') {
        setEmail((prev) => prev + input);
      } else if (step === 'code') {
        setCode((prev) => prev + input);
      } else if (step === 'password') { // T70
        setPassword((prev) => prev + input);
      }
    }
  });

  return (
    <Box flexDirection="column" height={height} width={width} paddingX={2}>
      <Text bold>Simplenote login</Text>
      {step === 'email' ? (
        <>
          <Text>Email: {sanitizeForTerminal(email)}</Text>
          {passwordLogin !== undefined ? ( // T70
            <Text>Tab: log in with a password</Text>
          ) : null}
          <Text {...theme.muted}>No account? Sign up at https://app.simplenote.com/signup/</Text>
        </>
      ) : step === 'password' ? ( // T70
        <>
          <Text>Password login for {sanitizeForTerminal(email)}</Text>
          <Text>Password: {'*'.repeat(password.length)}</Text>
        </>
      ) : (
        <>
          <Text>Code sent to {sanitizeForTerminal(email)}</Text>
          <Text>Code: {sanitizeForTerminal(code)}</Text>
        </>
      )}
      {pending ? <Text>Contacting the server...</Text> : null}
      {error !== '' ? <Text {...theme.error}>Error: {sanitizeForTerminal(error)}</Text> : null}
    </Box>
  );
}

export default Login;
