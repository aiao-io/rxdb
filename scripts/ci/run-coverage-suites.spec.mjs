import assert from 'node:assert/strict';
import { test } from 'node:test';
import { setImmediate } from 'node:timers/promises';
import { runCoverageSuites } from '../../packages/rxdb-adapter-sqlite-core/scripts/run-coverage-suites.mjs';

test('最多同时跑两段，空位立即补齐，失败结果不漏掉剩余 suite', async () => {
  const suiteNames = ['core', 'wa-sqlite', 'sqlite', 'sqlite-wasm', 'sqliteai'];
  const releases = new Map(suiteNames.map(name => [name, Promise.withResolvers()]));
  const started = [];
  let active = 0;
  let peak = 0;

  const pending = runCoverageSuites(suiteNames, async suiteName => {
    started.push(suiteName);
    active++;
    peak = Math.max(peak, active);
    await releases.get(suiteName).promise;
    active--;
    return { suiteName, code: suiteName === 'wa-sqlite' ? 1 : 0 };
  });

  assert.deepEqual(started, ['core', 'wa-sqlite']);
  releases.get('wa-sqlite').resolve();
  await setImmediate();
  assert.deepEqual(started, ['core', 'wa-sqlite', 'sqlite']);
  releases.get('sqlite').resolve();
  await setImmediate();
  assert.deepEqual(started, ['core', 'wa-sqlite', 'sqlite', 'sqlite-wasm']);
  releases.get('core').resolve();
  await setImmediate();
  assert.deepEqual(started, suiteNames);
  releases.get('sqliteai').resolve();
  releases.get('sqlite-wasm').resolve();

  assert.deepEqual(
    await pending,
    suiteNames.map(suiteName => ({ suiteName, code: suiteName === 'wa-sqlite' ? 1 : 0 }))
  );
  assert.equal(peak, 2);
  assert.equal(active, 0);
});

test('空项目列表不启动进程', async () => {
  assert.deepEqual(await runCoverageSuites([], () => assert.fail('不应启动 suite')), []);
});
