import assert from 'node:assert/strict';
import { test } from 'node:test';
import { assertionCode, attemptPath, failureCode, liveSettings, readOriginal } from './provider-acceptance.mjs';

const config = {
  AIAO_MEDIA_ACCEPTANCE_GENERATE: '1',
  AIAO_MEDIA_ACCEPTANCE_ORIGIN: 'https://media.aiao.io',
  AIAO_MEDIA_ACCEPTANCE_RELEASE: '92883918-76ac-47de-a424-4bc5af23bee9',
  AIAO_MEDIA_ACCEPTANCE_MANIFEST_SHA256: 'a'.repeat(64),
  AIAO_IMAGE_BASE_URL: 'https://provider.example.test/v1/',
  AIAO_IMAGE_MODEL: 'image-test',
  AIAO_IMAGE_API_KEY: 'private-test-key'
};

test('诊断仅返回固定错误码，供应商 URL、Key 与原始异常不进入输出', () => {
  assert.equal(failureCode(new Error('RESULT_SIZE_MISMATCH')), 'RESULT_SIZE_MISMATCH');
  const timeout = new Error('private-test-key https://private.example.test?token=secret');
  timeout.name = 'TimeoutError';
  assert.equal(failureCode(timeout), 'BROWSER_TIMEOUT');
  assert.equal(failureCode(new Error('expect(locator).toBeVisible private-test-key')), 'BROWSER_ASSERTION');
  assert.equal(failureCode(new Error('private-test-key https://private.example.test')), 'BROWSER_OPERATION_FAILED');
  assert.equal(assertionCode({ matcherResult: { name: 'toBeVisible' } }), 'ELEMENT_VISIBLE');
  assert.equal(assertionCode({ matcherResult: { name: 'private-test-key' } }), 'NONE');
});

test('生成JSON、原图headers和原图body读取各自保留固定错误码，CDP失败不重读', async () => {
  for (const [kind, code] of [
    ['generation-body', 'GENERATION_BODY_READ_FAILED'],
    ['result-headers', 'RESULT_HEADERS_READ_FAILED'],
    ['result-body', 'RESULT_BODY_READ_FAILED']
  ]) {
    let reads = 0;
    await assert.rejects(
      readOriginal(kind, () => {
        reads++;
        throw new Error('private-test-key https://private.example.test?token=secret');
      }),
      error => error.message === code
    );
    assert.equal(reads, 1);
  }
  await assert.rejects(
    readOriginal('generation-body', () => {
      throw new Error(
        'Protocol error (Network.getResponseBody): No resource with given identifier found private-test-key'
      );
    }),
    error => error.message === 'GENERATION_BODY_CDP_UNAVAILABLE'
  );
});

test('真实供应商验收必须显式启用且只接受已决定的正式 origin', () => {
  assert.throws(() => liveSettings({ ...config, AIAO_MEDIA_ACCEPTANCE_GENERATE: undefined }));
  for (const origin of ['http://media.aiao.io', 'https://other.example.test', 'https://media.aiao.io?secret=value'])
    assert.throws(() => liveSettings({ ...config, AIAO_MEDIA_ACCEPTANCE_ORIGIN: origin }));
  assert.throws(() => liveSettings({ ...config, DEBUG: 'pw:api' }));
  assert.throws(() => liveSettings({ ...config, PWDEBUG: '1' }));
  assert.throws(() => liveSettings({ ...config, AIAO_MEDIA_ACCEPTANCE_RELEASE: undefined }));
  assert.throws(() => liveSettings({ ...config, AIAO_MEDIA_ACCEPTANCE_RELEASE: '../release' }));
  assert.throws(() => liveSettings({ ...config, AIAO_MEDIA_ACCEPTANCE_MANIFEST_SHA256: undefined }));
  assert.throws(() => liveSettings({ ...config, AIAO_MEDIA_ACCEPTANCE_MANIFEST_SHA256: '../manifest' }));
  assert.equal(liveSettings(config).baseUrl, 'https://provider.example.test/v1');
});

test('私有配置在浏览器启动前拒绝 URL 凭据、查询、片段与非法模型', () => {
  for (const base of [
    'http://provider.example.test',
    'https://key@provider.example.test',
    'https://provider.example.test?key=x',
    'https://provider.example.test#key'
  ])
    assert.throws(() => liveSettings({ ...config, AIAO_IMAGE_BASE_URL: base }));
  assert.throws(() => liveSettings({ ...config, AIAO_IMAGE_MODEL: '../image' }));
  assert.throws(() => liveSettings({ ...config, AIAO_IMAGE_API_KEY: undefined }));
});

test('尝试身份包含已部署版本、origin、规范化 provider、模型、通道和画幅，轮换 Key 不能绕过锁定', () => {
  const settings = liveSettings(config);
  const path = attemptPath('/tmp/acceptance', settings, 'direct', 'square');
  assert.match(path, /^\/tmp\/acceptance\/[a-f0-9]{64}\.json$/);
  assert.equal(path, attemptPath('/tmp/acceptance', { ...settings, key: 'rotated-private-key' }, 'direct', 'square'));
  assert.notEqual(path, attemptPath('/tmp/acceptance', settings, 'proxy', 'square'));
  assert.notEqual(path, attemptPath('/tmp/acceptance', settings, 'direct', 'portrait'));
  assert.notEqual(
    path,
    attemptPath('/tmp/acceptance', { ...settings, manifestSha256: 'b'.repeat(64) }, 'direct', 'square')
  );
  assert.notEqual(
    path,
    attemptPath('/tmp/acceptance', { ...settings, release: '92883918-76ac-47de-a424-4bc5af23bee0' }, 'direct', 'square')
  );
});
