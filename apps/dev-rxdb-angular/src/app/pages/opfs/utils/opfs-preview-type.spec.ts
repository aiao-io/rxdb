import { describe, expect, it } from 'vitest';
import { resolveOpfsStringPreviewType } from './opfs-preview-type';

describe('resolveOpfsStringPreviewType', () => {
  it('treats a text MIME string without an extension as text', () => {
    expect(resolveOpfsStringPreviewType('unknown', 'text/plain')).toBe('text');
  });

  it('preserves code classification for text MIME strings', () => {
    expect(resolveOpfsStringPreviewType('code', 'text/plain')).toBe('code');
  });

  it('does not classify non-text string previews as text', () => {
    expect(resolveOpfsStringPreviewType('unknown', 'application/octet-stream')).toBe('unknown');
  });
});
