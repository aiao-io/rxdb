import assert from 'node:assert/strict';
import { test } from 'node:test';

import { run } from './runner.mjs';

test('零退出码时 resolve', async () => {
  await assert.doesNotReject(() => run(process.execPath, ['-e "process.exit(0)"']));
});

test('非零退出码时 reject Error', async () => {
  await assert.rejects(
    () => run(process.execPath, ['-e "process.exit(2)"']),
    error => {
      assert.ok(error instanceof Error);
      assert.match(error.message, /failed with exit code 2/);
      return true;
    }
  );
});
