import assert from 'node:assert/strict';
import test from 'node:test';
import { isPgmqGenerationMessage, parsePgmqGenerationMessage, serializePgmqGenerationMessage } from './pgmq-message.ts';

test('PGMQ message only carries the minimal generation identity', () => {
  const message = parsePgmqGenerationMessage({
    taskId: '10000000-0000-4000-8000-000000000001',
    taskRevision: 3,
    kind: 'image-generation'
  });
  assert.deepEqual(message, {
    taskId: '10000000-0000-4000-8000-000000000001',
    taskRevision: 3,
    kind: 'image-generation'
  });
  assert.equal(isPgmqGenerationMessage(message), true);
  assert.deepEqual(JSON.parse(serializePgmqGenerationMessage(message)), message);
});

test('PGMQ message rejects secrets, prompt bodies, invalid revisions and extra fields', () => {
  for (const value of [
    { taskId: '10000000-0000-4000-8000-000000000001', taskRevision: 0, kind: 'image-generation' },
    { taskId: '10000000-0000-4000-8000-000000000001', taskRevision: 1.5, kind: 'image-generation' },
    { taskId: '10000000-0000-4000-8000-000000000001', taskRevision: 1, kind: 'video-generation' },
    { taskId: '10000000-0000-4000-8000-000000000001', taskRevision: 1, kind: 'image-generation', prompt: 'secret' },
    { taskId: 'not-a-uuid', taskRevision: 1, kind: 'image-generation' }
  ])
    assert.throws(() => parsePgmqGenerationMessage(value));
});
