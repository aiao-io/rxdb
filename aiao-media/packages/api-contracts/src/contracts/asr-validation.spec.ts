import { describe, expect, it } from 'vitest';
import {
  validateAsrGenerationJobSummary,
  validateAsrGenerationOptions,
  validateAsrJobRequest,
  validateAudioInputReference,
  validateTranscriptResult
} from './generation-validation';

const providerInstanceId = '10000000-0000-4000-8000-000000000001';
const input = {
  id: '10000000-0000-4000-8000-000000000002',
  mediaType: 'audio/wav',
  bytes: 64044,
  durationMs: 1000,
  sha256: 'a'.repeat(64),
  expiresAt: '2026-10-03T00:00:00.000Z'
};
const request = {
  kind: 'audio' as const,
  operation: 'speech-to-text' as const,
  providerInstanceId,
  providerRevision: 4,
  modelId: 'asr-fixture',
  language: null,
  input
};
const transcript = {
  kind: 'transcript' as const,
  text: '识别结果',
  language: 'zh-CN',
  detectedLanguage: true,
  characters: 4,
  sha256: 'b'.repeat(64)
};
const summary = {
  id: '10000000-0000-4000-8000-000000000003',
  request,
  status: 'completed' as const,
  createdAt: '2026-10-02T00:00:00Z',
  updatedAt: '2026-10-02T00:00:00Z',
  delivery: { status: 'available' as const, expiresAt: '2026-10-03T00:00:00Z', acknowledgedAt: null },
  failure: null,
  result: transcript
};
const option = {
  providerInstanceId,
  providerRevision: 4,
  providerName: '隔离 ASR fixture',
  providerType: 'openai' as const,
  modelId: 'asr-fixture',
  operation: 'speech-to-text' as const,
  profileId: 'asr-fixture-v1',
  inputMediaTypes: ['audio/wav'] as ['audio/wav'],
  maxInputBytes: 16 * 1024 * 1024,
  maxDurationMs: 600_000,
  languages: ['zh-CN', 'en-US']
};

describe('ASR contracts', () => {
  it('accepts an opaque short-lived input reference and clones it', () => {
    const result = validateAudioInputReference(input);
    expect(result).toEqual(input);
    expect(result).not.toBe(input);
    expect(validateAsrJobRequest(request)).toEqual(request);
  });

  it.each([
    { id: 'https://private.invalid/input' },
    { mediaType: 'audio/mp3' },
    { bytes: 16 * 1024 * 1024 + 1 },
    { durationMs: 600_001 },
    { sha256: 'private' },
    { localPath: '/tmp/audio.wav' }
  ])('rejects private or out-of-bound input metadata %#', patch => {
    expect(() => validateAudioInputReference({ ...input, ...patch })).toThrow();
  });

  it.each([
    { language: 'invalid language' },
    { language: 'zh_CN' },
    { operation: 'text-to-speech' },
    { providerInstanceId: 'foreign' },
    { input: { ...input, sha256: 'A'.repeat(64) } },
    { privateUrl: 'https://private.invalid' }
  ])('rejects malformed ASR request fields %#', patch => {
    expect(() => validateAsrJobRequest({ ...request, ...patch })).toThrow();
  });

  it('normalizes transcript text and keeps its Unicode character count', () => {
    expect(validateTranscriptResult({ ...transcript, text: '  识别结果  ', characters: 4 })).toEqual(transcript);
  });

  it.each([
    { text: '' },
    { text: 'x', characters: 2 },
    { language: 'zh_CN' },
    { detectedLanguage: 'yes' },
    { sha256: 'not-a-digest' },
    { url: 'https://private.invalid' }
  ])('rejects invalid transcript results %#', patch => {
    expect(() => validateTranscriptResult({ ...transcript, ...patch })).toThrow();
  });

  it('requires a transcript only for a completed ASR task and validates the catalog option', () => {
    expect(validateAsrGenerationJobSummary(summary).result).toEqual(transcript);
    expect(
      validateAsrGenerationJobSummary({
        ...summary,
        status: 'processing',
        delivery: { status: 'pending', expiresAt: null, acknowledgedAt: null },
        result: null
      }).result
    ).toBeNull();
    expect(validateAsrGenerationOptions([option])).toEqual([option]);
    expect(() => validateAsrGenerationJobSummary({ ...summary, request: { ...request, language: 'zh_CN' } })).toThrow();
    expect(() => validateAsrGenerationOptions([{ ...option, credentials: 'secret' }])).toThrow();
  });
});
