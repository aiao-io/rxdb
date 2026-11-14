import assert from 'node:assert/strict';
import { mock, test } from 'node:test';
import { openDashboard } from './open-dashboard.mjs';
import { dashboardUrl } from './services.mjs';

test('用系统浏览器打开一次开发导航', async () => {
  const launch = mock.fn(() => Promise.resolve());
  await openDashboard({ platform: 'darwin', launch });
  assert.deepEqual(launch.mock.calls[0].arguments, ['open', [dashboardUrl]]);
  assert.equal(launch.mock.callCount(), 1);
});

test('无界面环境可以关掉自动打开', async () => {
  const launch = mock.fn();
  await openDashboard({ enabled: false, launch });
  assert.equal(launch.mock.callCount(), 0);
});

test('打不开浏览器时报错，不换别的方式重试', async () => {
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
