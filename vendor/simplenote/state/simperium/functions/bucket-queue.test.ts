import { beforeEach, describe, expect, it, vi } from 'vitest';

import { BucketQueue } from './bucket-queue';

import type { Bucket } from 'simperium';

type MockBucket = {
  name: string;
  isIndexing: boolean;
  on: ReturnType<typeof vi.fn>;
  touch: ReturnType<typeof vi.fn>;
  emit: (event: string) => void;
};

const makeBucket = (): MockBucket => {
  const handlers = new Map<string, Array<() => void>>();
  return {
    name: 'note',
    isIndexing: false,
    on: vi.fn((event: string, handler: () => void) => {
      handlers.set(event, [...(handlers.get(event) ?? []), handler]);
    }),
    touch: vi.fn().mockResolvedValue(undefined),
    emit: (event: string) => handlers.get(event)?.forEach((cb) => cb()),
  };
};

const makeQueue = (bucket: MockBucket) =>
  new BucketQueue(bucket as unknown as Bucket<'note', unknown>);

const setOnline = (onLine: boolean) =>
  Object.defineProperty(window.navigator, 'onLine', {
    configurable: true,
    value: onLine,
  });

describe('BucketQueue', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    setOnline(true);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('syncs nothing while the queue is empty', () => {
    const bucket = makeBucket();
    makeQueue(bucket);

    vi.advanceTimersByTime(60000);
    expect(bucket.touch).not.toHaveBeenCalled();
  });

  it('syncs an entity once its deadline passes', () => {
    const bucket = makeBucket();
    const queue = makeQueue(bucket);

    queue.add('note-1', Date.now() + 100);
    expect(queue.has('note-1')).toBe(true);

    vi.advanceTimersByTime(99);
    expect(bucket.touch).not.toHaveBeenCalled();

    vi.advanceTimersByTime(1);
    expect(bucket.touch).toHaveBeenCalledTimes(1);
    expect(bucket.touch).toHaveBeenCalledWith('note-1');
    expect(queue.has('note-1')).toBe(false);
  });

  it('keeps the earliest deadline when an entity is re-added', () => {
    const bucket = makeBucket();
    const queue = makeQueue(bucket);

    queue.add('note-1', Date.now() + 1000);
    queue.add('note-1', Date.now() + 5000);

    vi.advanceTimersByTime(1000);
    expect(bucket.touch).toHaveBeenCalledTimes(1);
    expect(bucket.touch).toHaveBeenCalledWith('note-1');
  });

  it('syncs all due entities', () => {
    const bucket = makeBucket();
    const queue = makeQueue(bucket);

    queue.add('note-1', Date.now() + 10);
    queue.add('note-2', Date.now() + 10);

    vi.advanceTimersByTime(50);
    expect(bucket.touch).toHaveBeenCalledTimes(2);
    expect(bucket.touch).toHaveBeenCalledWith('note-1');
    expect(bucket.touch).toHaveBeenCalledWith('note-2');
  });

  it('waits while the bucket is indexing and syncs afterwards', () => {
    const bucket = makeBucket();
    bucket.isIndexing = true;
    const queue = makeQueue(bucket);

    queue.add('note-1', Date.now());

    vi.advanceTimersByTime(9999);
    expect(bucket.touch).not.toHaveBeenCalled();

    bucket.isIndexing = false;
    vi.advanceTimersByTime(1);
    expect(bucket.touch).toHaveBeenCalledWith('note-1');
  });

  it('reschedules when indexing finishes', () => {
    const bucket = makeBucket();
    bucket.isIndexing = true;
    const queue = makeQueue(bucket);

    queue.add('note-1', Date.now());

    vi.advanceTimersByTime(9999);
    expect(bucket.touch).not.toHaveBeenCalled();

    bucket.isIndexing = false;
    bucket.emit('index');

    vi.advanceTimersByTime(0);
    expect(bucket.touch).toHaveBeenCalledWith('note-1');
  });

  it('does not sync while offline and recovers on the online event', () => {
    const bucket = makeBucket();
    const queue = makeQueue(bucket);

    setOnline(false);
    queue.add('note-1', Date.now());

    vi.advanceTimersByTime(30000);
    expect(bucket.touch).not.toHaveBeenCalled();
    expect(queue.has('note-1')).toBe(true);

    setOnline(true);
    window.dispatchEvent(new Event('online'));

    vi.advanceTimersByTime(0);
    expect(bucket.touch).toHaveBeenCalledWith('note-1');
  });
});
