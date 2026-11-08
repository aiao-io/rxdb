import { Blob as NodeBlob } from 'node:buffer';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { imageExtension, imageMetadata, isImageMimeType, validateImageBlob } from './image-format';

function png(width = 64, height = 32) {
  const bytes = new Uint8Array(33);
  bytes.set([137, 80, 78, 71, 13, 10, 26, 10]);
  const view = new DataView(bytes.buffer);
  view.setUint32(8, 13);
  bytes.set([73, 72, 68, 82], 12);
  view.setUint32(16, width);
  view.setUint32(20, height);
  return bytes;
}
function jpeg(marker = 192, width = 64, height = 32) {
  return new Uint8Array([
    255,
    216,
    255,
    224,
    0,
    4,
    0,
    0,
    255,
    255,
    marker,
    0,
    11,
    8,
    height >> 8,
    height & 255,
    width >> 8,
    width & 255,
    1,
    1,
    17,
    0,
    255,
    218,
    0,
    8,
    1,
    1,
    0,
    0,
    63,
    0,
    0,
    255,
    217
  ]);
}
beforeEach(() => {
  vi.stubGlobal('Blob', NodeBlob);
  vi.stubGlobal(
    'createImageBitmap',
    vi.fn(async () => ({ width: 64, height: 32, close: vi.fn() }))
  );
});
afterEach(() => vi.unstubAllGlobals());

describe('original image formats', () => {
  it.each([
    ['image/png', 'png'],
    ['image/jpeg', 'jpg']
  ] as const)('maps %s to its original extension', (mime, extension) => {
    expect(isImageMimeType(mime)).toBe(true);
    expect(imageExtension(mime)).toBe(extension);
    expect(isImageMimeType('image/jpg')).toBe(false);
  });
  it('reads PNG dimensions without decoding or reading past a sliced buffer', () => {
    const bytes = new Uint8Array(40);
    bytes.set(png(), 7);
    expect(imageMetadata(bytes.subarray(7))).toEqual({ mimeType: 'image/png', width: 64, height: 32 });
    expect(createImageBitmap).not.toHaveBeenCalled();
  });
  it.each([192, 194])('reads JPEG frame %i across application and fill segments', marker => {
    expect(imageMetadata(jpeg(marker))).toEqual({ mimeType: 'image/jpeg', width: 64, height: 32 });
  });
  it.each([
    new Uint8Array(),
    new Uint8Array(16 * 1024 * 1024 + 1),
    png().slice(0, 24),
    new Uint8Array([255, 216, 255, 217]),
    new Uint8Array([255, 216, 255, 224, 0, 100, 255, 217]),
    new Uint8Array([255, 216, 255, 224, 0, 1, 255, 217]),
    new Uint8Array([255, 216, 255, 218, 0, 2, 255, 217]),
    new Uint8Array([255, 216, 0, 192, 0, 11, 255, 217]),
    new Uint8Array([255, 216, 255, 255, 255, 255, 217]),
    jpeg().slice(0, -2),
    png(0),
    png(4097),
    jpeg(192, 0),
    jpeg(194, 4097)
  ])('rejects empty, truncated or excessive content before pixel decoding', bytes => {
    expect(() => imageMetadata(bytes)).toThrow();
    expect(createImageBitmap).not.toHaveBeenCalled();
  });
  it('rejects a PNG header with an invalid IHDR declaration', () => {
    const bytes = png();
    bytes[8] = 1;
    expect(() => imageMetadata(bytes)).toThrow();
    bytes[8] = 0;
    bytes[12] = 0;
    expect(() => imageMetadata(bytes)).toThrow();
  });
  it.each([
    ['image/png', png()],
    ['image/jpeg', jpeg()]
  ] as const)('decodes %s without changing bytes', async (mimeType, bytes) => {
    const blob = new Blob([bytes], { type: mimeType });
    await expect(validateImageBlob(blob)).resolves.toEqual({ mimeType, width: 64, height: 32 });
    expect(new Uint8Array(await blob.arrayBuffer())).toEqual(bytes);
    expect(createImageBitmap).toHaveBeenCalledExactlyOnceWith(blob);
  });
  it.each([
    new Blob([jpeg()], { type: 'image/png' }),
    new Blob([png()], { type: 'image/jpeg' }),
    new Blob([png()], { type: 'image/svg+xml' }),
    new Blob([], { type: 'image/png' })
  ])('rejects unsupported or mislabeled MIME before decoding', async blob => {
    await expect(validateImageBlob(blob)).rejects.toThrow();
    expect(createImageBitmap).not.toHaveBeenCalled();
  });
  it('enforces the caller byte limit before decoding', async () => {
    await expect(validateImageBlob(new Blob([png()], { type: 'image/png' }), 32)).rejects.toThrow('大小');
    expect(createImageBitmap).not.toHaveBeenCalled();
  });
  it('rejects a damaged body even when its header looks valid', async () => {
    vi.mocked(createImageBitmap).mockRejectedValue(new Error('decode'));
    await expect(validateImageBlob(new Blob([jpeg()], { type: 'image/jpeg' }))).rejects.toThrow('无法解码');
  });
  it('closes a decoded bitmap when dimensions disagree with its header', async () => {
    const close = vi.fn();
    vi.mocked(createImageBitmap).mockResolvedValue({ width: 32, height: 64, close } as unknown as ImageBitmap);
    await expect(validateImageBlob(new Blob([jpeg()], { type: 'image/jpeg' }))).rejects.toThrow('尺寸');
    expect(close).toHaveBeenCalledOnce();
  });
});
