import assert from 'node:assert/strict';
import { test } from 'node:test';

import { POSTINSTALL_NX_ENV, buildNeedLibs } from './check-workspace.mjs';

test('首次构建成功时不 reset', async () => {
  const calls = [];
  await buildNeedLibs({
    projects: ['rxdb-test'],
    runCommand: async (command, args, options) => {
      calls.push({ command, args, options });
    }
  });

  assert.equal(calls.length, 1);
  assert.equal(calls[0].command, 'pnpm');
  assert.equal(calls[0].args[0], 'nx run-many --target=build --projects=rxdb-test --no-cloud');
  assert.deepEqual(calls[0].options.env, POSTINSTALL_NX_ENV);
});

test('构建失败时 reset 后再试一次', async () => {
  const calls = [];
  await buildNeedLibs({
    projects: ['rxdb-test'],
    runCommand: async (command, args, options) => {
      calls.push({ command, args, options });
      if (calls.length === 1) throw new Error('Failed to process project graph');
    }
  });

  assert.equal(calls.length, 3);
  assert.equal(calls[1].args[0], 'nx reset');
  assert.deepEqual(calls[2].options.env, POSTINSTALL_NX_ENV);
});

test('重试仍失败则抛出第二次错误', async () => {
  let attempts = 0;
  await assert.rejects(
    () =>
      buildNeedLibs({
        projects: ['rxdb-test'],
        runCommand: async (_command, args) => {
          if (args[0] === 'nx reset') return;
          attempts += 1;
          throw new Error(attempts === 1 ? 'first' : 'still broken');
        }
      }),
    /still broken/
  );
  assert.equal(attempts, 2);
});

test('空项目列表不跑 nx', async () => {
  let called = false;
  await buildNeedLibs({
    projects: [],
    runCommand: async () => {
      called = true;
    }
  });
  assert.equal(called, false);
});
