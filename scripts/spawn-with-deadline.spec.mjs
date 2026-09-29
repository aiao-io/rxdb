import assert from 'node:assert/strict';
import { test } from 'node:test';

import { spawnWithDeadline } from './spawn-with-deadline.mjs';

const node = (source, deadline) => spawnWithDeadline(process.execPath, ['-e', source], { stdio: 'ignore' }, deadline);

test('按时退出时交出退出码，不算超时', async () => {
  const result = await node('process.exit(3)', { deadlineMs: 5000, graceMs: 1000 });
  assert.deepEqual(result, { code: 3, signal: null, timedOut: false });
});

test('超过时限先 SIGTERM，并标记为超时', async () => {
  const result = await node('setInterval(() => {}, 1000)', { deadlineMs: 100, graceMs: 5000 });
  assert.deepEqual(result, { code: null, signal: 'SIGTERM', timedOut: true });
});

test('SIGTERM 被吞掉时，宽限期后 SIGKILL', { skip: process.platform === 'win32' }, async () => {
  const started = Date.now();
  const result = await node("process.on('SIGTERM', () => {}); setInterval(() => {}, 1000)", {
    deadlineMs: 100,
    graceMs: 200
  });
  assert.deepEqual(result, { code: null, signal: 'SIGKILL', timedOut: true });
  assert.ok(Date.now() - started < 5000);
});

test('起不来的命令交出 error，不算超时', async () => {
  const result = await spawnWithDeadline(
    'definitely-not-a-command-aiao',
    [],
    { stdio: 'ignore' },
    {
      deadlineMs: 5000,
      graceMs: 1000
    }
  );
  assert.equal(result.timedOut, false);
  assert.equal(result.error?.code, 'ENOENT');
});
