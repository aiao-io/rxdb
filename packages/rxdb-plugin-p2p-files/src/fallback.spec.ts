import { describe, expect, it, vi } from 'vitest';
import { createP2PFileManifest } from './chunking';
import { downloadFromServer, downloadP2PFile } from './fallback';

async function fixture() {
  const bytes = new Uint8Array(2050);
  bytes.forEach((_, index) => {
    bytes[index] = index % 251;
  });
  const manifest = await createP2PFileManifest({
    fileName: 'server.bin',
    size: bytes.byteLength,
    chunkSize: 1024,
    readChunk: async (offset, size) => bytes.slice(offset, offset + size)
  });
  return { bytes, manifest };
}

describe('P2P 服务器回退', () => {
  it('分块读取 Blob，完整校验后再写入，不将整文件载入内存', async () => {
    const { bytes, manifest } = await fixture();
    const blob = new Blob([bytes]);
    const fullRead = vi.spyOn(blob, 'arrayBuffer').mockRejectedValue(new Error('whole-file read is forbidden'));
    const slice = vi.spyOn(blob, 'slice');
    const writes: Uint8Array[] = [];
    const result = await downloadFromServer({
      manifest,
      fallback: { download: async () => blob },
      writeChunk: async (_index, chunk) => {
        writes.push(chunk);
      }
    });
    expect(result.bytesTransferred).toBe(bytes.byteLength);
    expect(fullRead).not.toHaveBeenCalled();
    expect(slice).toHaveBeenCalled();
    expect(slice.mock.calls.every(([start = 0, end = blob.size]) => end - start <= manifest.chunkSize)).toBe(true);
    expect(Uint8Array.from(writes.flatMap(chunk => [...chunk]))).toEqual(bytes);
  });

  it('整文件哈希或末块校验失败时不写入已验证的前块', async () => {
    const { bytes, manifest } = await fixture();
    const writeChunk = vi.fn(async () => undefined);
    await expect(
      downloadFromServer({
        manifest: { ...manifest, contentHash: '0'.repeat(64) },
        fallback: { download: async () => new Blob([bytes]) },
        writeChunk
      })
    ).rejects.toThrow('contentHash does not match');
    const corrupted = bytes.slice();
    corrupted[corrupted.length - 1] ^= 1;
    await expect(
      downloadFromServer({ manifest, fallback: { download: async () => corrupted }, writeChunk })
    ).rejects.toThrow('chunk 2 does not match');
    expect(writeChunk).not.toHaveBeenCalled();
  });

  it('校验并按块写入 Uint8Array 或 Blob 响应', async () => {
    const { bytes, manifest } = await fixture();
    const writes: Uint8Array[] = [];
    const progress: string[] = [];
    const fallback = {
      download: async ({ token }: { token?: string }) => {
        expect(token).toBe('auth-token');
        return new Blob([bytes]);
      }
    };
    const result = await downloadFromServer({
      manifest,
      fallback,
      token: 'auth-token',
      writeChunk: async (_index, chunk) => writes.push(chunk),
      onProgress: value => progress.push(`${value.route}:${value.completedChunks}`)
    });
    expect(result.sourcesUsed).toEqual(['server']);
    expect(result.completedChunks).toBe(3);
    expect(Uint8Array.from(writes.flatMap(chunk => [...chunk]))).toEqual(bytes);
    expect(progress).toEqual(['server:1', 'server:2', 'server:3']);
  });

  it('响应校验失败时不落盘，并在无 peer 时走显式回退', async () => {
    const { bytes, manifest } = await fixture();
    const writeChunk = vi.fn(async () => undefined);
    await expect(
      downloadFromServer({
        manifest,
        fallback: { download: async () => bytes.slice(0, -1) },
        writeChunk
      })
    ).rejects.toThrow('size does not match');
    expect(writeChunk).not.toHaveBeenCalled();

    const routes: string[] = [];
    await expect(
      downloadP2PFile({
        manifest,
        sources: [],
        fallback: { download: async () => bytes },
        writeChunk: async () => undefined,
        onProgress: progress => routes.push(progress.route)
      })
    ).resolves.toMatchObject({ sourcesUsed: ['server'] });
    expect(routes.every(route => route === 'server')).toBe(true);
    await expect(downloadP2PFile({ manifest, sources: [], writeChunk: async () => undefined })).rejects.toThrow(
      'no peer source is available'
    );
  });

  it('有 peer 时不调用服务器并报告 p2p 路由', async () => {
    const { manifest, bytes } = await fixture();
    const server = vi.fn(async () => bytes);
    const progress: string[] = [];
    await expect(
      downloadP2PFile({
        manifest,
        sources: [
          {
            id: 'peer',
            requestChunk: async (_hash, index) =>
              bytes.slice(index * manifest.chunkSize, (index + 1) * manifest.chunkSize)
          }
        ],
        fallback: { download: server },
        writeChunk: async () => undefined,
        onProgress: value => progress.push(value.route)
      })
    ).resolves.toMatchObject({ sourcesUsed: ['peer'] });
    expect(server).not.toHaveBeenCalled();
    expect(progress.every(route => route === 'p2p')).toBe(true);
  });

  it('peer 全部不可用时回退服务器并校验服务器内容', async () => {
    const { manifest, bytes } = await fixture();
    const server = vi.fn(async () => bytes);
    const result = await downloadP2PFile({
      manifest,
      sources: [{ id: 'offline', requestChunk: async () => new Uint8Array(1024) }],
      fallback: { download: server },
      writeChunk: async () => undefined
    });
    expect(result.sourcesUsed).toEqual(['server']);
    expect(server).toHaveBeenCalledOnce();
  });
});
