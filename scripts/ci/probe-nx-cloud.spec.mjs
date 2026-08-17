import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';

import {
    DEFAULT_API_URL,
    PING_PATH,
    classifyPing,
    printProbe,
    probeNxCloud,
    readNxCloudId,
    runCli
} from './probe-nx-cloud.mjs';

const cliPath = fileURLToPath(new URL('./probe-nx-cloud.mjs', import.meta.url));

const runCliProcess = (...args) => spawnSync(process.execPath, [cliPath, ...args], { encoding: 'utf8' });

const FREE_PLAN_BODY =
  'This Nx Cloud organization has been disabled due to exceeding the FREE plan. ' +
  'Your organization can be re-enabled immediately by an organization admin ' +
  'upgrading to the Team plan at https://cloud.nx.app/orgs/69588e80b22d04e5ce988ce4/plans.';

const response = (status, body = '') => ({
  status,
  ok: status >= 200 && status < 300,
  text: async () => body
});

const collect = () => {
  let text = '';
  return {
    write: chunk => {
      text += chunk;
    },
    toString: () => text
  };
};

const mockFetch =
  (impl, calls = []) =>
  async (url, init) => {
    calls.push({ url, init });
    return impl(url, init);
  };

test('2xx 视为可用，NX_NO_CLOUD=false', async () => {
  const calls = [];
  const result = await probeNxCloud({
    nxCloudId: 'workspace-id',
    fetchImpl: mockFetch(() => response(200, ''), calls)
  });

  assert.deepEqual(result, { available: true, reason: 'HTTP 200', nxNoCloud: false });
  assert.equal(calls.length, 1);
  assert.equal(calls[0].url, `${DEFAULT_API_URL}${PING_PATH}`);
  assert.equal(calls[0].init.method, 'GET');
  assert.equal(calls[0].init.headers['Nx-Cloud-Id'], 'workspace-id');
  assert.ok(calls[0].init.signal instanceof AbortSignal);
});

test('401 FREE plan 正文视为不可用', async () => {
  const result = await probeNxCloud({
    nxCloudId: 'workspace-id',
    fetchImpl: () => response(401, FREE_PLAN_BODY)
  });

  assert.equal(result.available, false);
  assert.equal(result.nxNoCloud, true);
  assert.match(result.reason, /FREE plan/);
});

test('401 无凭据视为不可用', async () => {
  const result = await probeNxCloud({
    nxCloudId: 'workspace-id',
    fetchImpl: () => response(401, 'No credentials were provided.')
  });

  assert.deepEqual(result, { available: false, reason: 'no credentials', nxNoCloud: true });
});

test('401 无效 workspace id 视为不可用', async () => {
  const result = await probeNxCloud({
    nxCloudId: 'deadbeef',
    fetchImpl: () =>
      response(401, 'Invalid Credentials (Nx Cloud ID) A workspace could not be found with the provided Nx Cloud ID.')
  });

  assert.deepEqual(result, { available: false, reason: 'invalid nxCloudId', nxNoCloud: true });
});

test('403 带 organization has been disabled 同样关云', async () => {
  const result = classifyPing({
    status: 403,
    body: 'This Nx Cloud organization has been disabled due to billing.'
  });

  assert.equal(result.available, false);
  assert.equal(result.nxNoCloud, true);
  assert.match(result.reason, /disabled/);
});

test('超时 AbortError / TimeoutError 一律 fail-closed', async () => {
  for (const name of ['AbortError', 'TimeoutError']) {
    const error = new Error('aborted');
    error.name = name;
    const result = await probeNxCloud({
      nxCloudId: 'workspace-id',
      timeoutMs: 8000,
      fetchImpl: async () => {
        throw error;
      }
    });

    assert.equal(result.available, false);
    assert.equal(result.nxNoCloud, true);
    assert.equal(result.reason, 'timeout after 8000ms');
  }
});

