/**
 * an empty record keyed by note id, with no prototype, so a note id such as `__proto__` or `constructor` is an
 * ordinary key: `record[id] = x` stores it, `record[id]` reads only what was stored, and JSON.stringify writes it.
 * proof: test/core/proto-id-records.test.ts
 */
export function idRecord<T>(): Record<string, T> {
  return Object.create(null) as Record<string, T>;
}
