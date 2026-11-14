import assert from 'node:assert/strict';
import test from 'node:test';

import { prepareOfflineFailure } from './standin.mjs';

/** 记下被调用的方法的假页面：只实现 `prepareOfflineFailure` 用到的 `clock` 与 `locator`。 */
function fakePage() {
  const calls = [];
  return {
    calls,
    clock: {
      install: async () => calls.push('install'),
      fastForward: async milliseconds => calls.push(`fastForward ${milliseconds}`)
    },
    locator: selector => ({ waitFor: async options => calls.push(`waitFor ${selector} ${options.state}`) })
  };
}

test('Chromium 的离线失败不动时钟：被拦截的 iframe 导航会触发 load，Orbit 3 秒后以 LOAD_ERROR 失败', async () => {
  const page = fakePage();
  const offline = await prepareOfflineFailure({ page, engine: 'chromium' });
  await offline.trigger();
  assert.deepEqual(page.calls, []);
  assert.equal(offline.reason, 'vscode.aiao.io didn’t connect');
});

for (const engine of ['firefox', 'webkit']) {
  test(`${engine} 不触发 iframe 的 load：假时钟在打开窗口之前装上，Orbit 实例出现后快进过就绪时限`, async () => {
    const page = fakePage();
    const offline = await prepareOfflineFailure({ page, engine });
    assert.deepEqual(page.calls, ['install']);
    await offline.trigger();
    assert.deepEqual(page.calls, [
      'install',
      'waitFor .win[data-app="vscode"] aiao-orbit attached',
      'fastForward 61000'
    ]);
    assert.equal(offline.reason, 'didn’t finish starting within 60 seconds');
  });
}

test('同一个页面只装一次假时钟（重复装会报错）', async () => {
  const page = fakePage();
  await prepareOfflineFailure({ page, engine: 'firefox' });
  await prepareOfflineFailure({ page, engine: 'firefox' });
  assert.deepEqual(
    page.calls.filter(call => call === 'install'),
    ['install']
  );
});
