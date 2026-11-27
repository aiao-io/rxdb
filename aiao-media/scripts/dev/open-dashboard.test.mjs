import assert from 'node:assert/strict';
import { mock, test } from 'node:test';
import { dashboardUrl, openDashboard } from './open-dashboard.mjs';

test('the development entry opens the dashboard once with the system browser', async () => {
  const launch = mock.fn(() => Promise.resolve());
  await openDashboard({ platform: 'darwin', launch });
  assert.deepEqual(launch.mock.calls[0].arguments, ['open', [dashboardUrl]]);
  assert.equal(launch.mock.callCount(), 1);
});

test('automatic opening can be disabled for headless environments', async () => {
  const launch = mock.fn();
  await openDashboard({ enabled: false, launch });
  assert.equal(launch.mock.callCount(), 0);
});

test('browser failures are reported without trying another browser', async () => {
  const launch = mock.fn(async () => {
    throw new Error('browser unavailable');
  });
  await assert.rejects(openDashboard({ platform: 'linux', launch }), /browser unavailable/);
  assert.deepEqual(launch.mock.calls[0].arguments, ['xdg-open', [dashboardUrl]]);
  assert.equal(launch.mock.callCount(), 1);
});
