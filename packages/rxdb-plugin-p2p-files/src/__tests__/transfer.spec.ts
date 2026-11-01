import { describe, expect, it, vi } from 'vitest';
import { createP2PFileManifest, digestSha256Hex } from '../chunking.js';
import { createChunkRequestHandler, transferP2PFile, type P2PChunkSource } from '../transfer.js';

async function fixture(): Promise<{
  manifest: Awaited<ReturnType<typeof createP2PFileManifest>>;
  bytes: Uint8Array;
}> {
  const bytes = new Uint8Array([1, 2, 3, 4, 5, 6]);
  return {
    bytes,
    manifest: await createP2PFileManifest({
      fileName: 'x',
      size: bytes.byteLength,
      chunkSize: 3,
      readChunk: async (offset, size) => bytes.slice(offset, offset + size)
    })
  };
}

describe('P2P transfer', () => {
  it('switches away from a bad peer and resumes completed chunks', async () => {
    const { manifest, bytes } = await fixture();
    const bad: P2PChunkSource = { id: 'bad', requestChunk: async () => new Uint8Array([0, 0, 0]) };
    const good: P2PChunkSource = {
      id: 'good',
      requestChunk: async request => bytes.slice(request.offset, request.offset + request.size)
    };
    const stored = new Map<number, Uint8Array>([[0, bytes.slice(0, 3)]]);
    const progress: number[] = [];
    const result = await transferP2PFile({
      manifest,
      sources: [bad, good],
      completedChunks: [0],
      writeChunk: async (index, chunk) => void stored.set(index, chunk),
      readChunk: async index => stored.get(index) ?? new Uint8Array(),
      maxAttemptsPerChunk: 4,
      onProgress: value => progress.push(value.completedChunks)
    });
    expect(result.completedChunks).toBe(2);
    expect(result.sourcesUsed).toEqual(['good']);
    expect(progress.at(-1)).toBe(2);
  });

  it('rejects when all peers are bad', async () => {
    const { manifest } = await fixture();
    await expect(
      transferP2PFile({
        manifest,
        sources: [{ id: 'bad', requestChunk: async () => new Uint8Array([9, 9, 9]) }],
        writeChunk: vi.fn(),
        maxAttemptsPerChunk: 2
      })
    ).rejects.toThrow(/unable to transfer chunk/);
  });

  it('serves requested byte ranges only for the advertised content', async () => {
    const { manifest, bytes } = await fixture();
    const handler = createChunkRequestHandler(manifest, async (offset, size) => bytes.slice(offset, offset + size));
    const { contentHash } = manifest;
    await expect(handler({ contentHash, offset: 0, size: 3 })).resolves.toEqual(bytes.slice(0, 3));
    await expect(handler({ contentHash, offset: 1, size: 4 })).resolves.toEqual(bytes.slice(1, 5));
    await expect(
      handler({ contentHash: await digestSha256Hex(new Uint8Array([8])), offset: 0, size: 3 })
    ).rejects.toThrow(/not served/);
    await expect(handler({ contentHash, offset: 5, size: 3 })).rejects.toThrow(/outside the file/);
    await expect(handler({ contentHash, offset: 0, size: 0 })).rejects.toThrow(RangeError);
    const shortRead = createChunkRequestHandler(manifest, async () => bytes.slice(0, 2));
    await expect(shortRead({ contentHash, offset: 0, size: 3 })).rejects.toThrow(/expected 3/);
  });
});
