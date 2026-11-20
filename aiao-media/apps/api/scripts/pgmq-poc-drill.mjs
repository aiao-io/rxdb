import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { PgmqGenerationConsumer } from '../src/pgmq-consumer.ts';

const task = {
  taskId: '10000000-0000-4000-8000-000000000001',
  taskRevision: 3,
  kind: 'image-generation'
};

class DrillQueue {
  #now = 0;
  #rows = [];
  #archived = [];
  #failNextDelete = true;
  #readTotal = 0;

  get archived() {
    return [...this.#archived];
  }

  get pending() {
    return this.#rows.length;
  }

  get readTotal() {
    return this.#readTotal;
  }

  enqueue(msgId, readCount = 1, message = task) {
    this.#rows.push({ msgId, readCount, message, availableAt: this.#now });
  }

  advance(milliseconds) {
    this.#now += milliseconds;
  }

  async read(queue, visibilityTimeoutSeconds, limit) {
    assert.equal(queue, 'media_generation_poc');
    assert.equal(limit, 1);
    const row = this.#rows.find(candidate => candidate.availableAt <= this.#now);
    if (!row) return [];
    this.#readTotal += 1;
    row.readCount += row.readCount === 1 ? 0 : 0;
    row.availableAt = this.#now + visibilityTimeoutSeconds * 1000;
    return [row];
  }

  async delete(queue, msgId) {
    assert.equal(queue, 'media_generation_poc');
    if (this.#failNextDelete) {
      this.#failNextDelete = false;
      throw new Error('ack interrupted');
    }
    this.#rows = this.#rows.filter(row => row.msgId !== msgId);
  }

  async archive(queue, msgId) {
    assert.equal(queue, 'media_generation_poc');
    this.#archived.push(msgId);
    this.#rows = this.#rows.filter(row => row.msgId !== msgId);
  }
}

class DrillStore {
  #leases = new Set();
  #results = new Map();
  #settled = new Set();
  #failures = [];
  #now = 0;

  get resultCount() {
    return this.#results.size;
  }

  get settlementCount() {
    return this.#settled.size;
  }

  get failureCount() {
    return this.#failures.length;
  }

  advance(milliseconds) {
    this.#now += milliseconds;
  }

  async acquireTaskLease(_message, key) {
    if (this.#leases.has(key)) return false;
    this.#leases.add(key);
    return true;
  }

  async findResult(key) {
    return this.#results.get(key)?.value ?? null;
  }

  async writeResult(key, result) {
    if (this.#results.has(key)) return 'existing';
    this.#results.set(key, { value: result, createdAt: this.#now });
    return 'created';
  }

  async advanceTask() {
    return true;
  }

  async settleCredits(key) {
    if (this.#settled.has(key)) return 'existing';
    this.#settled.add(key);
    return 'settled';
  }

  async recordFailure(_message, errorCode) {
    this.#failures.push(errorCode);
  }

  cleanup(maxAgeMilliseconds) {
    for (const [key, result] of this.#results) {
      if (this.#now - result.createdAt >= maxAgeMilliseconds) this.#results.delete(key);
    }
  }
}

async function main() {
  const workerSource = await readFile(resolve(import.meta.dirname, '../src/local-first-worker.ts'), 'utf8');
  assert.match(workerSource, /DurableObject|RelayTask/);
  assert.doesNotMatch(workerSource, /pgmq|PgmqGenerationConsumer/);

  const queue = new DrillQueue();
  const store = new DrillStore();
  queue.enqueue('1');
  let providerCalls = 0;
  const consumer = new PgmqGenerationConsumer({
    queue,
    store,
    visibilityTimeoutSeconds: 1,
    maxReadCount: 2,
    provider: { generate: async () => `result-${++providerCalls}` }
  });

  assert.deepEqual(await consumer.runOnce(), { state: 'retried', messageId: '1', errorCode: 'ack interrupted' });
  queue.advance(1000);
  store.advance(1000);
  const restarted = new PgmqGenerationConsumer({
    queue,
    store,
    visibilityTimeoutSeconds: 1,
    maxReadCount: 2,
    provider: { generate: async () => `result-${++providerCalls}` }
  });
  assert.deepEqual(await restarted.runOnce(), { state: 'duplicate', messageId: '1' });
  assert.equal(providerCalls, 1);
  assert.equal(store.settlementCount, 1);

  queue.enqueue('2');
  const failing = new PgmqGenerationConsumer({
    queue,
    store: new DrillStore(),
    visibilityTimeoutSeconds: 1,
    maxReadCount: 1,
    provider: {
      generate: async () => {
        throw new Error('provider unavailable');
      }
    }
  });
  assert.deepEqual(await failing.runOnce(), { state: 'archived', messageId: '2', errorCode: 'provider unavailable' });
  assert.deepEqual(queue.archived, ['2']);

  const backlogTasks = Array.from({ length: 5 }, (_, index) => ({
    ...task,
    taskId: `10000000-0000-4000-8000-${String(index + 10).padStart(12, '0')}`
  }));
  backlogTasks.forEach((backlogTask, index) => queue.enqueue(`backlog-${index}`, 1, backlogTask));
  const backlogStore = new DrillStore();
  let backlogProviderCalls = 0;
  const rollingConsumer = new PgmqGenerationConsumer({
    queue,
    store: backlogStore,
    provider: { generate: async () => `backlog-result-${++backlogProviderCalls}` }
  });
  const replacementConsumer = new PgmqGenerationConsumer({
    queue,
    store: backlogStore,
    provider: { generate: async () => `backlog-result-${++backlogProviderCalls}` }
  });
  while (queue.pending > 0) {
    const worker = backlogProviderCalls < 3 ? rollingConsumer : replacementConsumer;
    const result = await worker.runOnce();
    assert.equal(result.state, 'processed');
  }
  assert.equal(backlogProviderCalls, 5);
  assert.equal(queue.pending, 0);

  store.advance(86400000);
  store.cleanup(86400000);
  assert.equal(store.resultCount, 0);
  console.log(
    JSON.stringify({
      providerCalls,
      backlogProviderCalls,
      settlements: store.settlementCount + backlogStore.settlementCount,
      archived: queue.archived,
      failures: store.failureCount,
      queueReadTotal: queue.readTotal,
      backlog: queue.pending
    })
  );
}

await main();
