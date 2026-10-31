import { describe, expect, it } from 'vitest';
import {
  GenerationProtocolError,
  validateVideoGenerationJobSummary,
  validateVideoGenerationOptions,
  validateVideoJobRequest,
  validateVideoResultMetadata,
  VIDEO_MP4_MAX_BYTES
} from './index';
const request = {
  kind: 'video',
  operation: 'text-to-video',
  providerInstanceId: '10000000-0000-4000-8000-000000000001',
  providerRevision: 1,
  modelId: 'MiniMax-H3-Max',
  profileId: 'minimax-h3-max-text-768p-5s-16x9-v2',
  prompt: ' 安全视频描述 '
};
const metadata = {
  mediaType: 'video/mp4',
  format: 'mp4',
  codec: 'h264',
  width: 32,
  height: 18,
  durationMs: 5000,
  bytes: 1833
};
const option = {
  providerInstanceId: request.providerInstanceId,
  providerRevision: 1,
  providerName: 'Fixture',
  providerType: 'minimax',
  modelId: request.modelId,
  operation: request.operation,
  profileId: request.profileId,
  maxTextLength: 1000,
  durationSeconds: 5,
  resolution: '768P',
  ratio: '16:9',
  format: 'mp4'
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
describe('strict video protocol, not capability evidence', () => {
  it('preserves the instance/revision/model/profile and trims only public prompt text', () => {
    expect(validateVideoJobRequest(request)).toEqual({
      ...request,
      prompt: '安全视频描述'
    });
  });
  it.each([
    { prompt: '' },
    { prompt: 'x'.repeat(1001) },
    { kind: 'image' },
    { operation: 'reference-image' },
    { providerRevision: 0 },
    { providerInstanceId: 'unsafe' },
    { taskId: 'private-receipt' },
    { callback: 'https://unsafe.invalid' },
    { referenceImageId: request.providerInstanceId },
    { url: 'https://unsafe.invalid' }
  ])('rejects unexpected request parameters %j', change => {
    expect(() => validateVideoJobRequest({ ...request, ...change })).toThrow(GenerationProtocolError);
  });
  it('requires bounded actual MP4 metadata, clones it, and refuses claimed URLs/paths', () => {
    expect(validateVideoResultMetadata(metadata)).toEqual(metadata);
    expect(validateVideoResultMetadata(metadata)).not.toBe(metadata);
    for (const patch of [
      { codec: 'h265' },
      { width: 0 },
      { width: 4097 },
      { durationMs: 0 },
      { durationMs: 15_001 },
      { bytes: VIDEO_MP4_MAX_BYTES + 1 },
      { url: 'private' }
    ])
      expect(() => validateVideoResultMetadata({ ...metadata, ...patch })).toThrow(GenerationProtocolError);
  });
  it('keeps catalog profiles unique and bounded, never accepting an upstream query URL', () => {
    expect(validateVideoGenerationOptions([option])).toEqual([option]);
    for (const bad of [
      [option, option],
      [{ ...option, durationSeconds: 6 }],
      [{ ...option, queryUrl: 'private' }],
      [{ ...option, resolution: '2K' }]
    ])
      expect(() => validateVideoGenerationOptions(bad)).toThrow(GenerationProtocolError);
  });
  it('rejects every C0 control and DEL in public provider labels, preserving normal Unicode', () => {
    for (const code of [...Array.from({ length: 32 }, (_, index) => index), 127])
      expect(() =>
        validateVideoGenerationOptions([
          {
            ...option,
            providerName: `Fixture${String.fromCharCode(code)}label`
          }
        ])
      ).toThrow(GenerationProtocolError);
    expect(validateVideoGenerationOptions([{ ...option, providerName: '视频实例 😀' }])[0].providerName).toBe(
      '视频实例 😀'
    );
  });
  it('requires result iff completed and never exposes the private receipt or temporary URL', () => {
    expect(validateVideoGenerationJobSummary(summary).request.prompt).toBe('安全视频描述');
    for (const patch of [
      { result: null },
      { status: 'processing' },
      { taskId: 'private' },
      { privateDownloadUrl: 'private' }
    ])
      expect(() => validateVideoGenerationJobSummary({ ...summary, ...patch })).toThrow(GenerationProtocolError);
    expect(
      validateVideoGenerationJobSummary({
        ...summary,
        status: 'processing',
        result: null
      }).result
    ).toBeNull();
  });
});
