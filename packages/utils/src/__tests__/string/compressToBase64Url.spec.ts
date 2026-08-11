import { afterEach, describe, expect, it, vi } from 'vitest';
import { compressToBase64Url } from '../../string/compressToBase64Url.js';
import { decompressFromBase64Url } from '../../string/decompressFromBase64Url.js';

describe('compressToBase64Url', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });
  it('rejects with a clear error when CompressionStream is unavailable', async () => {
    vi.stubGlobal('CompressionStream', undefined);
    await expect(compressToBase64Url('value')).rejects.toThrow(
      'CompressionStream is not available in this environment'
    );
  });

  it('1', async () => {
    const result = await compressToBase64Url(
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
    expect(result).toEqual('eJyrVkpUsjLUUUpSsqpWSjY0MjY0Mk5MSUtMKU4Diw-krKGRcS0YAADm3ywC');
  });

  it('should round-trip large payloads', async () => {
    const source = JSON.stringify({ text: 'abcdefg'.repeat(8_000) });
    const compressed = await compressToBase64Url(source);
    const decompressed = await decompressFromBase64Url(compressed);
    expect(decompressed).toBe(source);
  }, 10_000);

  // UTL-002：两条路径都先 await writer.write()+writer.close()，之后才开始读 readable。
  // 输出超过 TransformStream 内部队列高水位时，writer 等读端泄压、读端却还没启动 —— 互等死锁。
  // 上面那个「large payload」用例用的是高度可压缩数据（'abcdefg' 重复），
  // 压缩输出远低于高水位，**压根不触发这条路径**。这里必须用不可压缩数据。
  it('should not deadlock on incompressible payloads exceeding the stream high-water mark', async () => {
    // 伪随机但确定性：避免测试 flaky，同时保证几乎不可压缩
    let seed = 0x2f6e2b1;
    const chars: string[] = [];
    for (let i = 0; i < 200_000; i++) {
      seed = (seed * 1103515245 + 12345) & 0x7fffffff;
      chars.push(String.fromCharCode(32 + (seed % 95)));
    }
    const source = chars.join('');

    const compressed = await compressToBase64Url(source);
    const decompressed = await decompressFromBase64Url(compressed);

    expect(decompressed).toBe(source);
  }, 15_000);
});
