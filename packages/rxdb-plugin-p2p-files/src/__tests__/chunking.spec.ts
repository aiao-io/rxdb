import { describe, expect, it } from 'vitest';
import {
  DEFAULT_P2P_CHUNK_SIZE,
  createP2PFileManifest,
  describeChunk,
  describeChunks,
  sha256Hex,
  verifyChunk,
  verifyContentHash
} from '../chunking.js';

describe('P2P chunking', () => {
  it('creates a content-addressed manifest with a short final chunk', async () => {
    const input = new Uint8Array(DEFAULT_P2P_CHUNK_SIZE + 3);
    input.fill(7);
    const manifest = await createP2PFileManifest({
      fileName: 'demo.bin',
      size: input.byteLength,
      readChunk: async (offset, size) => input.slice(offset, offset + size)
    });
    expect(manifest.chunkHashes).toHaveLength(2);
    expect(describeChunks(manifest).map(chunk => chunk.size)).toEqual([DEFAULT_P2P_CHUNK_SIZE, 3]);
    expect(manifest.contentHash).toBe(await sha256Hex(input));
  });

  it('rejects inconsistent manifests and invalid chunks', async () => {
    const hash = await sha256Hex(new Uint8Array([1]));
    const manifest = { size: 1, chunkSize: 1024, chunkHashes: [hash] };
    expect(() => describeChunk(manifest, 1)).toThrow(RangeError);
    expect(await verifyChunk(new Uint8Array([2]), { size: 1, hash })).toBe(false);
    await expect(createP2PFileManifest({ fileName: 'x', size: 2, chunkSize: 1024, readChunk: async () => new Uint8Array([1]) })).rejects.toThrow(
      RangeError
    );
  });

  it('verifies the complete file hash from chunks', async () => {
    const chunks = [new Uint8Array([1, 2]), new Uint8Array([3])];
    expect(await verifyContentHash(chunks, await sha256Hex(new Uint8Array([1, 2, 3])))).toBe(true);
  });
});
