import { RetryQueue } from '../src/graph/retry-queue';

describe('RetryQueue', () => {
  let queue: RetryQueue;

  beforeEach(() => {
    queue = new RetryQueue({ capacity: 5, maxAgeMs: 10_000 });
  });

  afterEach(() => {
    queue.stopAutoFlush();
  });

  test('enqueue and dequeue preserves FIFO order', () => {
    queue.enqueue('CREATE (n:Test)', { id: 1 });
    queue.enqueue('CREATE (n:Test)', { id: 2 });
    queue.enqueue('CREATE (n:Test)', { id: 3 });

    expect(queue.size).toBe(3);

    const first = queue.dequeue();
    expect(first?.params.id).toBe(1);

    const second = queue.dequeue();
    expect(second?.params.id).toBe(2);

    const third = queue.dequeue();
    expect(third?.params.id).toBe(3);

    expect(queue.isEmpty).toBe(true);
  });

  test('ring buffer evicts oldest when capacity exceeded', () => {
    // Capacity is 5
    for (let i = 0; i < 7; i++) {
      queue.enqueue('QUERY', { id: i });
    }

    // Should have 5 entries (oldest 2 evicted)
    expect(queue.size).toBe(5);
    expect(queue.stats.totalDropped).toBe(2);

    const first = queue.dequeue();
    expect(first?.params.id).toBe(2); // Items 0 and 1 were evicted
  });

  test('dequeue returns undefined when empty', () => {
    expect(queue.dequeue()).toBeUndefined();
    expect(queue.isEmpty).toBe(true);
  });

  test('drainValid skips expired entries', async () => {
    const shortQueue = new RetryQueue({ capacity: 10, maxAgeMs: 50 });

    shortQueue.enqueue('OLD', { id: 'old' });

    // Wait for the entry to expire
    await new Promise((r) => setTimeout(r, 100));

    shortQueue.enqueue('NEW', { id: 'new' });

    const ops = shortQueue.drainValid();
    expect(ops).toHaveLength(1);
    expect(ops[0].params.id).toBe('new');
    expect(shortQueue.stats.totalDropped).toBe(1);
  });

  test('stats tracks enqueue/drop counts', () => {
    queue.enqueue('Q1', {});
    queue.enqueue('Q2', {});
    queue.enqueue('Q3', {});

    expect(queue.stats.totalEnqueued).toBe(3);
    expect(queue.stats.totalDropped).toBe(0);
    expect(queue.stats.size).toBe(3);
    expect(queue.stats.capacity).toBe(5);
  });

  test('clear empties the buffer', () => {
    queue.enqueue('Q1', {});
    queue.enqueue('Q2', {});

    queue.clear();

    expect(queue.size).toBe(0);
    expect(queue.isEmpty).toBe(true);
  });

  test('flush executes operations via session', async () => {
    const executedQueries: string[] = [];
    const mockSession = {
      run: jest.fn(async (query: string) => {
        executedQueries.push(query);
      }),
      close: jest.fn(),
    };

    queue.enqueue('CREATE (a:A)', { id: 1 });
    queue.enqueue('CREATE (b:B)', { id: 2 });

    const flushed = await queue.flush(mockSession as any);

    expect(flushed).toBe(2);
    expect(executedQueries).toEqual(['CREATE (a:A)', 'CREATE (b:B)']);
    expect(queue.isEmpty).toBe(true);
    expect(queue.stats.totalFlushed).toBe(2);
  });

  test('flush re-enqueues on session failure', async () => {
    let callCount = 0;
    const mockSession = {
      run: jest.fn(async () => {
        callCount++;
        if (callCount === 2) throw new Error('Connection lost');
      }),
      close: jest.fn(),
    };

    queue.enqueue('Q1', {});
    queue.enqueue('Q2', {});
    queue.enqueue('Q3', {});

    const flushed = await queue.flush(mockSession as any);

    // Q1 succeeded, Q2 failed and Q2+Q3 re-enqueued
    expect(flushed).toBe(1);
    expect(queue.size).toBeGreaterThan(0);
  });

  test('default options use sane defaults', () => {
    const defaultQueue = new RetryQueue();
    expect(defaultQueue.stats.capacity).toBe(1000);
  });
});
