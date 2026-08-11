import { describe, expect, it } from 'vitest';
import { isImageMimeType } from './remote-cache-preview';

describe('isImageMimeType', () => {
  it.each(['image/png', 'image/jpeg', ' IMAGE/WEBP '])('accepts %s', mimeType => {
    expect(isImageMimeType(mimeType)).toBe(true);
  });

  it.each(['text/plain', 'application/pdf', 'audio/mpeg', 'application/octet-stream', ''])('rejects %s', mimeType => {
    expect(isImageMimeType(mimeType)).toBe(false);
  });
});
