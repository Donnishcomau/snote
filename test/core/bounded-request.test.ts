/** #191: the shared bounded request reads the body as a stream and stops at the cap. */
import { describe, expect, it } from 'vitest';

import { boundedRequest } from '../../src/core/bounded-request';

describe('#191 bounded request', () => {
  it('4: WHEN a reply streams 16384-byte chunks without end and maxBytes is `40000` THEN boundedRequest rejects with `is larger than 40000 bytes`, pulls at most 56384 bytes and cancels the stream', async () => {
    let pulled = 0;
    let cancelled = false;
    const stream = new ReadableStream<Uint8Array>(
      {
        pull(controller) {
          pulled += 16384;
          controller.enqueue(new Uint8Array(16384));
        },
        cancel() {
          cancelled = true;
        },
      },
      new CountQueuingStrategy({ highWaterMark: 0 }),
    );
    const fake = (async () => new Response(stream)) as unknown as typeof fetch;
    await expect(
      boundedRequest('http://h.test/x', {}, { timeoutMs: 2500, maxBytes: 40000, fetch: fake }),
    ).rejects.toThrow('is larger than 40000 bytes');
    expect(pulled).toBeLessThanOrEqual(56384);
    expect(cancelled).toBe(true);
  });
});
