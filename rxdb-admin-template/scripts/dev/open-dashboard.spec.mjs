import assert from 'node:assert/strict';
import { describe, it, mock } from 'node:test';
import { openDashboard } from './open-dashboard.mjs';
import { dashboardUrl } from './services.mjs';

describe('自动打开开发导航', () => {
  it('用系统浏览器打开一次', async () => {
    const launch = mock.fn(async () => undefined);
    await openDashboard({ platform: 'darwin', launch });
    assert.equal(launch.mock.callCount(), 1);
    assert.deepEqual(launch.mock.calls[0].arguments, ['open', [dashboardUrl]]);
  });

  it('AIAO_DEV_OPEN=false 时不打开', async () => {
    const launch = mock.fn();
    await openDashboard({ enabled: false, launch });
    assert.equal(launch.mock.callCount(), 0);
  });

  it('打不开时报错，不换别的方式重试', async () => {
    const launch = mock.fn(async () => {
      throw new Error('browser unavailable');
    });
    await assert.rejects(openDashboard({ platform: 'linux', launch }), /browser unavailable/);
    assert.deepEqual(launch.mock.calls[0].arguments, ['xdg-open', [dashboardUrl]]);
    assert.equal(launch.mock.callCount(), 1);
  });

  it('不认识的系统明确报错', async () => {
    await assert.rejects(openDashboard({ platform: 'aix', launch: mock.fn() }), /aix/);
  });
});
