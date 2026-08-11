import { afterEach, describe, expect, it, vi } from 'vitest';

afterEach(() => {
  vi.unstubAllGlobals();
  vi.resetModules();
});

describe('uint8ArrayToString', () => {
  it('导入模块时不读取 TextDecoder', async () => {
    vi.stubGlobal('TextDecoder', undefined);
    vi.resetModules();

    const module = await import('../../binary/uint8ArrayToString.js');

    expect(() => module.uint8ArrayToString(new Uint8Array())).toThrow();
  });
});
