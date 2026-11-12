import { describe, expect, it } from 'vitest';
import { decodeBytes, decodedByteLength, decodeText, encodeBytes, encodeText } from './bytes.js';

describe('DESKTOP-US-503/603 字节校验与大文件编解码', () => {
  it.each(['', 'AA==', 'AP8=', 'AP+A', 'AAAAAA=='])('长度校验与真实解码保持一致 %s', encoded => {
    expect(decodedByteLength(encoded)).toBe(decodeBytes(encoded).length);
    expect(encodeBytes(decodeBytes(encoded))).toBe(encoded);
  });
  it.each(['A', 'AAA', 'A===', '====', '=AAA', 'AA=/', 'AA-=', 'AA_=', 'AA A', '\nAAA'])(
    '拒绝损坏或混入其他格式的字节 %j',
    encoded => {
      expect(() => decodedByteLength(encoded)).toThrow('INVALID');
      expect(() => decodeBytes(encoded)).toThrow('INVALID');
    }
  );
  it('大于 1 MiB 的中文及二进制字节完整往返，不截断 Unicode', () => {
    const text = '中文 🌏\n'.repeat(100000);
    const encoded = encodeText(text);
    expect(decodedByteLength(encoded)).toBe(new TextEncoder().encode(text).length);
    expect(decodeText(encoded)).toBe(text);
    expect(() => decodeText('/w==')).toThrow();
  });
});
