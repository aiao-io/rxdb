import { describe, expect, it } from 'vitest';
import { validateAudioResultMetadata, validateVideoResultMetadata } from './generation-validation';

const audio = {
  kind: 'audio' as const,
  mediaType: 'audio/wav' as const,
  format: 'wav' as const,
  durationMs: 1000,
  sampleRate: 32000 as const,
  channels: 1 as const,
  bytes: 64044,
  sha256: 'd'.repeat(64)
};
const video = {
  kind: 'video' as const,
  mediaType: 'video/mp4' as const,
  format: 'mp4' as const,
  codec: 'h264' as const,
  width: 768,
  height: 432,
  durationMs: 5000,
  bytes: 1833,
  sha256: 'e'.repeat(64)
};

describe('media result manifests', () => {
  it('accepts and clones actual audio metadata with a digest', () => {
    expect(validateAudioResultMetadata(audio)).toEqual(audio);
    expect(validateAudioResultMetadata(audio)).not.toBe(audio);
  });

  it('accepts and clones actual video metadata with a digest', () => {
    expect(validateVideoResultMetadata(video)).toEqual(video);
    expect(validateVideoResultMetadata(video)).not.toBe(video);
  });

  it.each([
    { kind: 'video' },
    { sha256: 'private-url' },
    { bytes: 64043 },
    { mediaType: 'audio/mp3' },
    { url: 'https://provider.invalid/result' }
  ])('rejects unverifiable audio manifests %#', patch => {
    expect(() => validateAudioResultMetadata({ ...audio, ...patch })).toThrow();
  });

  it.each([
    { kind: 'audio' },
    { sha256: 'private-url' },
    { codec: 'h265' },
    { width: 0 },
    { durationMs: 0 },
    { url: 'https://provider.invalid/result' }
  ])('rejects unverifiable video manifests %#', patch => {
    expect(() => validateVideoResultMetadata({ ...video, ...patch })).toThrow();
  });

  it('continues to read legacy manifests without digest fields', () => {
    expect(() => validateAudioResultMetadata({ ...audio, kind: undefined, sha256: undefined })).toThrow();
    expect(
      validateAudioResultMetadata({
        mediaType: audio.mediaType,
        format: audio.format,
        durationMs: audio.durationMs,
        sampleRate: audio.sampleRate,
        channels: audio.channels,
        bytes: audio.bytes
      })
    ).toEqual({
      mediaType: audio.mediaType,
      format: audio.format,
      durationMs: audio.durationMs,
      sampleRate: audio.sampleRate,
      channels: audio.channels,
      bytes: audio.bytes
    });
  });
});
