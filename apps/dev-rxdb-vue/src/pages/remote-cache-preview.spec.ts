import { describe, expect, it } from 'vitest';
import { resolveRemoteCachePreviewKind } from './remote-cache-preview';

describe('resolveRemoteCachePreviewKind', () => {
  it.each([
    ['image/png', 'image'],
    ['audio/mpeg', 'audio'],
    ['video/mp4', 'video'],
    ['text/plain', 'text'],
    ['application/json', 'text'],
    ['application/pdf', 'document'],
    ['application/octet-stream', 'download']
  ] as const)('maps %s to %s', (mimeType, expected) => {
    expect(resolveRemoteCachePreviewKind(mimeType)).toBe(expected);
  });
});
