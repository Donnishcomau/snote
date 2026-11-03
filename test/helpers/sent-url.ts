/**
 * #620 (CodeQL): tests compare the whole url the `Sent as draft` line
 * shows, never a substring of the frame. A substring check also passes
 * `https://evil.test/?https://a.example/w/1`.
 *
 * `sentUrl(frame)` takes the first line that starts (after leading
 * spaces) with `Sent as draft`, takes the text after that line's last
 * ` · `, and returns its parsed href. It returns the empty string when
 * there is no such line or the token is not a valid url, and it never
 * throws, so it is safe inside a polling predicate.
 */
export function sentUrl(frame: string): string {
  const line = frame.split('\n').find((l) => l.trimStart().startsWith('Sent as draft'));
  if (line === undefined) return '';
  const at = line.lastIndexOf(' · ');
  if (at < 0) return '';
  try {
    return new URL(line.slice(at + 3).trim()).href;
  } catch {
    return '';
  }
}
