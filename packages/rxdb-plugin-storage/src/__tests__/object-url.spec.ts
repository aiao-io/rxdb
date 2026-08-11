import { describe, expect, it, vi } from 'vitest';
import { ObjectUrlRegistry } from '../object-url.js';

describe('ObjectUrlRegistry', () => {
  it('should track and revoke object urls', () => {
    const createImpl = vi.fn(() => 'blob:test-1');
    const revokeImpl = vi.fn();
    const registry = new ObjectUrlRegistry(createImpl, revokeImpl);

    const url = registry.create(new Blob(['demo'], { type: 'text/plain' }));

    expect(url).toBe('blob:test-1');
    expect(registry.size).toBe(1);

    registry.revoke(url);

    expect(revokeImpl).toHaveBeenCalledWith('blob:test-1');
    expect(registry.size).toBe(0);
  });

  it('should create disposable previews', () => {
    const revokeImpl = vi.fn();
    const registry = new ObjectUrlRegistry(() => 'blob:test-2', revokeImpl);

    const preview = registry.createPreview(new Blob(['demo'], { type: 'image/png' }));
    preview.dispose();

    expect(preview.url).toBe('blob:test-2');
    expect(preview.type).toBe('image/png');
    expect(revokeImpl).toHaveBeenCalledWith('blob:test-2');
  });

  it('should use platform URL defaults, fallback MIME type, and ignore unknown urls', () => {
    const originalUrl = globalThis.URL;
    const createObjectURL = vi.fn(() => 'blob:default');
    const revokeObjectURL = vi.fn();

    Object.defineProperty(globalThis, 'URL', {
      value: { createObjectURL, revokeObjectURL },
      configurable: true
    });

    try {
      const registry = new ObjectUrlRegistry();
      const preview = registry.createPreview(new Blob(['demo']));

      expect(preview.type).toBe('application/octet-stream');
      expect(createObjectURL).toHaveBeenCalledOnce();

      registry.revoke('blob:unknown');
      expect(revokeObjectURL).not.toHaveBeenCalled();

      preview.dispose();
      expect(revokeObjectURL).toHaveBeenCalledWith('blob:default');
    } finally {
      Object.defineProperty(globalThis, 'URL', {
        value: originalUrl,
        configurable: true
      });
    }
  });
});
