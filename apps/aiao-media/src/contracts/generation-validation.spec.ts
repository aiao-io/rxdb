import { describe, expect, it } from 'vitest';
import {
  validateGenerationJobSummary,
  validateImageGenerationOptions,
  validateImageJobRequest,
  validateReferenceImageUpload
} from './generation-validation';
const id = '10000000-0000-4000-8000-000000000001';
const request = {
  kind: 'image',
  operation: 'text-to-image',
  providerInstanceId: id,
  providerRevision: 1,
  modelId: 'offline-fixture',
  prompt: '本机描述'
};
const reference = {
  id,
  mediaType: 'image/png',
  bytes: 128,
  width: 1,
  height: 1,
  expiresAt: '2026-10-01T12:30:00.000Z'
};
const option = {
  providerInstanceId: id,
  providerRevision: 1,
  providerName: 'Isolated protocol fixture',
  providerType: 'openai',
  modelId: 'offline-fixture',
  operations: [
    {
      operation: 'reference-image',
      label: '编辑测试',
      referenceSemantics: 'edit'
    }
  ]
};
const summary = {
  id,
  request,
  status: 'queued',
  createdAt: '2026-10-01T12:00:00Z',
  updatedAt: '2026-10-01T12:00:00Z',
  delivery: { status: 'pending', expiresAt: null, acknowledgedAt: null },
  failure: null
};
describe('creator image protocol validation', () => {
  it('retains the canonical request byte order used by existing idempotency hashes', () => {
    expect(JSON.stringify(validateImageJobRequest({ ...request, prompt: '  本机描述  ' }))).toBe(
      JSON.stringify(request)
    );
    const ref = {
      kind: 'image',
      operation: 'reference-image',
      referenceImageId: id,
      providerInstanceId: id,
      providerRevision: 1,
      modelId: 'offline-fixture',
      prompt: '本机描述'
    };
    expect(JSON.stringify(validateImageJobRequest(ref))).toBe(JSON.stringify(ref));
  });
  it('requires an opaque owner-checked upload ID for reference jobs, never a URL or inline body', () => {
    for (const extra of [
      { referenceImageId: 'https://example.test/img.png' },
      { referenceImageId: id, url: 'https://example.test/img.png' },
      { referenceImageId: id, base64: 'secret' }
    ])
      expect(() =>
        validateImageJobRequest({
          ...request,
          operation: 'reference-image',
          ...extra
        })
      ).toThrow();
    expect(() => validateImageJobRequest({ ...request, operation: 'reference-image' })).toThrow();
    expect(() => validateImageJobRequest({ ...request, referenceImageId: id })).toThrow();
  });
  it('bounds instance revision, model ID, prompt and supported operations', () => {
    for (const change of [
      { providerRevision: 0 },
      { providerRevision: 2 ** 31 },
      { modelId: '../../private' },
      { prompt: '' },
      { prompt: 'x'.repeat(4001) },
      { operation: 'edit-url' },
      { providerInstanceId: 'foreign' }
    ])
      expect(() => validateImageJobRequest({ ...request, ...change })).toThrow();
  });
  it('accepts only bounded reference metadata without private paths or digests', () => {
    expect(validateReferenceImageUpload(reference)).toEqual(reference);
    for (const change of [
      { bytes: 4 * 1024 * 1024 + 1 },
      { width: 2049 },
      { height: 0 },
      { mediaType: 'image/jpeg' },
      { expiresAt: 'soon' },
      { fileKey: '/private.png' },
      { digest: 'secret' }
    ])
      expect(() => validateReferenceImageUpload({ ...reference, ...change })).toThrow();
  });
  it('requires explicit reference semantics instead of flattening edit/style/subject', () => {
    expect(validateImageGenerationOptions([option])).toEqual([option]);
    expect(() =>
      validateImageGenerationOptions([
        {
          ...option,
          operations: [{ operation: 'reference-image', label: 'Generic reference' }]
        }
      ])
    ).toThrow();
    expect(() =>
      validateImageGenerationOptions([
        {
          ...option,
          operations: [
            {
              operation: 'reference-image',
              label: 'Generic reference',
              referenceSemantics: 'arbitrary'
            }
          ]
        }
      ])
    ).toThrow();
  });
  it('rejects duplicate catalog selections, credentials, unsupported providers and empty operations', () => {
    expect(validateImageGenerationOptions([])).toEqual([]);
    for (const options of [
      [option, option],
      [{ ...option, apiKey: 'secret' }],
      [{ ...option, providerType: 'unknown' }],
      [{ ...option, operations: [] }]
    ])
      expect(() => validateImageGenerationOptions(options)).toThrow();
  });
  it('validates job metadata without accepting extra private result fields', () => {
    expect(validateGenerationJobSummary(summary)).toEqual(summary);
    for (const change of [
      { resultUrl: 'https://upstream.test' },
      { status: 'success' },
      { failure: { category: 'made_up', retryable: true } },
      { delivery: { ...summary.delivery, fileKey: '/private.png' } }
    ])
      expect(() => validateGenerationJobSummary({ ...summary, ...change })).toThrow();
  });
  it('accepts reference failures and sanitized correlation IDs only', () => {
    expect(
      validateGenerationJobSummary({
        ...summary,
        status: 'failed',
        failure: { category: 'reference_unavailable', retryable: false }
      }).failure?.category
    ).toBe('reference_unavailable');
    expect(() =>
      validateGenerationJobSummary({
        ...summary,
        providerRequestId: 'Bearer secret'
      })
    ).toThrow();
  });
});
