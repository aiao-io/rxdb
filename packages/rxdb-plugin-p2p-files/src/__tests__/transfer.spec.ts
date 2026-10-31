import { describe, expect, it, vi } from 'vitest';
import { createP2PFileManifest, sha256Hex } from '../chunking.js';
import { createChunkRequestHandler, transferP2PFile, type P2PChunkSource } from '../transfer.js';

async function fixture(): Promise<{
  manifest: Awaited<ReturnType<typeof createP2PFileManifest>>;
  chunks: Uint8Array[];
}> {
  const chunks = [new Uint8Array([1, 2, 3]), new Uint8Array([4, 5, 6])];
  const bytes = new Uint8Array(chunks.flatMap(chunk => [...chunk]));
  return {
    chunks,
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
    const { manifest, chunks } = await fixture();
    const bad: P2PChunkSource = { id: 'bad', requestChunk: async () => new Uint8Array([0, 0, 0]) };
    const good: P2PChunkSource = { id: 'good', requestChunk: async (_hash, index) => chunks[index] };
    const stored = new Map<number, Uint8Array>([[0, chunks[0]]]);
    const progress: number[] = [];
    const result = await transferP2PFile({
      manifest,
      sources: [bad, good],
      completedChunks: [0],
      writeChunk: async (index, bytes) => void stored.set(index, bytes),
      readChunk: async index => stored.get(index) ?? new Uint8Array(),
      maxAttemptsPerChunk: 4,
      onProgress: value => progress.push(value.completedChunks)
    });
    expect(result.completedChunks).toBe(2);
    expect(result.sourcesUsed).toContain('good');
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

  it('serves only verified chunks for the advertised content', async () => {
    const { manifest, chunks } = await fixture();
    const handler = createChunkRequestHandler(manifest, async index => chunks[index]);
    await expect(handler(manifest.contentHash, 0)).resolves.toEqual(chunks[0]);
    await expect(handler(await sha256Hex(new Uint8Array([8])), 0)).rejects.toThrow(/not served/);
  });
});
