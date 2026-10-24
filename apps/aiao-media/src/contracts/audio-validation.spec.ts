import { describe, expect, it } from 'vitest';
import {
  validateAudioGenerationJobSummary,
  validateAudioGenerationOptions,
  validateAudioJobRequest,
  validateAudioResultMetadata,
  validateGenerationJobSummary,
  validateImageJobRequest
} from './generation-validation';
const request = {
  kind: 'audio' as const,
  operation: 'text-to-speech' as const,
  providerInstanceId: '10000000-0000-4000-8000-000000000001',
  providerRevision: 3,
  modelId: 'speech-2.8-hd',
  voiceId: 'male-qn-qingse',
  profileId: 'fixed-test-v1',
  prompt: ' 测试配音 '
};
const metadata = {
  mediaType: 'audio/wav',
  format: 'wav',
  durationMs: 1000,
  sampleRate: 32000,
  channels: 1,
  bytes: 64044
};
const summary = {
  id: '10000000-0000-4000-8000-000000000002',
  request,
  status: 'completed',
  createdAt: '2026-10-02T00:00:00Z',
  updatedAt: '2026-10-02T00:00:00Z',
  delivery: {
    status: 'available',
    expiresAt: '2026-10-03T00:00:00Z',
    acknowledgedAt: null
  },
  failure: null,
  result: metadata
};
const option = {
  providerInstanceId: request.providerInstanceId,
  providerRevision: 3,
  providerName: '隔离 fixture',
  providerType: 'minimax',
  modelId: request.modelId,
  operation: request.operation,
  voiceId: request.voiceId,
  voiceLabel: '固定声音',
  profileId: request.profileId,
  maxTextLength: 500,
  format: 'wav',
  sampleRate: 32000,
  channels: 1
};
describe('bounded speech-only public contracts', () => {
  it('creates an owned canonical request and trims only after checking the original bound', () => {
    const result = validateAudioJobRequest(request);
    expect(result.prompt).toBe('测试配音');
    expect(result).not.toBe(request);
    expect(validateAudioJobRequest({ ...request, prompt: '字'.repeat(500) }).prompt.length).toBe(500);
    expect(() => validateAudioJobRequest({ ...request, prompt: ' '.repeat(501) + '字' })).toThrow();
  });
  it.each([
    null,
    [],
    { ...request, kind: 'image' },
    { ...request, operation: 'music' },
    { ...request, operation: 'voice-clone' },
    { ...request, prompt: '' },
    { ...request, prompt: '字'.repeat(501) },
    { ...request, providerRevision: 0 },
    { ...request, providerRevision: 2 ** 31 },
    { ...request, providerInstanceId: '../file' },
    { ...request, voiceId: 'https://secret.test' },
    { ...request, speed: 1 },
    { ...request, audioUrl: 'https://secret.test' },
    { ...request, referenceImageId: request.providerInstanceId },
    { ...request, profileId: 'unsafe/profile' }
  ])('rejects unsupported kind/subtype/tuning/URL and malformed selection %#', value =>
    expect(() => validateAudioJobRequest(value)).toThrow()
  );
  it('keeps image consumers from confirming audio receipts', () => {
    expect(() => validateImageJobRequest(request)).toThrow();
    expect(() => validateGenerationJobSummary(summary)).toThrow();
  });
  it('checks exact canonical PCM duration and immutable metadata', () => {
    expect(validateAudioResultMetadata(metadata)).toEqual(metadata);
    expect(
      validateAudioResultMetadata({
        ...metadata,
        bytes: 46,
        durationMs: 1 / 32
      }).durationMs
    ).toBe(1 / 32);
  });
  it.each([
    { format: 'mp3' },
    { mediaType: 'audio/mp3' },
    { durationMs: NaN },
    { durationMs: 0 },
    { durationMs: 120001 },
    { durationMs: 1001 },
    { bytes: 64043 },
    { bytes: 45 },
    { bytes: 9 * 1024 * 1024 },
    { sampleRate: 44100 },
    { channels: 2 },
    { url: 'https://secret.test' }
  ])('rejects unbounded/inconsistent output metadata %#', patch =>
    expect(() => validateAudioResultMetadata({ ...metadata, ...patch })).toThrow()
  );
  it('accepts bounded distinct catalog entries, without inferring capability from the model', () => {
    expect(validateAudioGenerationOptions([option])).toEqual([option]);
    expect(validateAudioGenerationOptions([])).toEqual([]);
  });
  it.each([
    { value: [option, option] },
    { value: [{ ...option, maxTextLength: 501 }] },
    { value: [{ ...option, voiceLabel: '\nsecret' }] },
    { value: [{ ...option, providerType: 'openai' }] },
    { value: [{ ...option, credentials: 'secret' }] }
  ])('rejects ambiguous/unbounded catalog %#', ({ value }) =>
    expect(() => validateAudioGenerationOptions(value)).toThrow()
  );
  it('requires actual metadata only on completed audio and excludes playback URLs', () => {
    expect(validateAudioGenerationJobSummary(summary).result).toEqual(metadata);
    expect(
      validateAudioGenerationJobSummary({
        ...summary,
        status: 'queued',
        result: null,
        delivery: { status: 'pending', expiresAt: null, acknowledgedAt: null }
      }).result
    ).toBeNull();
    for (const value of [
      { ...summary, result: null },
      { ...summary, status: 'processing' },
      { ...summary, url: 'https://secret.test' },
      { ...summary, result: { ...metadata, bytes: 6 } }
    ])
      expect(() => validateAudioGenerationJobSummary(value)).toThrow();
  });
});
