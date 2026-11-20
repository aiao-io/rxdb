import { createHash } from 'node:crypto';
import { resolve } from 'node:path';

export const multimodalAcceptanceOperations = Object.freeze([
  { id: 'tts', operation: 'text-to-speech', label: 'TTS 配音' },
  { id: 'asr', operation: 'speech-to-text', label: 'ASR 转写' },
  { id: 'music', operation: 'text-to-music', label: '生成音乐' },
  { id: 'video', operation: 'text-to-video', label: '生成视频' }
]);

const uuid = /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i;
const manifest = /^[a-f0-9]{64}$/;
const providerRequestId = /^[a-zA-Z0-9_-]{1,128}$/;
const email = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const sensitiveField = /(?:password|secret|token|authorization|api[_-]?key|provider[_-]?url|base[_-]?url)/i;
const sensitiveValue = /https?:\/\/|Bearer\s|-----BEGIN|sk-[a-zA-Z0-9]/i;

export function requireCheck(condition, code) {
  if (!condition) throw new Error(code);
}

export function safeProviderRequestId(value) {
  return typeof value === 'string' && providerRequestId.test(value) ? value : undefined;
}

export function acceptancePlan() {
  return multimodalAcceptanceOperations.map(operation => ({ ...operation }));
}

export function liveSettings(env) {
  requireCheck(env.AIAO_MEDIA_ACCEPTANCE_GENERATE === '1', 'LIVE_OPT_IN_REQUIRED');
  requireCheck(!env.DEBUG && !env.PWDEBUG, 'BROWSER_DEBUG_LOGGING_MUST_BE_DISABLED');
  requireCheck(env.AIAO_MEDIA_ACCEPTANCE_ORIGIN === 'https://media.aiao.io', 'FORMAL_ORIGIN_REQUIRED');
  requireCheck(uuid.test(env.AIAO_MEDIA_ACCEPTANCE_RELEASE ?? ''), 'DEPLOYED_VERSION_ID_REQUIRED');
  requireCheck(manifest.test(env.AIAO_MEDIA_ACCEPTANCE_MANIFEST_SHA256 ?? ''), 'REVIEWED_MANIFEST_DIGEST_REQUIRED');
  requireCheck(email.test(env.AIAO_MEDIA_ACCEPTANCE_EMAIL ?? ''), 'PLATFORM_LOGIN_REQUIRED');
  requireCheck(
    typeof env.AIAO_MEDIA_ACCEPTANCE_PASSWORD === 'string' && env.AIAO_MEDIA_ACCEPTANCE_PASSWORD.length > 0,
    'PLATFORM_LOGIN_REQUIRED'
  );
  return {
    origin: env.AIAO_MEDIA_ACCEPTANCE_ORIGIN,
    release: env.AIAO_MEDIA_ACCEPTANCE_RELEASE,
    manifestSha256: env.AIAO_MEDIA_ACCEPTANCE_MANIFEST_SHA256,
    email: env.AIAO_MEDIA_ACCEPTANCE_EMAIL,
    password: env.AIAO_MEDIA_ACCEPTANCE_PASSWORD,
    asrFile: env.AIAO_MEDIA_ACCEPTANCE_ASR_FILE ? resolve(env.AIAO_MEDIA_ACCEPTANCE_ASR_FILE) : null,
    fixture: false
  };
}

export function attemptIdentity(settings, operation) {
  return createHash('sha256')
    .update(JSON.stringify([settings.origin, settings.release, settings.manifestSha256, operation.id]))
    .digest('hex');
}

export function attemptPath(directory, settings, operation) {
  return resolve(directory, `${attemptIdentity(settings, operation)}.json`);
}

export function failureCode(error) {
  const value = String(error?.message ?? error ?? 'UNKNOWN_FAILURE');
  const match = value.match(/[A-Z][A-Z0-9_]+/);
  return match?.[0] ?? 'UNKNOWN_FAILURE';
}

export function assertSafeAcceptanceRecord(record, settings = null) {
  requireCheck(record && typeof record === 'object' && !Array.isArray(record), 'INVALID_ACCEPTANCE_RECORD');
  requireCheck(typeof record.operation === 'string', 'INVALID_ACCEPTANCE_RECORD');
  requireCheck(record.phase === 'dispatching' || record.phase === 'verified' || record.phase === 'requires-review', 'INVALID_ACCEPTANCE_RECORD');
  const serialized = JSON.stringify(record);
  for (const value of [settings?.password, settings?.email])
    if (value) requireCheck(!serialized.includes(value), 'ACCEPTANCE_CREDENTIAL_LEAK');
  requireCheck(!sensitiveField.test(serialized), 'ACCEPTANCE_SENSITIVE_FIELD');
  requireCheck(!sensitiveValue.test(serialized), 'ACCEPTANCE_SENSITIVE_VALUE');
  if (typeof record.providerRequestId === 'string')
    requireCheck(providerRequestId.test(record.providerRequestId), 'INVALID_PROVIDER_REQUEST_ID');
  return record;
}

export function validateVerifiedRecord(record, operation) {
  assertSafeAcceptanceRecord(record);
  requireCheck(record.phase === 'verified', 'ACCEPTANCE_NOT_VERIFIED');
  requireCheck(record.operation === operation.operation, 'ACCEPTANCE_OPERATION_MISMATCH');
  requireCheck(uuid.test(record.taskId ?? ''), 'ACCEPTANCE_TASK_ID_MISSING');
  requireCheck(providerRequestId.test(record.providerRequestId ?? ''), 'PROVIDER_REQUEST_ID_MISSING');
  requireCheck(record.manifest && typeof record.manifest === 'object', 'ACCEPTANCE_MANIFEST_MISSING');
  requireCheck(record.credits?.ledgerEntries === 1, 'PLATFORM_CREDIT_MISMATCH');
  requireCheck(record.localSave?.status === 'saved', 'LOCAL_SAVE_MISSING');
  requireCheck(record.download?.status === 'verified' || record.library?.status === 'verified', 'DELIVERY_EVIDENCE_MISSING');
  return record;
}
