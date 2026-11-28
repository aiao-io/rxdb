import assert from 'node:assert/strict';
import { mock, test } from 'node:test';
import { dashboardUrl } from './endpoints.mjs';
import { openDashboard } from './open-dashboard.mjs';

test('就绪后用系统浏览器打开测试起始页一次', async () => {
  const launch = mock.fn(() => Promise.resolve());
  await openDashboard({ platform: 'darwin', launch });
  assert.deepEqual(launch.mock.calls[0].arguments, ['open', [dashboardUrl]]);
  assert.equal(launch.mock.callCount(), 1);
});

test('Windows 经 rundll32 的 url.dll 打开', async () => {
  const launch = mock.fn(() => Promise.resolve());
  await openDashboard({ platform: 'win32', launch });
  assert.deepEqual(launch.mock.calls[0].arguments, ['rundll32', ['url.dll,FileProtocolHandler', dashboardUrl]]);
});

test('无头环境可以关掉自动打开', async () => {
  const launch = mock.fn();
  await openDashboard({ enabled: false, launch });
  assert.equal(launch.mock.callCount(), 0);
});

test('打开失败原样报出，不再换别的浏览器重试', async () => {
  const launch = mock.fn(async () => {
    throw new Error('browser unavailable');
  });
  await assert.rejects(openDashboard({ platform: 'linux', launch }), /browser unavailable/);
  assert.deepEqual(launch.mock.calls[0].arguments, ['xdg-open', [dashboardUrl]]);
  assert.equal(launch.mock.callCount(), 1);
});

test('不认识的系统明确报错', async () => {
  await assert.rejects(openDashboard({ platform: 'aix', launch: mock.fn() }), /aix/);
});
