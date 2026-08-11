import { afterEach, describe, expect, it, vi } from 'vitest';
import { decompressFromBase64Url } from '../../string/decompressFromBase64Url.js';

describe('decompressFromBase64Url', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });
  it('rejects with a clear error when DecompressionStream is unavailable', async () => {
    vi.stubGlobal('DecompressionStream', undefined);
    await expect(decompressFromBase64Url('eJwDAAAAAAE')).rejects.toThrow(
      'DecompressionStream is not available in this environment'
    );
  });

  it('1', async () => {
    const result = await decompressFromBase64Url('eJyrVkpUsjLUUUpSsqpWSjY0MjY0Mk5MSUtMKU4Diw-krKGRcS0YAADm3ywC');
    expect(result).toEqual(
      JSON.stringify({
        a: 1,
        b: {
          c123123adfadsf: 1,
          a: 1,
          b: {
            c123123adfadsf: 1,
            a: 1,
            b: { c123123adfadsf: 1, a: 1, b: { c123123adfadsf: 1, a: 1, b: { c123123adfadsf: 1, a: 1123 } } }
          }
        }
      })
    );
  });
});
