import { describe, expect, it } from 'vitest';
import {
  validateAudioResultMetadata,
  validateMusicGenerationJobSummary,
  validateMusicGenerationOptions,
  validateMusicJobRequest
} from './generation-validation';

const providerInstanceId = '10000000-0000-4000-8000-000000000011';
const request = {
  kind: 'audio' as const,
  operation: 'text-to-music' as const,
  providerInstanceId,
  providerRevision: 2,
  modelId: 'music-fixture',
  prompt: '轻快的合成器旋律',
  parameters: { durationSeconds: 30, instrumental: true }
};
const result = {
  kind: 'audio' as const,
  mediaType: 'audio/wav' as const,
  format: 'wav' as const,
  durationMs: 200_000,
  sampleRate: 32000 as const,
  channels: 1 as const,
  bytes: 12_800_044,
  sha256: 'c'.repeat(64)
};
const option = {
  providerInstanceId,
  providerRevision: 2,
  providerName: '隔离音乐 fixture',
  providerType: 'minimax' as const,
  modelId: 'music-fixture',
  operation: 'text-to-music' as const,
  profileId: 'music-v1',
  maxTextLength: 1000,
  durationsSeconds: [30, 60, 300],
  formats: ['wav'] as ['wav']
};
const summary = {
  id: '10000000-0000-4000-8000-000000000012',
  request,
  status: 'completed' as const,
  createdAt: '2026-10-02T00:00:00Z',
  updatedAt: '2026-10-02T00:00:00Z',
  delivery: { status: 'available' as const, expiresAt: '2026-10-03T00:00:00Z', acknowledgedAt: null },
  failure: null,
  result
};

describe('music contracts', () => {
  it('accepts closed music parameters and normalizes prompt text', () => {
    expect(validateMusicJobRequest({ ...request, prompt: `  ${request.prompt}  ` })).toEqual(request);
    expect(
      validateMusicJobRequest({
        kind: 'audio',
        operation: 'text-to-music',
        providerInstanceId,
        providerRevision: 2,
        modelId: 'music-fixture',
        profileId: 'legacy-music',
        prompt: '旧版请求',
        durationSeconds: 30,
        instrumental: false
      })
    ).toMatchObject({ durationSeconds: 30, instrumental: false });
  });

  it.each([
    { prompt: '' },
    { prompt: 'x'.repeat(1001) },
    { parameters: { durationSeconds: 0, instrumental: true } },
    { parameters: { durationSeconds: 301, instrumental: true } },
    { parameters: { durationSeconds: 30, instrumental: 'yes' } },
    { parameters: { durationSeconds: 30, instrumental: true, upstreamUrl: 'https://private.invalid' } },
    { url: 'https://private.invalid' }
  ])('rejects unbounded or private music parameters %#', patch => {
    expect(() => validateMusicJobRequest({ ...request, ...patch })).toThrow();
  });

  it('validates actual audio output limits separately from the legacy TTS limit', () => {
    expect(validateAudioResultMetadata(result, 32 * 1024 * 1024, 300_000)).toEqual(result);
    expect(() =>
      validateAudioResultMetadata({ ...result, bytes: 32 * 1024 * 1024 + 1 }, 32 * 1024 * 1024, 300_000)
    ).toThrow();
  });

  it('validates a music summary, unique catalog options and unknown-field rejection', () => {
    expect(validateMusicGenerationJobSummary(summary).result).toEqual(result);
    expect(validateMusicGenerationOptions([option])).toEqual([option]);
    expect(() => validateMusicGenerationOptions([option, option])).toThrow();
    expect(() => validateMusicGenerationOptions([{ ...option, formats: ['mp3'] }])).toThrow();
  });
});