test('5xx fail-closed', async () => {
  const result = await probeNxCloud({
    nxCloudId: 'workspace-id',
    fetchImpl: () => response(503, 'upstream exploded')
  });

  assert.deepEqual(result, { available: false, reason: 'HTTP 503', nxNoCloud: true });
});

test('网络异常 fail-closed，不把异常抛出 CI', async () => {
  const result = await probeNxCloud({
    nxCloudId: 'workspace-id',
    fetchImpl: async () => {
      throw new Error('fetch failed');
    }
  });

  assert.equal(result.available, false);
  assert.equal(result.nxNoCloud, true);
  assert.equal(result.reason, 'network: fetch failed');
});

test('缺 nxCloudId 不发请求', async () => {
  let called = false;
  const result = await probeNxCloud({
    fetchImpl: async () => {
      called = true;
      return response(200);
    }
  });

  assert.equal(called, false);
  assert.deepEqual(result, { available: false, reason: 'missing nxCloudId', nxNoCloud: true });
});

test('自定义 apiUrl 去掉尾斜杠再拼 ping', async () => {
  const calls = [];
  await probeNxCloud({
    nxCloudId: 'workspace-id',
    apiUrl: 'https://cloud.example.test/',
    fetchImpl: mockFetch(() => response(204), calls)
  });

  assert.equal(calls[0].url, 'https://cloud.example.test/nx-cloud/ping');
});

test('意外 4xx 也 fail-closed，不当成可用', () => {
  assert.deepEqual(classifyPing({ status: 418, body: 'teapot' }), {
    available: false,
    reason: 'HTTP 418',
    nxNoCloud: true
  });
});

test('readNxCloudId 只接受非空字符串', () => {
  assert.equal(readNxCloudId('{"nxCloudId":"6a7b30a94caecff9b5bf52d6"}'), '6a7b30a94caecff9b5bf52d6');
  assert.equal(readNxCloudId('{"nxCloudId":"  abc  "}'), 'abc');
  assert.equal(readNxCloudId('{"nxCloudId":""}'), undefined);
  assert.equal(readNxCloudId('{"nxCloudId":"   "}'), undefined);
  assert.equal(readNxCloudId('{}'), undefined);
});

test('printProbe：可用写 false，不可用写 true', () => {
  const okOut = collect();
  const okErr = collect();
  printProbe({ available: true, reason: 'HTTP 200', nxNoCloud: false }, okOut, okErr);
  assert.equal(okOut.toString(), 'false\n');
  assert.match(okErr.toString(), /available — HTTP 200/);

  const offOut = collect();
  const offErr = collect();
  printProbe({ available: false, reason: 'missing nxCloudId', nxNoCloud: true }, offOut, offErr);
  assert.equal(offOut.toString(), 'true\n');
  assert.match(offErr.toString(), /unavailable — missing nxCloudId/);
});

test('runCli：--nx-cloud-id 覆盖 nx.json，stdout 只写 NX_NO_CLOUD', async () => {
  const stdout = collect();
  const stderr = collect();
  let seen;

  await runCli(['--nx-cloud-id=from-flag', '--api-url=https://cloud.example.test'], {
    stdout,
    stderr,
    readNxJson: () => '{"nxCloudId":"from-file"}',
    probe: async options => {
      seen = options;
      return { available: true, reason: 'HTTP 200', nxNoCloud: false };
    }
  });

  assert.equal(seen.nxCloudId, 'from-flag');
  assert.equal(seen.apiUrl, 'https://cloud.example.test');
  assert.equal(stdout.toString(), 'false\n');
  assert.match(stderr.toString(), /Nx Cloud: available/);
});

test('CLI：不可达 apiUrl fail-closed，stdout 为 true', () => {
  const result = runCliProcess('--nx-cloud-id=abc', '--api-url=http://127.0.0.1:9');

  assert.equal(result.status, 0);
  assert.equal(result.stdout, 'true\n');
  assert.match(result.stderr, /unavailable/);
});
