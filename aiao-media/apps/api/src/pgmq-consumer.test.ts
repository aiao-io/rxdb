import assert from 'node:assert/strict';
import test from 'node:test';
import { PgmqGenerationConsumer, type PgmqGenerationQueue, type PgmqGenerationQueueMessage } from './pgmq-consumer.ts';
import type { PgmqGenerationIdempotencyStore } from './pgmq-idempotency.ts';
import type { PgmqGenerationMessage } from './pgmq-message.ts';

const message: PgmqGenerationMessage = {
  taskId: '10000000-0000-4000-8000-000000000001',
  taskRevision: 3,
  kind: 'image-generation'
};

function fixture() {
  const rows: PgmqGenerationQueueMessage[] = [{ msgId: '1', readCount: 1, message }];
  const deleted: string[] = [];
  const archived: string[] = [];
  const failures: string[] = [];
  const reads: Array<{ queue: string; visibilityTimeoutSeconds: number; limit: number }> = [];
  const advanced: string[] = [];
  const settled: string[] = [];
  const results = new Map<string, string>();
  const leases = new Set<string>();
  let failDelete = false;
  const queue: PgmqGenerationQueue = {
    read: async (queueName, visibilityTimeoutSeconds, limit) => {
      reads.push({ queue: queueName, visibilityTimeoutSeconds, limit });
      return rows.splice(0, limit);
    },
    delete: async (_queue, id) => {
      if (failDelete) throw new Error('ack interrupted');
      deleted.push(id);
    },
    archive: async (_queue, id) => {
      archived.push(id);
    }
  };
  const store: PgmqGenerationIdempotencyStore<string> = {
    acquireTaskLease: async (_message, key) => !leases.has(key) && (leases.add(key), true),
    findResult: async key => results.get(key) ?? null,
    writeResult: async (key, result) => {
      const state = results.has(key) ? 'existing' : 'created';
      results.set(key, result);
      return state;
    },
    advanceTask: async (_message, resultKey) => {
      advanced.push(resultKey);
      return true;
    },
    settleCredits: async resultKey => {
      settled.push(resultKey);
      return 'settled';
    },
    recordFailure: async (_message, code) => {
      failures.push(code);
    }
  };
  return { queue, store, rows, deleted, archived, failures, reads, advanced, settled, results, setFailDelete: (value: boolean) => { failDelete = value; } };
}

test('consumer reads minimal message, writes an idempotent result and acknowledges it', async () => {
  const state = fixture();
  const consumer = new PgmqGenerationConsumer({
    queue: state.queue,
    store: state.store,
    provider: { generate: async () => 'result-1' }
  });
  assert.deepEqual(await consumer.runOnce(), {
    state: 'processed',
    messageId: '1',
    resultKey: 'media-generation:10000000-0000-4000-8000-000000000001:3'
  });
  assert.deepEqual(state.deleted, ['1']);
  assert.deepEqual(state.archived, []);
  assert.equal(state.results.size, 1);
});

test('provider success before ack can be replayed from the unique result', async () => {
  const state = fixture();
  let providerCalls = 0;
  const consumer = new PgmqGenerationConsumer({
    queue: state.queue,
    store: state.store,
    provider: { generate: async () => `result-${++providerCalls}` }
  });
  await consumer.runOnce();
  state.rows.push({ msgId: '2', readCount: 2, message });
  assert.deepEqual(await consumer.runOnce(), {
    state: 'duplicate',
    messageId: '2'
  });
  assert.equal(providerCalls, 1);
});

test('consumer passes the visibility timeout and task revision through the CAS boundary', async () => {
  const state = fixture();
  const consumer = new PgmqGenerationConsumer({
    queue: state.queue,
    store: state.store,
    provider: { generate: async () => 'result-1' },
    queueName: 'media_generation_poc',
    visibilityTimeoutSeconds: 17,
    maxReadCount: 3
  });
  await consumer.runOnce();
  assert.deepEqual(state.reads, [{ queue: 'media_generation_poc', visibilityTimeoutSeconds: 17, limit: 1 }]);
  assert.deepEqual(state.advanced, ['media-generation:10000000-0000-4000-8000-000000000001:3']);
  assert.deepEqual(state.settled, ['media-generation:10000000-0000-4000-8000-000000000001:3']);
});

test('provider success followed by an ack interruption is recovered without a second provider call or credit settlement', async () => {
  const state = fixture();
  state.setFailDelete(true);
  let providerCalls = 0;
  const consumer = new PgmqGenerationConsumer({ queue: state.queue, store: state.store, provider: { generate: async () => `result-${++providerCalls}` } });
  assert.deepEqual(await consumer.runOnce(), { state: 'retried', messageId: '1', errorCode: 'ack interrupted' });
  state.setFailDelete(false);
  state.rows.push({ msgId: '2', readCount: 2, message });
  assert.deepEqual(await consumer.runOnce(), { state: 'duplicate', messageId: '2' });
  assert.equal(providerCalls, 1);
  assert.deepEqual(state.settled, ['media-generation:10000000-0000-4000-8000-000000000001:3']);
  assert.deepEqual(state.deleted, ['2']);
});

test('failed messages retry until the configured read count and then enter the archive path', async () => {
  const state = fixture();
  const consumer = new PgmqGenerationConsumer({
    queue: state.queue,
    store: {
      ...state.store,
      writeResult: async () => {
        throw new Error('provider unavailable');
      }
    },
    provider: { generate: async () => 'never-used' },
    maxReadCount: 2
  });
  assert.deepEqual(await consumer.runOnce(), { state: 'retried', messageId: '1', errorCode: 'provider unavailable' });
  state.rows.push({ msgId: '2', readCount: 2, message });
  const restarted = new PgmqGenerationConsumer({
    queue: state.queue,
    store: {
      ...state.store,
      acquireTaskLease: async () => true,
      writeResult: async () => {
        throw new Error('provider unavailable');
      }
    },
    provider: { generate: async () => 'never-used' },
    maxReadCount: 2
  });
  assert.deepEqual(await restarted.runOnce(), { state: 'archived', messageId: '2', errorCode: 'provider unavailable' });
  assert.deepEqual(state.archived, ['2']);
});

test('invalid messages are archived and never reach the provider', async () => {
  const state = fixture();
  state.rows[0].message = { ...message, prompt: 'must not be queued' };
  let providerCalls = 0;
  const consumer = new PgmqGenerationConsumer({
    queue: state.queue,
    store: state.store,
    provider: { generate: async () => `result-${++providerCalls}` }
  });
  assert.deepEqual(await consumer.runOnce(), { state: 'archived', messageId: '1', errorCode: 'invalid_message' });
  assert.deepEqual(state.archived, ['1']);
  assert.equal(providerCalls, 0);
});
