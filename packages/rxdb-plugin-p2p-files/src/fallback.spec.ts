import { describe, expect, it, vi } from 'vitest';
import { createP2PFileManifest } from './chunking.js';
import { downloadFromServer, downloadP2PFile } from './fallback.js';
import { P2PTransferError, type P2PChunkRequest } from './transfer.js';

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

const sliceOf = (bytes: Uint8Array, request: P2PChunkRequest): Uint8Array =>
  bytes.slice(request.offset, request.offset + request.size);

/** 内存落盘：可选地在写入时损坏某一块，模拟静默写坏的存储。 */
const memoryStorage = (corruptIndex?: number) => {
  const stored = new Map<number, Uint8Array>();
  return {
    stored,
    writeChunk: vi.fn(async (index: number, chunk: Uint8Array) => {
      stored.set(index, index === corruptIndex ? chunk.slice(1) : chunk.slice());
    }),
    readChunk: async (index: number): Promise<Uint8Array> => {
      const chunk = stored.get(index);
      if (!chunk) throw new Error(`chunk ${index} is not stored`);
      return chunk;
    }
  };
};

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
      writeChunk: async (_index, chunk) => {
        writes.push(chunk);
      },
      onProgress: value => progress.push(`${value.route}:${value.completedChunks}`)
    });
    expect(result.sourcesUsed).toEqual(['server']);
    expect(result.completedChunks).toBe(3);
    expect(Uint8Array.from(writes.flatMap(chunk => [...chunk]))).toEqual(bytes);
    expect(progress).toEqual(['server:1', 'server:2', 'server:3']);
  });

  it('提供 readChunk 时读回复核落盘结果，存储写坏就报不可重试的错误', async () => {
    const { bytes, manifest } = await fixture();
    const storage = memoryStorage(1);
    const failure = await downloadFromServer({
      manifest,
      fallback: { download: async () => bytes },
      writeChunk: storage.writeChunk,
      readChunk: storage.readChunk
    }).catch((error: unknown) => error);
    expect(failure).toBeInstanceOf(P2PTransferError);
    expect((failure as P2PTransferError).message).toMatch(/stored chunk 1 failed verification/);
    expect((failure as P2PTransferError).retryable).toBe(false);
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
        sources: [{ id: 'peer', requestChunk: async request => sliceOf(bytes, request) }],
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

  it('P2P 中途失败回退服务器时，已校验落盘的块不再重写', async () => {
    const { manifest, bytes } = await fixture();
    const storage = memoryStorage();
    const progress: string[] = [];
    const result = await downloadP2PFile({
      manifest,
      sources: [
        {
          id: 'partial',
          requestChunk: async request => (request.offset === 2048 ? new Uint8Array(2) : sliceOf(bytes, request))
        }
      ],
      fallback: { download: async () => bytes },
      writeChunk: storage.writeChunk,
      readChunk: storage.readChunk,
      concurrency: 1,
      onProgress: value => progress.push(`${value.route}:${value.completedChunks}`)
    });
    expect(result.sourcesUsed).toEqual(['server']);
    expect(progress).toContain('p2p:2');
    expect(storage.writeChunk.mock.calls.map(([index]) => index)).toEqual([0, 1, 2]);
    expect(Uint8Array.from([0, 1, 2].flatMap(index => [...(storage.stored.get(index) ?? [])]))).toEqual(bytes);
  });

  it('P2P 写盘失败是存储故障：不回退服务器', async () => {
    const { manifest, bytes } = await fixture();
    const server = vi.fn(async () => bytes);
    await expect(
      downloadP2PFile({
        manifest,
        sources: [{ id: 'peer', requestChunk: async request => sliceOf(bytes, request) }],
        fallback: { download: server },
        writeChunk: async () => {
          throw new Error('disk full');
        }
      })
    ).rejects.toThrow('failed to persist chunk');
    expect(server).not.toHaveBeenCalled();
  });

  it('P2P 落盘复核失败是存储故障：不回退服务器，也不报成功', async () => {
    const { manifest, bytes } = await fixture();
    const storage = memoryStorage(1);
    const server = vi.fn(async () => bytes);
    await expect(
      downloadP2PFile({
        manifest,
        sources: [{ id: 'peer', requestChunk: async request => sliceOf(bytes, request) }],
        fallback: { download: server },
        writeChunk: storage.writeChunk,
        readChunk: storage.readChunk
      })
    ).rejects.toThrow(/stored chunk 1 failed verification/);
    expect(server).not.toHaveBeenCalled();
  });
});
