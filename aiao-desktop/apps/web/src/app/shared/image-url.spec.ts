import { describe, expect, it } from 'vitest';

import { MAX_IMAGE_BYTES, imageDataUrl } from './image-url';

const decode = (url: string): Uint8Array => {
  const base64 = url.slice(url.indexOf(',') + 1);
  return Uint8Array.from(atob(base64), char => char.charCodeAt(0));
};

describe('imageDataUrl：把图片字节放进 data: 地址', () => {
  it('带上 MIME 类型与 base64 内容', () => {
    expect(imageDataUrl(new Uint8Array([0x89, 0x50, 0x4e, 0x47]), 'image/png')).toBe('data:image/png;base64,iVBORw==');
  });

  it('空内容也是合法的 data: 地址', () => {
    expect(imageDataUrl(new Uint8Array(), 'image/jpeg')).toBe('data:image/jpeg;base64,');
  });

  it('跨过分块边界的大数组往返一致（没有丢字节、没有溢出调用栈）', () => {
    const bytes = Uint8Array.from({ length: 300_001 }, (_, index) => (index * 31) % 256);
    const url = imageDataUrl(bytes, 'image/png');
    expect(url.startsWith('data:image/png;base64,')).toBe(true);
    expect(decode(url)).toEqual(bytes);
  });

  it('超过上限直接报错，不去拼一个巨大的字符串', () => {
    expect(() => imageDataUrl(new Uint8Array(MAX_IMAGE_BYTES + 1), 'image/png')).toThrow(/too large/i);
  });
});
