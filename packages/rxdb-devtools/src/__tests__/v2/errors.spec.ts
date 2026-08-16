import { describe, expect, it } from 'vitest';

import {
  createDevToolsError,
  DEVTOOLS_CONTROL_PLANE_ERROR_CODES,
  DEVTOOLS_MAX_ERROR_MESSAGE_LENGTH,
  DEVTOOLS_PROVIDER_ERROR_CODES,
  isControlPlaneErrorCode,
  isDevToolsErrorPayload,
  isProviderErrorCode,
  isRedactedErrorMessage
} from '../../v2/errors.js';

describe('v2 error unions', () => {
  it('MUST freeze the control-plane union at exactly the 12 codes US-904 阶段 B lists', () => {
    expect([...DEVTOOLS_CONTROL_PLANE_ERROR_CODES]).toEqual([
      'protocol_unsupported',
      'invalid_message',
      'invalid_identifier',
      'session_invalid',
      'session_closed',
      'session_budget_exhausted',
      'request_limit_exceeded',
      'transfer_limit_exceeded',
      'request_timeout',
      'transfer_timeout',
      'request_duplicate',
      'transfer_duplicate'
    ]);
  });

  it('MUST freeze the provider union at exactly the 18 codes US-904 阶段 B lists', () => {
    expect([...DEVTOOLS_PROVIDER_ERROR_CODES]).toEqual([
      'provider_unsupported',
      'provider_unavailable',
      'invalid_path',
      'resource_not_found',
      'resource_conflict',
      'permission_denied',
      'storage_quota_exceeded',
      'payload_too_large',
      'payload_encoding_invalid',
      'transfer_sequence_invalid',
      'transfer_size_exceeded',
      'transfer_incomplete',
      'transfer_closed',
      'snapshot_expired',
      'snapshot_busy',
      'snapshot_too_large',
      'export_unsupported',
      'operation_failed'
    ]);
  });

  it('MUST keep the two unions disjoint', () => {
    // 重叠会让「这是控制面问题还是 provider 问题」失去判据，进而让 transfer_timeout
    // 这类归属明确的错误在两条处理路径上产生不同的清理行为。
    const control = new Set<string>(DEVTOOLS_CONTROL_PLANE_ERROR_CODES);
    const overlap = DEVTOOLS_PROVIDER_ERROR_CODES.filter(code => control.has(code));

    expect(overlap).toEqual([]);
  });

  it('MUST classify transfer_timeout as control-plane, not provider', () => {
    expect(isControlPlaneErrorCode('transfer_timeout')).toBe(true);
    expect(isProviderErrorCode('transfer_timeout')).toBe(false);
  });

  it('MUST contain no duplicates within either union', () => {
    expect(new Set(DEVTOOLS_CONTROL_PLANE_ERROR_CODES).size).toBe(DEVTOOLS_CONTROL_PLANE_ERROR_CODES.length);
    expect(new Set(DEVTOOLS_PROVIDER_ERROR_CODES).size).toBe(DEVTOOLS_PROVIDER_ERROR_CODES.length);
  });

  it('MUST reject unknown codes from both guards', () => {
    expect(isControlPlaneErrorCode('nope')).toBe(false);
    expect(isProviderErrorCode('nope')).toBe(false);
    expect(isControlPlaneErrorCode(undefined)).toBe(false);
    expect(isProviderErrorCode(42)).toBe(false);
  });
});

describe('isRedactedErrorMessage', () => {
  it('MUST accept short, single-line, path-free text', () => {
    expect(isRedactedErrorMessage('file not found')).toBe(true);
    expect(isRedactedErrorMessage('quota exceeded')).toBe(true);
  });

  it('MUST reject multi-line text, which is how stacks leak', () => {
    expect(isRedactedErrorMessage('boom\n    at Object.<anonymous> (/app/src/x.ts:1:1)')).toBe(false);
    expect(isRedactedErrorMessage('boom\r')).toBe(false);
  });

  it('MUST reject absolute POSIX and Windows paths', () => {
    expect(isRedactedErrorMessage('cannot read /Users/jimmy/db.sqlite')).toBe(false);
    expect(isRedactedErrorMessage('cannot read C:\\Users\\jimmy\\db.sqlite')).toBe(false);
    expect(isRedactedErrorMessage('cannot read \\\\server\\share')).toBe(false);
  });

  it('MUST reject over-long text', () => {
    expect(isRedactedErrorMessage('a'.repeat(DEVTOOLS_MAX_ERROR_MESSAGE_LENGTH))).toBe(true);
    expect(isRedactedErrorMessage('a'.repeat(DEVTOOLS_MAX_ERROR_MESSAGE_LENGTH + 1))).toBe(false);
  });

  it('MUST reject empty and non-string values', () => {
    expect(isRedactedErrorMessage('')).toBe(false);
    expect(isRedactedErrorMessage('   ')).toBe(false);
    expect(isRedactedErrorMessage(undefined)).toBe(false);
  });
});

describe('createDevToolsError', () => {
  it('MUST default to a non-retryable error with no message', () => {
    expect(createDevToolsError('invalid_message')).toEqual({ code: 'invalid_message', retryable: false });
  });

  it('MUST carry retryable and a redacted message when supplied', () => {
    expect(createDevToolsError('snapshot_busy', { retryable: true, message: 'storage is busy' })).toEqual({
      code: 'snapshot_busy',
      retryable: true,
      message: 'storage is busy'
    });
  });

  it('MUST refuse to emit a message that fails redaction', () => {
    expect(() => createDevToolsError('operation_failed', { message: 'ENOENT /Users/jimmy/x' })).toThrow(/redact/iu);
  });
});

describe('isDevToolsErrorPayload', () => {
  it('MUST accept exact-key payloads from either union', () => {
    expect(isDevToolsErrorPayload({ code: 'session_closed', retryable: false })).toBe(true);
    expect(isDevToolsErrorPayload({ code: 'operation_failed', retryable: true, message: 'failed' })).toBe(true);
  });

  it('MUST reject unknown codes, extra keys and wrong types', () => {
    expect(isDevToolsErrorPayload({ code: 'made_up', retryable: false })).toBe(false);
    expect(isDevToolsErrorPayload({ code: 'session_closed' })).toBe(false);
    expect(isDevToolsErrorPayload({ code: 'session_closed', retryable: 'no' })).toBe(false);
    expect(isDevToolsErrorPayload({ code: 'session_closed', retryable: false, detail: 'x' })).toBe(false);
    expect(isDevToolsErrorPayload({ code: 'session_closed', retryable: false, message: 'a\nb' })).toBe(false);
    expect(isDevToolsErrorPayload(null)).toBe(false);
  });
});
