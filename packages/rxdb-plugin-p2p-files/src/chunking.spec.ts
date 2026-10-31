import {
  createP2PFileManifest,
  describeChunk,
  describeChunks,
  sha256Hex,
  verifyChunk,
  verifyContentHash
} from './chunking';

const bytes = (length: number, start = 0): Uint8Array =>
  Uint8Array.from({ length }, (_, index) => (start + index) % 256);

describe('P2P 分块原语', () => {
  it('按固定大小描述末块，并拒绝越界块', () => {
    const manifest = {
      size: 2050,
      chunkSize: 1024,
      chunkHashes: ['a', 'b', 'c']
    } as const;

    expect(describeChunks(manifest)).toEqual([
      { index: 0, offset: 0, size: 1024, hash: 'a' },
      { index: 1, offset: 1024, size: 1024, hash: 'b' },
      { index: 2, offset: 2048, size: 2, hash: 'c' }
    ]);
    expect(() => describeChunk(manifest, 3)).toThrow(RangeError);
  });

  it('允许零字节文件且要求清单没有块', () => {
    expect(describeChunks({ size: 0, chunkSize: 1024, chunkHashes: [] })).toEqual([]);
  });

  it('拒绝与文件大小不匹配的块清单和非法块大小', () => {
    expect(() => describeChunks({ size: 2050, chunkSize: 1024, chunkHashes: ['a'] })).toThrow(
      'chunkHashes length does not match file size'
    );
    expect(() => describeChunks({ size: 1, chunkSize: 0, chunkHashes: ['a'] })).toThrow(RangeError);
  });

  it('创建清单时校验每次读取的长度，并计算块哈希与内容哈希', async () => {
    const source = bytes(2050, 9);
    const manifest = await createP2PFileManifest({
      fileName: 'demo.bin',
      size: source.byteLength,
      chunkSize: 1024,
      readChunk: async (offset, size) => source.slice(offset, offset + size)
    });

    expect(manifest.fileName).toBe('demo.bin');
    expect(manifest.chunkHashes).toEqual([
      await sha256Hex(source.slice(0, 1024)),
      await sha256Hex(source.slice(1024, 2048)),
      await sha256Hex(source.slice(2048))
    ]);
    expect(manifest.contentHash).toBe(await sha256Hex(source));
  });

  it('读取器返回短块时立即失败', async () => {
    await expect(
      createP2PFileManifest({
        fileName: 'broken.bin',
        size: 4,
        chunkSize: 1024,
        readChunk: async () => bytes(3)
      })
    ).rejects.toThrow('readChunk returned 3 bytes, expected 4');
  });

  it('丢弃长度或哈希错误的块，并通过正确块', async () => {
    const expected = bytes(4);
    const hash = await sha256Hex(expected);

    await expect(verifyChunk(bytes(3), { size: 4, hash })).resolves.toBe(false);
    await expect(verifyChunk(bytes(4, 1), { size: 4, hash })).resolves.toBe(false);
    await expect(verifyChunk(expected, { size: 4, hash })).resolves.toBe(true);
  });

  it('按块顺序重组后校验完整内容哈希', async () => {
    const first = bytes(4, 1);
    const second = bytes(2, 8);
    const expectedHash = await sha256Hex(Uint8Array.from([...first, ...second]));

    await expect(verifyContentHash([first, second], expectedHash)).resolves.toBe(true);
    await expect(verifyContentHash([first, bytes(2, 9)], expectedHash)).resolves.toBe(false);
  });
});
