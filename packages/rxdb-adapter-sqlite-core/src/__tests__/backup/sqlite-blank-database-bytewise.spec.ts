/**
 * US-211：比较行字面量不依赖 `TextDecoder('latin1')`。
 *
 * iOS 抖音真机没有原生 TextDecoder，小程序 polyfill 只认 utf-8 / utf-16le；模块顶层构造 latin1 解码器
 * 会让整个 sqlite-core 加载即 RangeError。
 */
import { afterEach, describe, expect, it, vi } from 'vitest';

/** 与小程序 polyfill 一样只认 utf-8，其余编码抛 RangeError。 */
class Utf8OnlyTextDecoder {
  constructor(label = 'utf-8') {
    if (label !== 'utf-8') throw new RangeError(`不支持的 TextDecoder 编码: ${label}`);
  }
  decode(): string {
    return '';
  }
}

const loadModule = () => import('../../backup/sqlite-blank-database.js');

describe('sqlite-blank-database bytewise comparison', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.resetModules();
  });

  it('loads where TextDecoder rejects latin1', async () => {
    vi.stubGlobal('TextDecoder', Utf8OnlyTextDecoder);
    vi.resetModules();
    await expect(loadModule()).resolves.toHaveProperty('describeSqliteDatabase');
  });

  it('maps the 256 byte values to 256 distinct characters', async () => {
    const { bytewiseString } = await loadModule();
    const text = bytewiseString(Uint8Array.from({ length: 256 }, (_, index) => index));
    expect(text).toHaveLength(256);
    expect(new Set(text).size).toBe(256);
  });

  it('keeps byte boundaries: different byte sequences never collide', async () => {
    const { bytewiseString } = await loadModule();
    expect(bytewiseString(new Uint8Array([0xc3, 0xa9]))).not.toBe(bytewiseString(new Uint8Array([0xe9])));
    expect(bytewiseString(new Uint8Array([0x80]))).not.toBe(bytewiseString(new Uint8Array([0x81])));
    expect(bytewiseString(new Uint8Array())).toBe('');
  });

  it('decodes rows larger than the call-argument limit', async () => {
    const { bytewiseString } = await loadModule();
    const bytes = Uint8Array.from({ length: 300_000 }, (_, index) => index % 251);
    const text = bytewiseString(bytes);
    expect(text).toHaveLength(bytes.length);
    expect(text.charCodeAt(299_999)).toBe(299_999 % 251);
  });
});
