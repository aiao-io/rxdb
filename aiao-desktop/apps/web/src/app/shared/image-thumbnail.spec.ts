import { describe, expect, it, vi } from 'vitest';

import { generateImageThumbnail } from './image-thumbnail';

function browser(width: number, height: number) {
  const original = new Blob(['original'], { type: 'image/png' });
  const png = new Blob(['encoded'], { type: 'image/png' });
  const bitmap = { width, height, close: vi.fn() };
  const decode = vi.fn(async () => bitmap);
  const draw = vi.fn();
  const context = vi.fn<() => { drawImage: typeof draw } | null>(() => ({ drawImage: draw }));
  const encode = vi.fn(async () => png);
  const canvas = vi.fn(function () {
    return { getContext: context, convertToBlob: encode };
  });
  vi.stubGlobal('createImageBitmap', decode);
  vi.stubGlobal('OffscreenCanvas', canvas);
  return { original, png, bitmap, decode, canvas, draw, context, encode };
}

describe('图片缩放', () => {
  it.each([
    [1600, 900, 512, 288],
    [800, 1600, 256, 512],
    [1, 3000, 1, 512],
    [20, 15, 20, 15]
  ])('把 %i × %i 缩成 %i × %i', async (width, height, thumbWidth, thumbHeight) => {
    const { original, png, bitmap, decode, canvas, draw, encode } = browser(width, height);
    expect(await generateImageThumbnail(original)).toBe(png);
    expect(decode).toHaveBeenCalledExactlyOnceWith(original);
    expect(canvas).toHaveBeenCalledExactlyOnceWith(thumbWidth, thumbHeight);
    expect(draw).toHaveBeenCalledExactlyOnceWith(bitmap, 0, 0, thumbWidth, thumbHeight);
    expect(encode).toHaveBeenCalledExactlyOnceWith({ type: 'image/png' });
    expect(bitmap.close).toHaveBeenCalledTimes(1);
  });

  it('画布不可用或编码失败时释放已解码的原图', async () => {
    const { original, bitmap, context, encode } = browser(600, 300);
    context.mockReturnValueOnce(null);
    await expect(generateImageThumbnail(original)).rejects.toThrow('2D canvas');
    encode.mockRejectedValueOnce(new Error('encoding failed'));
    await expect(generateImageThumbnail(original)).rejects.toThrow('encoding failed');
    expect(bitmap.close).toHaveBeenCalledTimes(2);
  });
});
