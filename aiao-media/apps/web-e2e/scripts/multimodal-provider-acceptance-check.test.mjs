import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  acceptancePlan,
  assertSafeAcceptanceRecord,
  attemptIdentity,
  attemptPath,
  liveSettings,
  safeProviderRequestId,
  validateVerifiedRecord
} from './multimodal-provider-acceptance-check.mjs';
import { runMultimodalProviderAcceptance } from './multimodal-provider-acceptance.mjs';

const config = {
  AIAO_MEDIA_ACCEPTANCE_GENERATE: '1',
  AIAO_MEDIA_ACCEPTANCE_ORIGIN: 'https://media.aiao.io',
  AIAO_MEDIA_ACCEPTANCE_RELEASE: '92883918-76ac-47de-a424-4bc5af23bee9',
  AIAO_MEDIA_ACCEPTANCE_MANIFEST_SHA256: 'a'.repeat(64),
  AIAO_MEDIA_ACCEPTANCE_EMAIL: 'creator@example.test',
  AIAO_MEDIA_ACCEPTANCE_PASSWORD: 'private-test-password'
};

test('正式多模态验收按 TTS、ASR、音乐、视频顺序执行', () => {
  assert.equal(typeof runMultimodalProviderAcceptance, 'function');
  assert.deepEqual(
    acceptancePlan().map(item => item.operation),
    ['text-to-speech', 'speech-to-text', 'text-to-music', 'text-to-video']
  );
});

test('正式验收必须显式启用，且只接受评审 origin、发布和 manifest', () => {
  assert.throws(() => liveSettings({ ...config, AIAO_MEDIA_ACCEPTANCE_GENERATE: undefined }), /LIVE_OPT_IN_REQUIRED/);
  for (const origin of ['http://media.aiao.io', 'https://other.example.test', 'https://media.aiao.io?x=1'])
    assert.throws(() => liveSettings({ ...config, AIAO_MEDIA_ACCEPTANCE_ORIGIN: origin }), /FORMAL_ORIGIN_REQUIRED/);
  assert.throws(
    () => liveSettings({ ...config, AIAO_MEDIA_ACCEPTANCE_RELEASE: '../release' }),
    /DEPLOYED_VERSION_ID_REQUIRED/
  );
  assert.throws(
    () => liveSettings({ ...config, AIAO_MEDIA_ACCEPTANCE_MANIFEST_SHA256: '../manifest' }),
    /REVIEWED_MANIFEST_DIGEST_REQUIRED/
  );
  assert.throws(() => liveSettings({ ...config, DEBUG: 'pw:api' }), /BROWSER_DEBUG_LOGGING_MUST_BE_DISABLED/);
  assert.equal(liveSettings(config).password, config.AIAO_MEDIA_ACCEPTANCE_PASSWORD);
});

test('验收身份只由发布信息和能力组成，不受密码轮换影响', () => {
  const settings = liveSettings(config);
  const operation = acceptancePlan()[0];
  assert.equal(
    attemptIdentity(settings, operation),
    attemptIdentity({ ...settings, password: 'rotated-password', email: 'other@example.test' }, operation)
  );
  assert.notEqual(attemptIdentity(settings, operation), attemptIdentity(settings, acceptancePlan()[1]));
  assert.match(attemptPath('/tmp/multimodal-acceptance', settings, operation), /[a-f0-9]{64}\.json$/);
});

test('供应商回执 ID 只保留清洗后的安全值', () => {
  assert.equal(safeProviderRequestId('request_01-abc'), 'request_01-abc');
  for (const value of ['https://provider.example.test/id', 'contains spaces', 'x'.repeat(129), '', null])
    assert.equal(safeProviderRequestId(value), undefined);
});

test('验收报告不能包含账号、密码、token、URL 或 key 字段', () => {
  const settings = liveSettings(config);
  const record = {
    operation: 'text-to-speech',
    phase: 'verified',
    taskId: '10000000-0000-4000-8000-000000000001',
    providerRequestId: 'provider_request_01',
    manifest: { kind: 'audio', bytes: 100, sha256: 'b'.repeat(64) },
    credits: { before: 20, after: 18, cost: 2, ledgerEntries: 1 },
    localSave: { status: 'saved' },
    download: { status: 'verified' },
    library: { status: 'verified' }
  };
  assertSafeAcceptanceRecord(record, settings);
  assert.throws(
    () => assertSafeAcceptanceRecord({ ...record, token: 'token' }, settings),
    /ACCEPTANCE_SENSITIVE_FIELD/
  );
  assert.throws(
    () => assertSafeAcceptanceRecord({ ...record, providerRequestId: 'https://provider/id' }, settings),
    /ACCEPTANCE_SENSITIVE_VALUE/
  );
  assert.doesNotThrow(() => validateVerifiedRecord(record, acceptancePlan()[0]));
});
