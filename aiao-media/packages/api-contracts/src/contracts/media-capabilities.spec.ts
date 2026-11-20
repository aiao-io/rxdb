import { describe, expect, it } from 'vitest';
import { validateMediaCapabilityCatalog } from './media-capabilities';

const id = '10000000-0000-4000-8000-000000000021';
const base = {
  providerInstanceId: id,
  providerRevision: 1,
  kind: 'audio' as const,
  operation: 'text-to-speech' as const,
  label: '平台配音',
  modelId: 'tts-fixture',
  credits: 2,
  input: { textMaxLength: 500 },
  parameters: {
    languages: ['zh-CN', 'en-US'],
    voices: [{ id: 'voice-a', label: '女声' }],
    speeds: [0.8, 1, 1.2]
  },
  output: { mediaTypes: ['audio/wav'] as ['audio/wav'], maxBytes: 8 * 1024 * 1024, maxDurationMs: 120_000 }
};

const catalog = {
  revision: 12,
  capabilities: [base]
};

describe('media capability catalog', () => {
  it('accepts the public TTS catalog shape and clones it', () => {
    const result = validateMediaCapabilityCatalog(catalog);
    expect(result).toEqual(catalog);
    expect(result).not.toBe(catalog);
  });

  it.each([
    { revision: 0 },
    { capabilities: [{ ...base, credits: 0 }] },
    { capabilities: [{ ...base, baseUrl: 'https://provider.invalid' }] },
    { capabilities: [{ ...base, apiKeyRef: 'secret' }] },
    { capabilities: [{ ...base, operation: 'text-to-image' }] },
    { capabilities: [{ ...base, output: { ...base.output, mediaTypes: ['audio/mp3'] } }] },
    { capabilities: [{ ...base, parameters: { ...base.parameters, speeds: [0] } }] }
  ])('rejects private fields, unsupported operations and invalid bounds %#', patch => {
    expect(() => validateMediaCapabilityCatalog({ ...catalog, ...patch })).toThrow();
  });

  it('requires a unique provider instance, revision, model and operation key', () => {
    expect(() => validateMediaCapabilityCatalog({ ...catalog, capabilities: [base, base] })).toThrow();
  });

  it('accepts the four supported public operation shapes', () => {
    expect(
      validateMediaCapabilityCatalog({
        revision: 1,
        capabilities: [
          base,
          {
            ...base,
            operation: 'speech-to-text',
            modelId: 'asr-fixture',
            input: { mediaTypes: ['audio/wav'], maxBytes: 16 * 1024 * 1024, maxDurationMs: 600_000 },
            parameters: { languages: ['zh-CN'] },
            output: { mediaTypes: ['application/json'] }
          },
          {
            ...base,
            operation: 'text-to-music',
            modelId: 'music-fixture',
            input: { textMaxLength: 1000 },
            parameters: { durationsSeconds: [30], instrumental: [true, false] },
            output: { mediaTypes: ['audio/wav'], maxBytes: 32 * 1024 * 1024, maxDurationMs: 300_000 }
          },
          {
            ...base,
            kind: 'video',
            operation: 'text-to-video',
            modelId: 'video-fixture',
            input: { textMaxLength: 1000 },
            parameters: { ratios: ['16:9'], durationsSeconds: [5], resolutions: ['768P'] },
            output: { mediaTypes: ['video/mp4'], maxBytes: 64 * 1024 * 1024, maxDurationMs: 15_000 }
          }
        ]
      }).capabilities
    ).toHaveLength(4);
  });
});
